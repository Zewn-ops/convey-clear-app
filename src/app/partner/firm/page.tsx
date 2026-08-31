import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
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
  // 🔒 Two of the reads below MUST use the service role, and the reason is the
  // same for both: RLS would return nothing, so the feature would render empty
  // forever. Caught in review 2026-08-31, where both were doing exactly that.
  //
  //   · the firm's own people — `users` has one SELECT policy, 006's
  //     `users_self_read` (`auth_user_id = auth.uid() OR app_is_staff()`), so a
  //     firm admin can read their OWN row and no colleague's. The councils ask
  //     for every staff member's login, so a picker that can only ever offer
  //     the person using it is not the feature.
  //   · the stored logins — 074 grants SELECT to the admin tier alone, on
  //     purpose. The firm may not read the VALUES; it must still be able to see
  //     that a colleague's login is captured, and to remove one.
  //
  // Both are pinned to `auth.partnerId`, which comes from requireFirmAdmin()
  // and never from the request, so the service role cannot reach another firm.
  // The credentials query takes METADATA ONLY — no ciphertext column is even
  // named, so this page cannot hold a credential it is not allowed to read.
  const admin = createAdminClient();
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
    // `users` has no `name` column — 001 defines full_name, 023 adds
    // first_name / last_name. Selecting one silently 42703'd the whole query.
    admin
      .from("users")
      .select("id, full_name, first_name, last_name, email")
      .eq("business_partner_id", auth.partnerId)
      .eq("active", true)
      .order("full_name", { ascending: true }),
    admin
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
  const members = (
    (memberRows as
      | { id: string; full_name: string | null; first_name: string | null; last_name: string | null; email: string | null }[]
      | null) ?? []
  ).map((u) => ({
    id: u.id,
    // Email last rather than as a display choice: a colleague with no name
    // recorded still has to be selectable.
    name:
      u.full_name ||
      [u.first_name, u.last_name].filter(Boolean).join(" ") ||
      u.email ||
      "Unnamed",
    email: u.email,
  }));
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
