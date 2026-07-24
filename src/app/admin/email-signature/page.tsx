import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/auth";
import { isAdminRole } from "@/types";
import SignatureBuilder from "@/components/admin/SignatureBuilder";

export const metadata = { title: "Email Signatures — ConveyClear Admin" };

// Admin-tier only (admin + super_admin) — the nav item is shown only to admins,
// but the page guards itself too, since /admin/* is otherwise all-staff.
export default async function EmailSignaturePage() {
  const session = await getSessionProfile();
  if (!session || !isAdminRole(session.profile?.role)) redirect("/admin");

  return <SignatureBuilder />;
}
