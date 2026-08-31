import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireFirmAdmin } from "@/lib/partner";
import FirmDetailsForm, {
  type FirmBanking,
  type BpNumber,
  type FirmCouncilFields,
} from "@/components/partner/FirmDetailsForm";
import CouncilLoginsCard, {
  type FirmMember,
  type StoredLogin,
} from "@/components/partner/CouncilLoginsCard";
import FirmDocumentsCard, {
  type FirmDocumentRow,
} from "@/components/partner/FirmDocumentsCard";
import { ArrowLeft } from "lucide-react";

export const metadata = { title: "Firm Details — ConveyClear Partner" };
export const dynamic = "force-dynamic";

const FIRM_FIELDS =
  "name, practice_number, ffc_number, ffc_expires_on, " +
  "file_owner_name, file_owner_email, file_owner_cell";

export default async function PartnerFirmPage() {
  // Firm-admins only. A regular partner (or anyone else) is bounced.
  const auth = await requireFirmAdmin();
  if ("error" in auth) redirect("/partner");

  const supabase = await createClient();

  // Banking, BP rows and the council-facing fields added by 073 are all read
  // under the firm-admin RLS policy (037) — a regular partner would get
  // nothing here, which is why the page is gated too.
  //
  // 🔒 The council-logins query deliberately selects METADATA ONLY. The
  // ciphertext columns are not requested: `firm_council_credentials` grants
  // SELECT to the admin tier alone (074), so a partner session would get
  // nothing back anyway — and asking for them would suggest to the next reader
  // that this page is allowed to hold them.
  const [
    { data: firmRow },
    { data: bankingRow },
    { data: bpRows },
    { data: memberRows },
    { data: loginRows },
    { data: documentRows },
  ] = await Promise.all([
    supabase.from("firms").select(FIRM_FIELDS).eq("id", auth.partnerId).maybeSingle(),
    supabase
      .from("firm_banking")
      .select("*")
      .eq("business_partner_id", auth.partnerId)
      .maybeSingle(),
    supabase
      .from("firm_bp_numbers")
      .select("municipality, bp_number, attorney_code")
      .eq("business_partner_id", auth.partnerId)
      .order("municipality", { ascending: true }),
    supabase
      .from("users")
      .select("id, name, email")
      .eq("business_partner_id", auth.partnerId)
      .order("name", { ascending: true }),
    supabase
      .from("firm_council_credentials")
      .select("user_id, municipality, updated_at")
      .eq("firm_id", auth.partnerId)
      .order("municipality", { ascending: true }),
    supabase
      .from("firm_documents")
      .select("id, document_type, file_name, created_at")
      .eq("firm_id", auth.partnerId)
      .order("created_at", { ascending: false }),
  ]);

  const firm = (firmRow as unknown as (FirmCouncilFields & { name: string }) | null) ?? null;
  const banking = (bankingRow as FirmBanking | null) ?? null;
  const bpNumbers = (bpRows as BpNumber[] | null) ?? [];
  const members = (memberRows as FirmMember[] | null) ?? [];
  const stored = (loginRows as StoredLogin[] | null) ?? [];
  const documents = (documentRows as FirmDocumentRow[] | null) ?? [];
  const firmName = firm?.name ?? "Your firm";

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <Link
        href="/partner"
        className="inline-flex items-center gap-1 text-sm text-ink-3 hover:text-ink-2"
      >
        <ArrowLeft className="h-4 w-4" /> Back
      </Link>
      <div>
        <h1 className="text-[40px] font-semibold leading-[1.06] tracking-[-0.032em] text-ink">
          Firm details
        </h1>
        <p className="text-sm text-ink-3 mt-1">
          Banking, council registrations and portal logins for your firm. Firm
          administrators only.
        </p>
      </div>
      <FirmDetailsForm
        firmName={firmName}
        firm={firm}
        banking={banking}
        bpNumbers={bpNumbers}
      />
      <FirmDocumentsCard documents={documents} />
      <CouncilLoginsCard members={members} stored={stored} />
    </div>
  );
}
