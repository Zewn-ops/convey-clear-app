import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionProfile } from "@/lib/auth";
import { isStaffRole } from "@/types";
import { createClient } from "@/lib/supabase/server";
import CreateMatterForm from "@/components/admin/CreateMatterForm";
import { ArrowLeft } from "lucide-react";

export const metadata = { title: "New Matter — ConveyClear Admin" };

export default async function NewMatterPage() {
  const session = await getSessionProfile();
  if (!session || !isStaffRole(session.profile?.role)) redirect("/auth/login");

  const supabase = await createClient();
  const [{ data: services }, { data: clients }] = await Promise.all([
    supabase.from("services").select("id, code, name").order("name"),
    supabase.from("clients").select("id, full_name, business_name").order("created_at", { ascending: false }).limit(200),
  ]);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Link href="/admin/matters" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft className="h-4 w-4" /> Back to matters
      </Link>
      <div>
        <h1 className="text-2xl font-bold text-gray-900">New matter</h1>
        <p className="text-sm text-gray-500 mt-1">Create a matter directly in the portal — no Pipedrive needed.</p>
      </div>
      <CreateMatterForm
        services={(services as { id: string; code: string; name: string }[] | null) ?? []}
        clients={(clients as { id: string; full_name: string | null; business_name: string | null }[] | null) ?? []}
      />
    </div>
  );
}
