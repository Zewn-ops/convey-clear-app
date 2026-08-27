import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";
import { municipalityLabel, formatDate } from "@/lib/utils";
import { signedDocUrls } from "@/lib/storage";
import { docLabel } from "@/lib/prc-docs";
import { matterPhaseLabel } from "@/lib/phase-label";
import {
  TRANSFER_STATUS_LABELS,
  MATTER_STATUS_LABELS,
  type TransferStatus,
  type MatterStatus,
} from "@/types";
import { ArrowLeft, FileText, Briefcase } from "lucide-react";
import TransferServices, { type ServiceRow } from "@/components/transfers/TransferServices";
import {
  serviceProgress,
  LINKED_MATTER_SELECT,
  type LinkedMatterShape,
} from "@/lib/transfer-service-progress";

export const metadata = { title: "Transfer — ConveyClear" };
export const dynamic = "force-dynamic";

/**
 * One property transfer, as the client sees it (2026-08-11 §96 / §46).
 *
 * THE FIELD LIST IS THE WHOLE RISK, so it is worth stating what is here and what
 * is not. Present: reference, property, status, the client's OWN matters under
 * the transaction, and documents ConveyClear has shared. Absent, deliberately:
 * the other party, the attorney firm, the estate agent, internal notes, and the
 * CC↔firm feed.
 *
 * Every exclusion is enforced by the database as well as by this file:
 *   · the transfer comes from `client_transfers` (062), which has no column for
 *     the other party or the firm;
 *   · matters are read through the client's existing RLS, so a matter belonging
 *     to the other side of the same transaction simply is not returned;
 *   · documents are read through `transfer_documents`, whose party path (058)
 *     returns only rows a member of staff has marked 'parties'.
 *
 * So this page cannot leak by being edited carelessly — but do not treat that as
 * licence to add a column here without checking the decision.
 */
interface TransferRow {
  id: string;
  reference: string;
  property_description: string | null;
  municipality: string | null;
  status: TransferStatus;
  created_at: string;
  updated_at: string;
}

interface MatterRow {
  id: string;
  title: string;
  current_phase: string | null;
  status: MatterStatus;
  services?: { code: string | null; name: string | null } | null;
}

interface DocRow {
  id: string;
  document_type: string;
  file_name: string | null;
  created_at: string;
  storage_bucket: string | null;
  storage_path: string | null;
}

function statusVariant(s: TransferStatus): "info" | "success" | "danger" | "warning" {
  return ({ open: "info", registered: "success", cancelled: "danger", on_hold: "warning" } as const)[s] ?? "info";
}

