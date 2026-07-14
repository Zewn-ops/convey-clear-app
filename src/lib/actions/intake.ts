"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionProfile } from "@/lib/auth";
import { logMatterActivity } from "@/lib/activity";
import { isStaffRole, isPartnerRole } from "@/types";
import { revalidatePath } from "next/cache";

// In-place intake: mark an OPTIONAL required document as "not available" so an
// intentionally-absent doc reads as handled, not forgotten. Stored as a list of
// "<partyId|shared>:<docType>" keys on service_data.docs_unavailable.
//
// Staff AND the owning attorney firm may do this. Partners could not before: the
// action wrote with the user-scoped client, and partners have no UPDATE on
// matters, so RLS silently dropped the write — the toggle did nothing, with no
// error, and partner-side intake progress could never reach complete.
//
// The fix is NOT to grant partners UPDATE on matters: service_data sits on the
// matters row next to phase/stage/status, and a blanket policy would hand them
// those too. Instead this authorises by READING the matter through the caller's
// own RLS (the /api/enquiries/matter pattern) and then writes with the service
// role — so the only thing a partner can change is this one key.
//
// Clients are excluded deliberately: a client could otherwise mark their own
// outstanding FICA documents "not available" and clear the requirement.
export async function toggleDocUnavailable(formData: FormData) {
  const matterId = (formData.get("matter_id") as string) || "";
  const key = (formData.get("doc_key") as string) || "";
  const make = formData.get("make") === "1";
  if (!matterId || !key) return;

  const session = await getSessionProfile();
  const role = session?.profile?.role ?? null;
  if (!isStaffRole(role) && !isPartnerRole(role)) return;

  // Authorise: can the CALLER see this matter? Read under their own RLS, so a
  // partner is confined to their firm's matters without a second rule to keep in
  // sync with can_access_matter().
  const supabase = await createClient();
  const { data: visible } = await supabase
    .from("matters")
    .select("id, service_data")
    .eq("id", matterId)
    .maybeSingle();
  if (!visible) return;

  const sd = ((visible as { service_data?: Record<string, unknown> }).service_data ?? {}) as Record<string, unknown>;
  const cur = Array.isArray(sd.docs_unavailable) ? (sd.docs_unavailable as string[]) : [];
  const next = make ? Array.from(new Set([...cur, key])) : cur.filter((k) => k !== key);

  const admin = createAdminClient();
  const { error } = await admin
    .from("matters")
    .update({ service_data: { ...sd, docs_unavailable: next } })
    .eq("id", matterId);
  if (error) throw new Error(`Could not update the document status: ${error.message}`);

  // Auditable from the matter, not just inferable from the intake checklist.
  // Best-effort (a lost feed entry must not fail the toggle) but never silent —
  // logMatterActivity logs its own failures. That matters here: `activity_type`
  // carries a CHECK constraint, and this entry vanished into an unchecked 23514
  // for weeks until migration 035 legalised the type.
  //
  // Through the guarded logger (036) because this toggle produced the worst of the
  // duplicates — seven identical rows, from Zewn clicking a control that gave him
  // no sign it had done anything.
  await logMatterActivity(admin, {
    matterId,
    authorId: session?.profile?.id ?? null,
    activityType: "document_status",
    body: make ? `Document marked not available: ${key}` : `Document no longer marked not available: ${key}`,
  });

  revalidatePath(`/admin/matters/${matterId}`);
  revalidatePath(`/partner/matters/${matterId}`);
}
