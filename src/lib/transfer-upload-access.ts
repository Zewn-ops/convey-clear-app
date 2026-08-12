import type { SupabaseClient } from "@supabase/supabase-js";
import { STAFF_ROLES, type UserRole } from "@/types";

/**
 * Who may put a document ON a property transfer.
 *
 * Meeting 2026-08-11, Details §112 and next-step §50:
 *
 *   "attorneys are responsible for uploading transfer documents like the deed
 *    search. Once uploaded, ConveyClear staff will make these documents visible
 *    to the relevant parties, including buyers and sellers, through the portal."
 *
 *   [Zuaan] "Enable the attorney functionality to allow document uploads
 *    directly within the admin portal."
 *
 * Until now both upload routes were STAFF_ROLES-only, so a firm got a 403. This
 * widens authorship to the attorney firms and nobody else.
 *
 * ⚠️ WHY NOT EVERY PARTNER
 *   `business_partner` is one role covering law firms AND estate agencies
 *   (`firms.partner_type`). §112 names attorneys and the deed search; nothing in
 *   the meeting asked for agent uploads. 059 already taught the party pickers
 *   this same firm-vs-agency split, so widening to all partners here would both
 *   exceed the decision and contradict a distinction the UI already draws.
 *   Zewn's call, 2026-08-12: law firms and conveyancers only, agents raised as
 *   an explicit question rather than inherited by accident.
 *
 * ⚠️ THIS IS AUTHENTICATION OF THE ROLE, NOT OF THE TRANSFER.
 *   It answers "may this kind of user author transfer documents at all". Both
 *   callers must STILL read the transfer back through the caller's own client so
 *   RLS (`can_access_transfer()`, 052, grant-scoped and expiring since 053)
 *   decides whether it is THIS transfer. Neither check substitutes for the
 *   other: this one alone would let any law firm upload to any transfer.
 *
 * Visibility is deliberately not touched. 058 defaults `transfer_documents`
 * to 'internal', so a document an attorney uploads is invisible to buyer and
 * seller until staff share it — which is exactly the second half of §112.
 */
export const DOC_UPLOADING_FIRM_TYPES = ["attorney", "conveyancer", "law_firm"] as const;

export type TransferUploader =
  | { ok: true; userId: string; role: UserRole; isStaff: boolean; firmId: string | null }
  | { ok: false; message: string; status: 401 | 403 };

export async function requireTransferUploader(
  supabase: SupabaseClient,
  adminClient: SupabaseClient
): Promise<TransferUploader> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Not authenticated", status: 401 };

  const { data: me } = await supabase
    .from("users")
    .select("id, role, business_partner_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!me) return { ok: false, message: "Insufficient privilege", status: 403 };

  const role = me.role as UserRole;
  const userId = me.id as string;

  if (STAFF_ROLES.includes(role)) {
    return { ok: true, userId, role, isStaff: true, firmId: null };
  }

  if (role !== "business_partner") {
    return { ok: false, message: "Insufficient privilege", status: 403 };
  }

  const firmId = (me.business_partner_id as string | null) ?? null;
  if (!firmId) return { ok: false, message: "Insufficient privilege", status: 403 };

  // Read the firm's type with the ADMIN client on purpose. `firms_self` lets a
  // partner read their own firm today, but this check decides a permission — it
  // must not silently start passing or failing because a policy on `firms` was
  // widened or narrowed for an unrelated reason.
  const { data: firm } = await adminClient
    .from("firms")
    .select("partner_type, active")
    .eq("id", firmId)
    .maybeSingle();

  const partnerType = (firm as { partner_type?: string; active?: boolean } | null)?.partner_type ?? null;
  const firmActive = (firm as { active?: boolean } | null)?.active !== false;

  if (!firmActive) {
    return { ok: false, message: "This firm is no longer active.", status: 403 };
  }
  if (!partnerType || !DOC_UPLOADING_FIRM_TYPES.includes(partnerType as (typeof DOC_UPLOADING_FIRM_TYPES)[number])) {
    return {
      ok: false,
      // Named rather than a bare 403: an estate agency hitting this should learn
      // that it is their firm type, not a broken page or a missing grant.
      message: "Only the attorney firm on a transfer can upload its documents.",
      status: 403,
    };
  }

  return { ok: true, userId, role, isStaff: false, firmId };
}
