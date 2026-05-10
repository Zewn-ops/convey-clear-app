import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import ProfileForm from "@/components/dashboard/ProfileForm";
import Card from "@/components/ui/Card";
import { getInitials } from "@/lib/utils";
import { ShieldCheck } from "lucide-react";

export const metadata = { title: "Profile — ConveyClear" };

export default async function ProfilePage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!profile) redirect("/auth/login");

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#1B2E6B]">Profile</h1>
        <p className="text-sm text-gray-500 mt-1">
          Manage your personal details and account settings
        </p>
      </div>

      {/* Avatar card */}
      <Card className="flex items-center gap-4">
        <div className="h-16 w-16 rounded-full bg-[#1B2E6B] flex items-center justify-center text-white text-xl font-bold shrink-0">
          {getInitials(profile.full_name)}
        </div>
        <div>
          <p className="font-semibold text-gray-900">{profile.full_name}</p>
          <p className="text-sm text-gray-500">{user.email}</p>
          <span className="inline-flex items-center gap-1 mt-1 text-xs font-medium text-[#1B2E6B] bg-[#1B2E6B]/10 rounded-full px-2 py-0.5 capitalize">
            <ShieldCheck className="h-3 w-3" />
            {profile.role}
          </span>
        </div>
      </Card>

      {/* Edit form */}
      <Card>
        <h2 className="font-semibold text-gray-900 mb-4">Edit Details</h2>
        <ProfileForm profile={profile} email={user.email!} />
      </Card>

      {/* POPIA notice */}
      <Card className="bg-[#1B2E6B]/5 border-[#1B2E6B]/20">
        <p className="text-xs font-semibold text-[#1B2E6B] uppercase tracking-wide mb-2">
          Your Data Rights (POPIA)
        </p>
        <p className="text-xs text-gray-600 leading-relaxed">
          Under the Protection of Personal Information Act (POPIA), you have
          the right to access, correct, and request deletion of your personal
          information. Contact{" "}
          <a
            href="mailto:privacy@conveyclear.co.za"
            className="text-[#1B2E6B] underline"
          >
            privacy@conveyclear.co.za
          </a>{" "}
          to exercise these rights.
        </p>
      </Card>
    </div>
  );
}
