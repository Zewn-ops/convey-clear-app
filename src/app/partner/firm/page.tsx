import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireFirmAdmin } from "@/lib/partner";
import FirmDetailsForm, { type FirmBanking, type BpNumber } from "@/components/partner/FirmDetailsForm";
import { ArrowLeft } from "lucide-react";

export const metadata = { title: "Firm Details — ConveyClear Partner" };
export const dynamic = "force-dynamic";

export default async function PartnerFirmPage() {
  // Firm-admins only. A regular partner (or anyone else) is bounced.
  const auth = await requireFirmAdmin();
  if ("error" in auth) redirect("/partner");

  const supabase = await createClient();

  // Firm name for the header. Banking + BP rows are read under the firm-admin
  // RLS policy (037) — a regular partner would get nothing here, which is why
  // the page is gated too.
  const [{ data: firm }, { data: bankingRow }, { data: bpRows }] = await Promise.all([
    supabase.from("firms").select("name").eq("id", auth.partnerId).maybeSingle(),
    supabase.from("firm_banking").select("*").eq("business_partner_id", auth.partnerId).maybeSingle(),
    supabase
      .from("firm_bp_numbers")
      .select("municipality, bp_number")
      .eq("business_partner_id", auth.partnerId)
      .order("municipality", { ascending: true }),
  ]);

  const banking = (bankingRow as FirmBanking | null) ?? null;
  const bpNumbers = (bpRows as BpNumber[] | null) ?? [];
  const firmName = (firm as { name: string } | null)?.name ?? "Your firm";

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <Link href="/partner" className="inline-flex items-center gap-1 text-sm text-ink-3 hover:text-ink-2">
        <ArrowLeft className="h-4 w-4" /> Back
      </Link>
      <div>
        <h1 className="text-[40px] font-semibold leading-[1.06] tracking-[-0.032em] text-ink">Firm details</h1>
        <p className="text-sm text-ink-3 mt-1">
          Banking, trust account and municipality BP numbers for your firm. Firm administrators only.
        </p>
      </div>
      <FirmDetailsForm firmName={firmName} banking={banking} bpNumbers={bpNumbers} />
    </div>
  );
}
