import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isStaffRole, clientDisplayName } from "@/types";
import TransferForm from "@/components/transfers/TransferForm";
import { ArrowLeft } from "lucide-react";

export const metadata = { title: "New Property Transfer — ConveyClear Admin" };

type ClientRow = {
  id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  business_name: string | null;
};

export default async function NewTransferPage() {
  const session = await getSessionProfile();
  if (!session || !isStaffRole(session.profile?.role)) redirect("/auth/login");

  const supabase = await createClient();
  const [{ data: firms }, { data: clients }] = await Promise.all([
    supabase.from("firms").select("id, name").eq("active", true).order("name"),
    supabase
      .from("clients")
      .select("id, full_name, first_name, last_name, business_name")
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Link href="/admin/property-transfers" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft className="h-4 w-4" /> Back to transfers
      </Link>
      <div>
        <h1 className="text-2xl font-bold text-gray-900">New property transfer</h1>
        <p className="text-sm text-gray-500 mt-1">
          Group the matters of one transaction — rates clearance, change of ownership, refund — under a single reference.
        </p>
      </div>
      <TransferForm
        firms={((firms as { id: string; name: string }[] | null) ?? []).map((f) => ({ id: f.id, label: f.name }))}
        clients={((clients as ClientRow[] | null) ?? []).map((c) => ({ id: c.id, label: clientDisplayName(c) }))}
      />
    </div>
  );
}
