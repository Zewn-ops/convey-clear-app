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
   * The parties as the attorney typed them (055). Optional on the type because a
   * request may legitimately carry none — firms supply what they know — not
   * because a caller may skip selecting the columns.
   */
  seller_name?: string | null;
  seller_email?: string | null;
  seller_cell?: string | null;
  buyer_name?: string | null;
  buyer_email?: string | null;
  buyer_cell?: string | null;
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
 * ⚠️ ENTITY TYPE IS ASSUMED `natural_person`. The form asks for one name and no
 * type, and the capture CHECK requires one. A natural person is the common case,
 * and a wrong guess costs one edit on a row already flagged as unresolved —
 * whereas dropping the party costs re-typing everything the attorney gave us. It
 * is a guess, so it is said here and on the row itself rather than buried.
 */
function partiesFromRequest(req: RequestRow) {
  const clean = (v: string | null | undefined) => {
    const t = (v ?? "").trim();
    return t === "" ? null : t;
  };

  return (["seller", "buyer"] as const)
    .map((role) => ({
      role,
      full_name: clean(role === "seller" ? req.seller_name : req.buyer_name),
      email: clean(role === "seller" ? req.seller_email : req.buyer_email),
      cell: clean(role === "seller" ? req.seller_cell : req.buyer_cell),
    }))
    // A name is what the capture constraint requires and what makes the row
    // worth having: an email address with nobody attached to it is not a party.
    .filter((p) => p.full_name !== null)
    .map((p) => ({
      role: p.role,
      entity_type: "natural_person",
      full_name: p.full_name,
      email: p.email,
      cell: p.cell,
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
