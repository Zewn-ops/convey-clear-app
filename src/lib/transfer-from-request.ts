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

  return { ok: true, transferId: transfer.id };
}
