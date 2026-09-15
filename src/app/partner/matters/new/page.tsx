import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionProfile } from "@/lib/auth";
import Card from "@/components/ui/Card";
import TransferDocuments from "@/components/transfers/TransferDocuments";
import ExpectedDocuments from "@/components/transfers/ExpectedDocuments";
import SubmitMatterForm from "@/components/matters/SubmitMatterForm";
import { signedDocUrls } from "@/lib/storage";
import { municipalityLabel } from "@/lib/utils";
import { serviceLabel } from "@/lib/councils/types";
import { normalisePrcStage, prcStageLabel } from "@/lib/prc-docs";
import { clientDisplayName, type TransferDocument } from "@/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "New matter — ConveyClear" };

/**
 * The attorney's own matter-creation page.
 *
 * Marlene, 2026-09-12: "if they want to create an EBP matter/service they click
 * the plus button and it pops up with the matter creation page … also needs to
 * be able to see what documents the matter requires on this page and the ability
 * to upload from this page … they also need the option to make a note for the
 * matter and choose a priority, the notes are important since there's always a
 * story with a matter."
 *
 * Jukka, three days later, on why the page is reached FROM a transfer and
 * carries no transfer picker: "if any attorney wants to use our service, they'll
 * have to first create a property transfer for that matter to rest under."
 * There is no route to this page without one.
 *
 * WHY THE UPLOADS GO TO THE TRANSFER, NOT THE MATTER. The matter does not exist
 * yet — it is created when this form is submitted — so there is nothing for a
 * file to belong to. That is also what was actually asked for: Jukka, on the
 * same page, "they have the ability to upload it there and then, and that same
 * document is stored on the main property [transfer]". Documents live once on
 * the transaction and are linked onto each matter that needs them, which is the
 * linking ability the matter page already has.
 */
export default async function PartnerNewMatterPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const sp = (k: string) => {
    const v = searchParams?.[k];
    return Array.isArray(v) ? v[0] : v;
  };
  const transferId = (sp("transfer") ?? "").trim();
  const serviceCode = (sp("service") ?? "").trim().toUpperCase();

  const session = await getSessionProfile();
  if (!session || session.profile?.role !== "business_partner") redirect("/auth/login");
  if (!transferId || !serviceCode) notFound();

  const supabase = await createClient();

  // Read as the CALLER. RLS decides whether this firm may see the transfer, so
  // the answer here is the same answer the portal gives them — and a firm that
  // cannot open the transfer cannot open a matter on it either. Deliberately
  // not a business_partner_id comparison: that column is the display pointer,
  // not the permission, and the two have drifted before (091).
  type ClientShape = {
    id: string;
    full_name: string | null;
    first_name: string | null;
    last_name: string | null;
    business_name: string | null;
  } | null;
  // Cast rather than trust the generated row type: an embedded select with an
  // explicit !fkey alias does not narrow, and the partner transfer page casts
  // the identical query for the same reason.
  const { data: transferData } = await supabase
    .from("property_transfers")
    .select(
      "id, reference, property_description, municipality, council_region, status, " +
        "seller:clients!property_transfers_seller_client_id_fkey(id, full_name, first_name, last_name, business_name), " +
        "buyer:clients!property_transfers_buyer_client_id_fkey(id, full_name, first_name, last_name, business_name)"
    )
    .eq("id", transferId)
    .maybeSingle();
  const transfer = transferData as {
    id: string;
    reference: string;
    property_description: string | null;
    municipality: string | null;
    council_region: string | null;
    status: string;
    seller: ClientShape;
    buyer: ClientShape;
  } | null;
  if (!transfer) notFound();

  // The checklist line being opened. Unclaimed only — a service that already has
  // a matter is not a second matter, and offering the form would produce an
  // error on submit instead of saying so now.
  const { data: line } = await supabase
    .from("transfer_services")
    .select("id, service_code, prc_subtype, matter_id, status, position")
    .eq("transfer_id", transferId)
    .is("parent_id", null)
    .ilike("service_code", serviceCode)
    .is("matter_id", null)
    .order("position", { ascending: true })
    .limit(1)
    .maybeSingle();

  const { data: tdocData } = await supabase
    .from("transfer_documents")
    .select("*")
    .eq("transfer_id", transferId)
    .eq("status", "current")
    .order("created_at", { ascending: false });
  const transferDocs = (tdocData as TransferDocument[] | null) ?? [];
  const tdocUrls = transferDocs.length > 0 ? await signedDocUrls(createAdminClient(), transferDocs) : {};
  const docsWithUrls = transferDocs.map((d) => ({
    ...d,
    url: d.storage_path ? tdocUrls[d.storage_path] : undefined,
  }));

  const prcStage = serviceCode === "PRC" ? normalisePrcStage(line?.prc_subtype) : null;
  const heading = [
    serviceLabel(serviceCode),
    prcStage ? prcStageLabel(prcStage) : null,
  ]
    .filter(Boolean)
    .join(": ");

  const backHref = `/partner/transfers/${transferId}`;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link href={backHref} className="inline-flex items-center gap-1 text-sm text-ink-3 hover:text-ink-2">
        <ArrowLeft className="h-4 w-4" /> Back to {transfer.reference}
      </Link>

      <div>
        <h1 className="text-[40px] font-semibold leading-[1.06] tracking-[-0.032em] text-ink">{heading}</h1>
        <p className="mt-1 text-sm text-ink-3">
          {transfer.property_description || transfer.reference}
          {transfer.municipality ? ` · ${municipalityLabel(transfer.municipality)}` : ""}
          {transfer.council_region ? ` · ${transfer.council_region}` : ""}
        </p>
      </div>

      {/* The service is already taken. Said plainly rather than shown as a
          failing form — never dead-end (PRODUCT.md §5). */}
      {!line ? (
        <Card>
          <p className="text-sm text-ink-2">
            {serviceLabel(serviceCode)} is already open as a matter on this transaction, or is not on
            its service list.
          </p>
          <Link href={backHref} className="mt-3 inline-block text-sm font-medium text-action hover:underline">
            Back to the transaction
          </Link>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="min-w-0 space-y-6">
            {/* What this service needs, generated from the council registry —
                the same source the matter's own checklist uses, so the two
                cannot drift. */}
            <ExpectedDocuments
              municipality={transfer.municipality}
              serviceCode={serviceCode}
              prcStage={prcStage}
              defaultOpen
            />

            {/* Everything already on the transaction, and somewhere to add to
                it. Francois's point: sort the documents out while you are
                creating the matter, not afterwards. */}
            <TransferDocuments
              transferId={transferId}
              docs={docsWithUrls}
              canManage={false}
              canUpload
              sellerName={transfer.seller ? clientDisplayName(transfer.seller) : null}
              buyerName={transfer.buyer ? clientDisplayName(transfer.buyer) : null}
              nameSubject={transfer.property_description || transfer.reference}
              municipality={transfer.municipality}
            />
          </div>

          <div className="min-w-0">
            <SubmitMatterForm
              transferId={transferId}
              transferReference={transfer.reference}
              serviceCode={serviceCode}
              serviceLabel={heading}
              prcStage={prcStage}
              backHref={backHref}
            />
          </div>
        </div>
      )}
    </div>
  );
}
