import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionProfile, homePathForRole } from "@/lib/auth";
import { ROLE_LABELS } from "@/types";
import Card from "@/components/ui/Card";
import ChangePasswordForm from "@/components/auth/ChangePasswordForm";
import { ArrowLeft } from "lucide-react";

export const metadata = { title: "Account — ConveyClear" };

export default async function AccountPage() {
  const session = await getSessionProfile();
  if (!session) redirect("/auth/login");
  const profile = session.profile;
  const home = homePathForRole(profile?.role);

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
          <h2 className="font-semibold text-gray-900 mb-4">Change password</h2>
          <ChangePasswordForm />
        </Card>
      </div>
    </div>
  );
}
