import { redirect } from "next/navigation";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { getSessionProfile, homePathForRole } from "@/lib/auth";
import { ROLE_LABELS, isPartnerRole, isStaffRole } from "@/types";
import Card from "@/components/ui/Card";
import ChangePasswordForm from "@/components/auth/ChangePasswordForm";
import MfaCard from "@/components/auth/MfaCard";
import NotifyVolumeControl from "@/components/notifications/NotifyVolumeControl";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ArrowLeft } from "lucide-react";

export const metadata = { title: "Account — ConveyClear" };

export default async function AccountPage() {
  const session = await getSessionProfile();
  if (!session) redirect("/auth/login");
  const profile = session.profile;
  const home = homePathForRole(profile?.role);

  // Current phone (self-readable via users_self_read RLS).
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: me } = user
    ? await supabase.from("users").select("phone, notify_sound, notify_enquiries, notify_email").eq("auth_user_id", user.id).maybeSingle()
    : { data: null };
  const meRow = me as {
    phone: string | null;
    notify_sound: boolean | null;
    notify_enquiries: boolean | null;
    notify_email: boolean | null;
  } | null;
  const phone = meRow?.phone ?? "";

  // 🔴 "Business Partner" is OUR word for the table, not theirs for themselves.
  //
  // Zewn, 2026-09-02: "remove business partner from the subtitle, add attorney
  // and which firm they are from." An attorney reading their own account page
  // was told they are a business partner — a role name out of `users.role` that
  // means something in the schema and nothing to the person holding it. What
  // they recognise is what they do and who they do it for.
  //
  // Read with the service role: `firms` is not self-readable through the users
  // table embed, and the same read on the partner LAYOUT already does this.
  let subtitleRole = profile?.role ? ROLE_LABELS[profile.role] : null;
  if (isPartnerRole(profile?.role)) {
    const firmName = profile?.business_partner_id
      ? ((
          await createAdminClient()
            .from("firms")
            .select("name, partner_type")
            .eq("id", profile.business_partner_id)
            .maybeSingle()
        ).data as { name: string | null; partner_type: string | null } | null)
      : null;
    // 🔴 THE RAW COLUMN IS NOT A LABEL. This printed "conveyancer" in lower
    // case, because `firms.partner_type` holds attorney | conveyancer |
    // law_firm | estate_agent | other and anything that was not literally
    // "attorney" fell through to the raw value (found on the account page,
    // 2026-09-02). Zewn asked for "attorney and which firm they are from", and a
    // conveyancer IS an attorney — the column is recording what KIND of firm,
    // not whether they practise law. Only an estate agency is genuinely not one
    // (059, §112).
    const kind =
      firmName?.partner_type === "estate_agent"
        ? "Estate agent"
        : firmName?.partner_type === "other"
          ? "Firm"
          : "Attorney";
    subtitleRole = [kind, firmName?.name].filter(Boolean).join(" · ");
  }
  const notifySound = meRow?.notify_sound !== false;
  const notifyEnquiries = meRow?.notify_enquiries !== false;
  const notifyEmail = meRow?.notify_email !== false;

  async function savePhone(formData: FormData) {
    "use server";
    const value = String(formData.get("phone") ?? "").trim();
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    // Service-role update, scoped to the caller's own row (users has no self-update RLS policy).
    await createAdminClient().from("users").update({ phone: value || null }).eq("auth_user_id", user.id);
    revalidatePath("/account");
  }

  async function saveNotifyPrefs(formData: FormData) {
    "use server";
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await createAdminClient()
      .from("users")
      .update({
        notify_sound: formData.get("notify_sound") === "on",
        notify_enquiries: formData.get("notify_enquiries") === "on",
        notify_email: formData.get("notify_email") === "on",
      })
      .eq("auth_user_id", user.id);
    revalidatePath("/account");
  }

  return (
    <div className="min-h-screen bg-canvas py-10 px-4">
      <div className="max-w-lg mx-auto space-y-6">
        <Link href={home} className="inline-flex items-center gap-1 text-sm text-ink-3 hover:text-ink">
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-ink">Account</h1>
          <p className="text-sm text-ink-3 mt-1">
            {profile?.email}
            {subtitleRole ? ` · ${subtitleRole}` : ""}
          </p>
        </div>

        <Card>
          <h2 className="font-semibold text-ink mb-4">Contact number</h2>
          <form action={savePhone} className="flex items-end gap-3">
            <label className="flex-1">
              <span className="text-xs font-medium text-ink-2">Phone</span>
              <input
                name="phone"
                defaultValue={phone}
                placeholder="+27 82 000 0000"
                className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-3 focus:outline-none focus:ring-2 focus:ring-action"
              />
            </label>
            <button type="submit" className="px-4 py-2 text-sm font-medium bg-action-fill text-white rounded-lg hover:opacity-90">
              Save
            </button>
          </form>
          {isStaffRole(profile?.role) && (
            <p className="text-xs text-ink-3 mt-2">
              This is the number the enquiry &ldquo;Call&rdquo; button dials when an enquiry is assigned to you.
            </p>
          )}
        </Card>

        <Card>
          <h2 className="font-semibold text-ink mb-4">Notifications</h2>
          <form action={saveNotifyPrefs} className="space-y-3">
            <label className="flex items-center gap-3 text-sm text-ink-2">
              <input type="checkbox" name="notify_sound" defaultChecked={notifySound} className="h-4 w-4 accent-[color:var(--cc-action-fill)]" />
              Play a sound for new notifications
            </label>
            <label className="flex items-start gap-3 text-sm text-ink-2">
              <input type="checkbox" name="notify_email" defaultChecked={notifyEmail} className="h-4 w-4 mt-0.5 accent-[color:var(--cc-action-fill)]" />
              <span>
                Email me when a matter changes phase
                <span className="block text-xs text-ink-3">Phase changes only — not every stage update.</span>
              </span>
            </label>
            {isStaffRole(profile?.role) && (
              <label className="flex items-center gap-3 text-sm text-ink-2">
                <input type="checkbox" name="notify_enquiries" defaultChecked={notifyEnquiries} className="h-4 w-4 accent-[color:var(--cc-action-fill)]" />
                Notify me about new enquiries
              </label>
            )}
            <button type="submit" className="px-4 py-2 text-sm font-medium bg-action-fill text-white rounded-lg hover:opacity-90">
              Save preferences
            </button>
          </form>
          <div className="mt-4 border-t border-line pt-4">
            <NotifyVolumeControl />
          </div>
          <p className="text-xs text-ink-3 mt-2">Red dots always show; the chime needs one click anywhere first (browser audio rule).</p>
        </Card>

        <Card>
          <h2 className="font-semibold text-ink mb-4">Change password</h2>
          <ChangePasswordForm />
        </Card>

        <MfaCard />
      </div>
    </div>
  );
}
