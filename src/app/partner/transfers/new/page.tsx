import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requirePartner } from "@/lib/partner";
import PartnerTransferForm from "@/components/transfers/PartnerTransferForm";
import { clientDisplayName } from "@/types";
import { ArrowLeft } from "lucide-react";

export const metadata = { title: "New Property Transfer — ConveyClear Partner" };
export const dynamic = "force-dynamic";

export default async function NewPartnerTransferPage() {
  // Gate the page itself, not just the API — a non-partner should never see the form.
  const auth = await requirePartner();
  if ("error" in auth) redirect("/partner");

  // The firm's own clients, for the seller/buyer pickers. RLS (can_access_client)
  // already scopes this to the caller's firm; the form only ever offers these.
  const supabase = await createClient();
  const { data: clientRows } = await supabase
    .from("clients")
    .select("id, full_name, first_name, last_name, business_name")
    .order("created_at", { ascending: false })
    .limit(300);

  const clients = ((clientRows as {
    id: string;
    full_name: string | null;
    first_name: string | null;
    last_name: string | null;
    business_name: string | null;
  }[] | null) ?? []).map((c) => ({ id: c.id, label: clientDisplayName(c) }));

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Link href="/partner/transfers" className="inline-flex items-center gap-1 text-sm text-ink-3 hover:text-ink-2">
        <ArrowLeft className="h-4 w-4" /> Back to transfers
      </Link>
      <div>
        <h1 className="text-2xl font-bold text-ink">New property transfer</h1>
        <p className="text-sm text-ink-3 mt-1">
          Group the matters of one transaction together. Your firm owns it; ConveyClear can see it.
        </p>
      </div>
      <PartnerTransferForm clients={clients} />
    </div>
  );
}
