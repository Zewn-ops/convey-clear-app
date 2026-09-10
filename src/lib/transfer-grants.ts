import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Keep transfer_access_grants in step with a transfer's firm pointer.
 *
 * THE BUG THIS EXISTS FOR
 *   Since 052, a firm reaches a transfer because it holds a live GRANT — not
 *   because property_transfers.business_partner_id happens to equal theirs.
 *   051 backfilled a grant for every transfer that named a firm at the time, and
 *   transfer-from-request.ts writes one for every transfer born from a request.
 *
 *   Nothing wrote one for a transfer created by STAFF. The admin form sets
 *   business_partner_id and stops there, so the transfer appeared on the firm's
 *   own admin page — which reads the column — and was invisible in the firm's
 *   portal, which reads the grants. Silent on both sides: no error, no empty
 *   state, just a transaction the attorney never saw. Five of fourteen on
 *   production on 2026-09-10.
 *
 *   Editing the firm on an existing transfer had the same hole in reverse: the
 *   pointer moved and access did not follow it.
 *
 * WHAT IT DOES
 *   Makes the live grants for a transfer equal "exactly the firm the pointer
 *   names, or nobody". A grant for another firm is REVOKED rather than deleted —
 *   the point of 051's table is that "who could see this, and when" survives the
 *   access ending — and a firm that already holds a live, unexpired grant is
 *   left alone, so re-saving a form does not churn the history.
 *
 * ⚠️ REASSIGNMENT REVOKES. Moving a transfer from firm A to firm B ends A's
 *   access. That is the safer default and it is reversible: the revoked row is
 *   kept and 053 documents the two-step re-grant. If a handover should instead
 *   leave the outgoing firm able to read its own history, delete the revoke
 *   block — the insert half is what fixes the invisible transfer, and the two
 *   halves are independent.
 *
 * Call with a SERVICE-ROLE client, after the caller has been authorised: writes
 * to transfer_access_grants are staff-only (051), and both callers have already
 * required staff.
 */
export async function syncTransferGrant(
  admin: SupabaseClient,
  input: {
    transferId: string;
    /** The transfer's business_partner_id after the write. null = names no firm. */
    firmId: string | null;
    /** users.id of the staff member whose action this is, for the audit row. */
    actorId?: string | null;
    /** Why, for the grant's note. */
    note?: string | null;
  }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { transferId, firmId, actorId = null, note = null } = input;
  const now = new Date().toISOString();

  const { data: rows, error: readError } = await admin
    .from("transfer_access_grants")
    .select("id, firm_id, expires_at")
    .eq("transfer_id", transferId)
    .is("revoked_at", null);

  if (readError) return { ok: false, error: readError.message };

  const unrevoked = (rows as { id: string; firm_id: string; expires_at: string | null }[] | null) ?? [];
  const isExpired = (g: { expires_at: string | null }) => Boolean(g.expires_at && g.expires_at <= now);

  const revoke = async (ids: string[], reason: string) => {
    if (!ids.length) return null;
    const { error } = await admin
      .from("transfer_access_grants")
      .update({ revoked_at: now, revoked_by: actorId, revoked_reason: reason })
      .in("id", ids);
    return error?.message ?? null;
  };

  // Any other firm's live access ends here.
  const otherFirms = unrevoked.filter((g) => g.firm_id !== firmId);
  const revokedOthers = await revoke(
    otherFirms.map((g) => g.id),
    firmId ? "Transfer reassigned to another firm" : "Transfer no longer names a firm"
  );
  if (revokedOthers) return { ok: false, error: revokedOthers };

  if (!firmId) return { ok: true };

  const mine = unrevoked.filter((g) => g.firm_id === firmId);
  if (mine.some((g) => !isExpired(g))) return { ok: true }; // already granted, nothing to do

  // 053's known edge: transfer_access_grants_one_active is UNIQUE
  // (transfer_id, firm_id) WHERE revoked_at IS NULL, and an EXPIRED row is still
  // un-revoked — so it holds that slot and a fresh insert would fail on the
  // index. Revoke it first, which is the same two-step 053 prescribes.
  const revokedExpired = await revoke(
    mine.map((g) => g.id),
    "Retention period ended, re-granted"
  );
  if (revokedExpired) return { ok: false, error: revokedExpired };

  const { error } = await admin.from("transfer_access_grants").insert({
    transfer_id: transferId,
    firm_id: firmId,
    granted_by: actorId,
    note,
  });
  if (error) return { ok: false, error: error.message };

  return { ok: true };
}
