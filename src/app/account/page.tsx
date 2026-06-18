import { redirect } from "next/navigation";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { getSessionProfile, homePathForRole } from "@/lib/auth";
import { ROLE_LABELS, isStaffRole } from "@/types";
import Card from "@/components/ui/Card";
import ChangePasswordForm from "@/components/auth/ChangePasswordForm";
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
    ? await supabase.from("users").select("phone").eq("auth_user_id", user.id).maybeSingle()
    : { data: null };
  const phone = (me as { phone: string | null } | null)?.phone ?? "";

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

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-lg mx-auto space-y-6">
        <Link href={home} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-[#1B2E6B]">Account</h1>
          <p className="text-sm text-gray-500 mt-1">{profile?.email}{profile?.role ? ` · ${ROLE_LABELS[profile.role]}` : ""}</p>
        </div>

        <Card>
          <h2 className="font-semibold text-gray-900 mb-4">Contact number</h2>
          <form action={savePhone} className="flex items-end gap-3">
            <label className="flex-1">
              <span className="text-xs font-medium text-gray-700">Phone</span>
              <input
                name="phone"
                defaultValue={phone}
                placeholder="+27 82 000 0000"
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B2E6B]"
              />
            </label>
            <button type="submit" className="px-4 py-2 text-sm font-medium bg-[#1B2E6B] text-white rounded-lg hover:bg-[#1B2E6B]/90">
              Save
            </button>
          </form>
          {isStaffRole(profile?.role) && (
            <p className="text-xs text-gray-400 mt-2">
              This is the number the enquiry &ldquo;Call&rdquo; button dials when an enquiry is assigned to you.
            </p>
          )}
        </Card>

        <Card>
          <h2 className="font-semibold text-gray-900 mb-4">Change password</h2>
          <ChangePasswordForm />
        </Card>
      </div>
    </div>
  );
}
