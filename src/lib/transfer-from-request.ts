import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureTransferServices } from "@/lib/transfer-services-init";
import { logTransferActivity } from "@/lib/activity";

/**
 * Build a property transfer out of a transfer request.
 *
 * 🔴 EXTRACTED 2026-09-01, and the extraction IS the point. Until now this lived
 * inside the admin approve route, because approval was the only moment a
 * transfer came into existence. The Jukka call moved that moment earlier:
 *
 *   Zewn: "an attorney sends through a request which creates the property
 *   transfer box … and then instead of us approving it before it gets created,
 *   it gets created in a draft state and then we approve it."
 *   Jukka: "That's fine. … Perfect."
 *
 * So two callers now build a transfer — the firm's submission (as `draft`) and
 * approval (as `open`, for any request lodged before this shipped). Two copies
 * of a four-step construction is how the admin and partner matters blocks ended
 * up different shapes one commit apart; one function is the fix.
 *
 * The four steps, in this order and for these reasons:
 *   1. the transfer row;
 *   2. the ACCESS GRANT (052) — written before anything else that matters,
 *      because a transfer the firm cannot open is worse than no transfer;
 *   3. the service checklist, so the transfer arrives complete rather than as
 *      an empty card with a button on it;
 *   4. the conveyancing-attorney party (§92): the firm that asked IS the
 *      attorney and the person who asked is handling it. Both facts are in the
 *      request; before 2026-08-28 neither reached the parties card.
 */
export interface RequestRow {
  id: string;
  firm_id: string;
  requested_by: string | null;
  property_description: string | null;
  municipality: string | null;
  notes: string | null;
  /**
   * The parties as the attorney typed them (055, extended by 088). Optional on
   * the type because a request may legitimately carry none — firms supply what
   * they know — not because a caller may skip selecting the columns.
   */
  seller_name?: string | null;
  seller_email?: string | null;
  seller_cell?: string | null;
  seller_entity_type?: string | null;
  seller_id_number?: string | null;
  seller_registration_no?: string | null;
  buyer_name?: string | null;
  buyer_email?: string | null;
  buyer_cell?: string | null;
  buyer_entity_type?: string | null;
  buyer_id_number?: string | null;
  buyer_registration_no?: string | null;
}

/**
 * The seller and the buyer, from what the firm typed into its request.
 *
 * Zewn, 2026-09-02: "if i entered the details of the buyer and seller when
 * creating the prop trf request then the buyer and seller parties should auto
 * populate." Until now they did not — the request captured six fields that one
 * card on the admin page displayed and nothing ever acted on, so an attorney who
 * filled them in still opened a transfer whose parties read "Not linked yet".
 *
 * 🔴 THEY ARE CAPTURES, NOT CLIENTS, and that is the design rather than a
 * shortcut. Creation moved behind ConveyClear at Meeting 2 (§84) precisely so
 * one vetted client database is maintained and one person does not become three;
 * minting a `clients` row out of a firm's free text is the thing that decision
 * forbids. 050's inline capture is the shape that fits — a named party on the
 * transfer, marked "captured, not a client record", which staff resolve to a
 * real client once they know which one it is.
 *
 * ⚠️ ENTITY TYPE FALLS BACK to `natural_person`, and only as a fallback. 088
 * added the question to the request form — Jukka: "if they select the seller,
 * they need to have three options. Is it an individual, a business, or a trust?"
 * — so a request lodged since then states it. Requests lodged BEFORE it do not,
 * the capture CHECK requires a value, and a natural person is the common case; a
 * wrong fallback costs one edit on a row already flagged as unresolved, whereas
 * dropping the party costs re-typing everything the attorney gave us.
 *
 * The name lands in `full_name` for a person and `business_name` for a company
 * or a trust, because that is how 050 stores an inline capture and how every
 * display path reads one back.
 */
