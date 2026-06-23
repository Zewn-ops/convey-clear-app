import { createAdminClient } from "@/lib/supabase/admin";
import { STAFF_ROLES } from "@/types";

// In-portal notifications (Theme I). Producers call these from API routes /
// server actions to fan a notification out to the right recipients. Rows are
// inserted with the service role (RLS only governs reads/updates). The bell
// (client) receives them live via Supabase Realtime.
//
// CONTRACT: these are best-effort and MUST NEVER THROW — a notification failure
// (e.g. a missing service-role key) must never break the core action that
// triggered it (phase change, referral, upload …). Every path is wrapped.

export interface NotifyPayload {
  type: string;
  title: string;
  body?: string | null;
  link?: string | null;
  matter_id?: string | null;
  enquiry_id?: string | null;
}

// Insert one notification per recipient (deduped). Best-effort — never throws.
export async function notifyUsers(userIds: (string | null | undefined)[], p: NotifyPayload): Promise<void> {
  const ids = Array.from(new Set(userIds.filter((x): x is string => Boolean(x))));
  if (ids.length === 0) return;
  try {
    const admin = createAdminClient();

    // Every matter notification reads "<matter title>: <event>" so the recipient
    // sees which matter at a glance (note 2026-06-23). Resolved centrally so all
    // producers (refer / docs / stage / phase / outcome / internal note) match.
    let title = p.title;
    if (p.matter_id) {
      const { data: m } = await admin.from("matters").select("title").eq("id", p.matter_id).maybeSingle();
      if (m?.title) title = `${m.title}: ${p.title}`;
    }

    await admin.from("notifications").insert(
      ids.map((uid) => ({
        user_id: uid,
        type: p.type,
        title,
        body: p.body ?? null,
        link: p.link ?? null,
        matter_id: p.matter_id ?? null,
        enquiry_id: p.enquiry_id ?? null,
      }))
    );
  } catch (e) {
    console.error("[notify] notifyUsers failed:", e);
  }
}

// All ConveyClear staff. `enquiryPref` respects each user's notify_enquiries pref.
export async function notifyStaff(p: NotifyPayload, opts?: { enquiryPref?: boolean }): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("users")
      .select("id, notify_enquiries")
      .in("role", STAFF_ROLES as unknown as string[]);
    const ids = (data ?? [])
      .filter((u: { notify_enquiries?: boolean }) => (opts?.enquiryPref ? u.notify_enquiries !== false : true))
      .map((u: { id: string }) => u.id);
    await notifyUsers(ids, p);
  } catch (e) {
    console.error("[notify] notifyStaff failed:", e);
  }
}

// Everyone watching a matter: subscribers + the matter's client user(s) + the
// referring partner's user(s). Optionally exclude the actor.
export async function notifyMatterParties(
  matterId: string,
  p: NotifyPayload,
  opts?: { excludeUserId?: string | null }
): Promise<void> {
  try {
    const admin = createAdminClient();
    const ids = new Set<string>();

    const { data: subs } = await admin.from("matter_subscribers").select("user_id").eq("matter_id", matterId);
    (subs ?? []).forEach((s: { user_id: string | null }) => s.user_id && ids.add(s.user_id));

    const { data: m } = await admin.from("matters").select("client_id, business_partner_id").eq("id", matterId).maybeSingle();
    if (m?.client_id) {
      const { data: cu } = await admin.from("users").select("id").eq("client_id", m.client_id);
      (cu ?? []).forEach((u: { id: string }) => ids.add(u.id));
    }
    if (m?.business_partner_id) {
      const { data: pu } = await admin.from("users").select("id").eq("business_partner_id", m.business_partner_id);
      (pu ?? []).forEach((u: { id: string }) => ids.add(u.id));
    }
    if (opts?.excludeUserId) ids.delete(opts.excludeUserId);
    // Title prefixing ("<matter title>: <event>") is centralised in notifyUsers.
    await notifyUsers(Array.from(ids), { ...p, matter_id: matterId });
  } catch (e) {
    console.error("[notify] notifyMatterParties failed:", e);
  }
}