export default async function ClientTransferDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSessionProfile();
  if (!session) redirect("/auth/login");

  const supabase = await createClient();

  // The view is the gate: a transfer the caller is not a party to returns no row
  // and this 404s, which is also the right answer for one that does not exist.
  const { data: transferRow } = await supabase
    .from("client_transfers")
    .select("id, reference, property_description, municipality, status, created_at, updated_at")
    .eq("id", id)
    .maybeSingle();
  const transfer = transferRow as TransferRow | null;
  if (!transfer) notFound();

  // The client's OWN matters under this transaction. matters RLS already scopes
  // to their entities, so the other side's matters on the same transfer are
  // absent without a filter here.
  const { data: matterRows } = await supabase
    .from("matters")
    .select("id, title, current_phase, status, services(code, name)")
    .eq("transfer_id", id)
    .order("created_at", { ascending: false });
  const matters = (matterRows as MatterRow[] | null) ?? [];

  // The umbrella checklist (063), read-only. Reaches the client through
  // client_can_view_transfer() — the party-based function 062 added so that
  // letting a client see their transaction does not widen anything else. It
  // carries no other side's identity and no documents, only what work this
  // transaction needs.
  const { data: serviceItems } = await supabase
    .from("transfer_services")
    .select("id, parent_id, service_code, label, status, third_party, notes, matter_id, position, "
        + LINKED_MATTER_SELECT)
    .eq("transfer_id", id)
    .order("position", { ascending: true });

  // Shared documents only. 058's party policy returns rows with
  // visibility='parties'; an 'internal' one is never returned, which is what
  // keeps the buyer blind to the seller's FICA.
  const { data: docRows } = await supabase
    .from("transfer_documents")
    .select("id, document_type, file_name, created_at, storage_bucket, storage_path")
    .eq("transfer_id", id)
    .order("created_at", { ascending: false });
  const docs = (docRows as DocRow[] | null) ?? [];
  const urls = await signedDocUrls(supabase, docs);

  // Progress is the linked matter's, derived here so the pipeline definitions
  // stay out of the client bundle.
  const serviceRows: ServiceRow[] = (
    (serviceItems as unknown as (ServiceRow & { matters?: LinkedMatterShape | null })[] | null) ?? []
  ).map((r) => ({
    ...r,
    progress: serviceProgress(r.status, r.matters ?? null, "client"),
    matterTitle: r.matters?.title ?? null,
  }));

  return (
    <div className="space-y-6">
      <Link href="/dashboard/transfers" className="inline-flex items-center gap-1 text-sm text-ink-3 hover:text-ink-2">
        <ArrowLeft className="h-4 w-4" /> Back to my transfers
      </Link>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[40px] font-semibold leading-[1.06] tracking-[-0.032em] text-ink">
            {transfer.property_description || transfer.reference}
          </h1>
          <p className="text-sm text-ink-3 mt-1">
            {[transfer.reference, municipalityLabel(transfer.municipality)].filter(Boolean).join(" · ")}
          </p>
        </div>
        <Badge label={TRANSFER_STATUS_LABELS[transfer.status]} variant={statusVariant(transfer.status)} />
      </div>

      <Card className="space-y-3">
        <p className="text-xs font-semibold text-ink-3 uppercase tracking-wide">The transaction</p>
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          <div>
            <dt className="text-xs text-ink-3">Reference</dt>
            <dd className="text-sm text-ink">{transfer.reference}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-3">Status</dt>
            <dd className="text-sm text-ink">{TRANSFER_STATUS_LABELS[transfer.status]}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-3">Property</dt>
            <dd className={transfer.property_description ? "text-sm text-ink" : "text-sm text-ink-3 italic"}>
              {transfer.property_description ?? "Not captured"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-ink-3">Opened</dt>
            <dd className="text-sm text-ink">{formatDate(transfer.created_at)}</dd>
          </div>
        </dl>
      </Card>

      {/* The umbrella (063), read-only. Meeting §110 wants the transfer to be the
          primary view for clients too, and §112 is explicit that both the
          attorney and the client should be able to track each component. This is
          the honest answer to "what still has to happen on my house". */}
      {(serviceItems?.length ?? 0) > 0 && (
        <Card padding="none" className="overflow-hidden">
          <div className="px-5 py-4 border-b border-line">
            <p className="text-xs font-semibold text-ink-3 uppercase tracking-wide">What this transfer needs</p>
          </div>
          <TransferServices
            transferId={id}
            rows={serviceRows}
            matterHrefBase="/dashboard/matters"
          />
        </Card>
      )}

      <Card className="space-y-3">
        <p className="text-xs font-semibold text-ink-3 uppercase tracking-wide">Your matters in this transfer</p>
        {matters.length === 0 ? (
          <div className="py-8 text-center">
            <Briefcase className="h-7 w-7 mx-auto text-ink-3" />
            <p className="text-sm text-ink-2 mt-2">Nothing on your side yet.</p>
            <p className="text-xs text-ink-3 mt-1">
              Rates clearance and change of ownership appear here once they are opened.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-line">
            {matters.map((m) => (
              <Link
                key={m.id}
                href={`/dashboard/matters/${m.id}`}
                className="flex items-center justify-between gap-4 py-2.5 hover:bg-raised -mx-2 px-2 rounded"
              >
                <div className="min-w-0">
                  <p className="text-sm text-ink truncate">{m.services?.name ?? m.title}</p>
                  <p className="text-xs text-ink-3">{matterPhaseLabel(m.current_phase)}</p>
                </div>
                <Badge label={MATTER_STATUS_LABELS[m.status]} variant="info" />
              </Link>
            ))}
          </div>
        )}
      </Card>

      <Card className="space-y-3">
        <div>
          <p className="text-xs font-semibold text-ink-3 uppercase tracking-wide">Shared documents</p>
          {/* Said plainly so an empty list reads as "nothing shared yet" rather
              than "the portal is broken" — and so nobody assumes they are seeing
              everything on the transaction. */}
          <p className="text-xs text-ink-3 mt-1">
            Documents ConveyClear has released to you. Others on the transaction may exist that are
            not yours to see.
          </p>
        </div>
        {docs.length === 0 ? (
          <div className="py-8 text-center">
            <FileText className="h-7 w-7 mx-auto text-ink-3" />
            <p className="text-sm text-ink-2 mt-2">Nothing shared with you yet.</p>
          </div>
        ) : (
          <div className="divide-y divide-line">
            {docs.map((d) => (
              <div key={d.id} className="flex items-center justify-between gap-4 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm text-ink truncate">{d.file_name || docLabel(d.document_type)}</p>
                  <p className="text-xs text-ink-3">
                    {docLabel(d.document_type)} · {formatDate(d.created_at)}
                  </p>
                </div>
                {urls[d.id] && (
                  <a
                    href={urls[d.id]}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 text-sm text-action hover:underline"
                  >
                    View
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