function partiesFromRequest(req: RequestRow) {
  const clean = (v: string | null | undefined) => {
    const t = (v ?? "").trim();
    return t === "" ? null : t;
  };

  return (["seller", "buyer"] as const)
    .map((role) => {
      const isSeller = role === "seller";
      const entityType =
        clean(isSeller ? req.seller_entity_type : req.buyer_entity_type) ?? "natural_person";
      const isPerson = entityType === "natural_person";
      const name = clean(isSeller ? req.seller_name : req.buyer_name);
      return {
        role,
        entity_type: entityType,
        name,
        full_name: isPerson ? name : null,
        business_name: isPerson ? null : name,
        email: clean(isSeller ? req.seller_email : req.buyer_email),
        cell: clean(isSeller ? req.seller_cell : req.buyer_cell),
        id_number: isPerson
          ? clean(isSeller ? req.seller_id_number : req.buyer_id_number)
          : null,
        registration_no: isPerson
          ? null
          : clean(isSeller ? req.seller_registration_no : req.buyer_registration_no),
      };
    })
    // A name is what the capture constraint requires and what makes the row
    // worth having: an email address with nobody attached to it is not a party.
    .filter((p) => p.name !== null)
    .map(({ name: _name, ...p }) => ({
      ...p,
      notes: "Captured from the firm's transfer request — not yet a client record.",
    }));
}

export type BuildResult =
  | { ok: true; transferId: string }
  | { ok: false; status: number; message: string };

export async function createTransferFromRequest(
  admin: SupabaseClient,
  req: RequestRow,
  reference: string,
  callerId: string | null,
  status: "draft" | "open"
): Promise<BuildResult> {
  const { data: transfer, error: createError } = await admin
    .from("property_transfers")
    .insert({
      reference,
      status,
      property_description: req.property_description,
      municipality: req.municipality,
      business_partner_id: req.firm_id,
      notes: req.notes,
      created_by: callerId,
    })
    .select("id")
    .single();

  if (createError || !transfer) {
    const taken = /uq_property_transfers_reference|duplicate key/i.test(createError?.message ?? "");
    return {
      ok: false,
      status: taken ? 409 : 400,
      message: taken
        ? `Reference "${reference}" is already used by another transfer.`
        : createError?.message ?? "Could not create the transfer.",
    };
  }

  // The grant is what actually gives the firm access (052). Written before the
  // request is marked, so a failure here does not leave a request pointing at a
  // transfer its own firm cannot open.
  const { error: grantError } = await admin.from("transfer_access_grants").insert({
    transfer_id: transfer.id,
    firm_id: req.firm_id,
    granted_by: callerId,
    note: `Created from transfer request ${req.id}`,
  });
  if (grantError) {
    return {
      ok: false,
      status: 500,
      message: `Transfer created but access could not be granted: ${grantError.message}`,
    };
  }

  await ensureTransferServices(admin, transfer.id, callerId);

  // Best-effort: a transfer that exists with a granted firm is the outcome that
  // was wanted. Failing here would leave a caller retrying a build that already
  // half-succeeded, which is worse than a party someone adds by hand.
  const { error: partyError } = await admin.from("transfer_parties").insert({
    transfer_id: transfer.id,
    role: "conveyancing_attorney",
    firm_id: req.firm_id,
    contact_user_id: req.requested_by,
  });
  if (partyError) {
    console.error(
      `[transfer-from-request] transfer ${transfer.id} created but the conveyancing-attorney party was not: ${partyError.message}`
    );
  } else {
    await logTransferActivity(admin, {
      transferId: transfer.id,
      activityType: "system",
      body: "Conveyancing attorney set to the requesting firm, from their transfer request.",
      authorId: callerId,
      authorLabel: "ConveyClear",
    });
  }

  // The seller and the buyer the firm typed in. Same best-effort reasoning as
  // the attorney party above: the transfer exists and is accessible, which is
  // what was asked for. Inserted one at a time so a bad seller row does not cost
  // the buyer — the two are independent facts.
  const captured = partiesFromRequest(req);
  for (const p of captured) {
    const { error } = await admin.from("transfer_parties").insert({
      transfer_id: transfer.id,
      ...p,
    });
    if (error) {
      console.error(
        `[transfer-from-request] transfer ${transfer.id}: the ${p.role} from the request was not captured: ${error.message}`
      );
    }
  }
  if (captured.length) {
    await logTransferActivity(admin, {
      transferId: transfer.id,
      activityType: "system",
      body:
        `${captured.map((p) => (p.role === "seller" ? "Seller" : "Buyer")).join(" and ")} ` +
        "captured from the firm's transfer request. Not yet linked to a client record.",
      authorId: callerId,
      authorLabel: "ConveyClear",
    });
  }

  return { ok: true, transferId: transfer.id };
}
