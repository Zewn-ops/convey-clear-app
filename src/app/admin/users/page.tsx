import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/auth";
import { isAdminRole, type AppUser, type BusinessPartner } from "@/types";
import { createClient } from "@/lib/supabase/server";
import UserManager from "@/components/admin/UserManager";

export const metadata = { title: "Users & Access — ConveyClear" };

export default async function AdminUsersPage() {
  const session = await getSessionProfile();
  if (!session || !isAdminRole(session.profile?.role)) redirect("/admin");

  const supabase = await createClient();
  const [{ data: usersData }, { data: partnersData }] = await Promise.all([
    supabase
      .from("users")
      .select("id, email, full_name, role, active, client_id, business_partner_id, last_login_at, created_at")
      .order("created_at", { ascending: false }),
    supabase.from("business_partners").select("id, name, partner_type, primary_email, primary_cell, active, created_at").order("name"),
  ]);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Users &amp; Access</h1>
        <p className="text-sm text-gray-500 mt-1">
          Create client logins, staff, and partner accounts. Issue credentials directly.
        </p>
      </div>

      <UserManager
        callerRole={session.profile!.role}
        initialUsers={(usersData as AppUser[] | null) ?? []}
        partners={(partnersData as BusinessPartner[] | null) ?? []}
      />
    </div>
  );
}
