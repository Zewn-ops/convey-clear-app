import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";
import Card from "@/components/ui/Card";
import StatusPill, { type StatusTone } from "@/components/ui/StatusPill";
import MetaChip from "@/components/ui/MetaChip";
import Callout from "@/components/ui/Callout";
import { workdaysSince } from "@/lib/elapsed";
import PartnerDocUpload from "@/components/partner/PartnerDocUpload";
import PartiesCard from "@/components/matters/PartiesCard";
import MatterTransferCard, { type LinkedTransfer } from "@/components/matters/MatterTransferCard";
import MatterEnquiries from "@/components/enquiries/MatterEnquiries";
import { getMatterEnquiries } from "@/lib/enquiries";
import PipelineProgress from "@/components/matters/PipelineProgress";
import StorageUpload from "@/components/matters/StorageUpload";
import InPlaceIntake from "@/components/matters/InPlaceIntake";
import InPlaceFica from "@/components/matters/InPlaceFica";
import { buildFicaSubjects } from "@/lib/fica";
import { createAdminClient } from "@/lib/supabase/admin";
import { signedDocUrls } from "@/lib/storage";
import { getPipeline } from "@/lib/pipelines";
import { formatDate } from "@/lib/utils";
import {
  clientDisplayName,
  MATTER_STATUS_LABELS,
  type Client,
  type TransferDocument,
  type Matter,
  type MatterStatus,
  type MatterDocument,
  type MatterParty,
  type ClientDocument,
} from "@/types";
import { ArrowLeft, FileText } from "lucide-react";

export default async function PartnerMatterDetail({ params }: { params: { id: string } }) {
  const supabase = await createClient();

  const { data: matterData } = await supabase
    .from("matters")
    .select("id, title, current_phase, current_stage, status, municipality, service_subtype, service_data, partner_file_ref, service_notes, deadline, transfer_id, created_at, clients(id, entity_type, full_name, business_name, primary_email, primary_cell), services(code), property_transfers(id, reference, status)")
    .eq("id", params.id)
    .maybeSingle();

  if (!matterData) notFound();
  const matter = matterData as unknown as Matter & { property_transfers?: LinkedTransfer | null };

  // Opening a matter clears its unread notification dot for this user.
  const meId = (await getSessionProfile())?.profile?.id ?? null;
  if (meId) {
    await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", meId)
      .eq("matter_id", params.id)
      .is("read_at", null);
  }
  const client = matter.clients as
    | {
        id: string;
        entity_type: string;
        full_name: string | null;
        business_name: string | null;
        primary_email: string | null;
        primary_cell: string | null;
      }
    | null;

  const [{ data: docsData }, { data: actData }, { data: partiesData }] = await Promise.all([
    // .neq: hide documents replaced by a newer upload in the same slot (migration 030).
    supabase.from("documents").select("id, document_type, document_status, file_name, uploaded_at, verified, matter_party_id, storage_bucket, storage_path, drive_file_id, uploaded_by, client_document_id, transfer_document_id").eq("matter_id", params.id).neq("document_status", "superseded"),
    // Comment-type ('post') activities are INTERNAL ONLY — partners (and clients)
    // see only lifecycle events, never staff notes. (Jukka, 2026-06-16.)
    supabase.from("matter_activities").select("id, body, activity_type, created_at").eq("matter_id", params.id).in("activity_type", ["status_change", "document_upload", "phase_transition", "poa_signed"]).order("created_at", { ascending: false }).limit(20),
    supabase.from("matter_parties").select("*").eq("matter_id", params.id).order("role", { ascending: true }),
  ]);
  const docs = (docsData as MatterDocument[] | null) ?? [];
  const parties = (partiesData as MatterParty[] | null) ?? [];
  const signedUrls = docs.length > 0 ? await signedDocUrls(createAdminClient(), docs) : {};

  // FICA vault (migration 025): reusable docs for the matter's client + each
  // party's linked client, so the intake can offer "Reuse".
  const matterClientId = (matter as unknown as { clients?: { id?: string | null } | null }).clients?.id ?? null;
  const vaultClientIds = Array.from(
    new Set([matterClientId, ...parties.map((p) => p.client_id)].filter((x): x is string => Boolean(x)))
  );
  const vaultByClient: Record<string, ClientDocument[]> = {};
  if (vaultClientIds.length > 0) {
    const { data: vaultRows } = await supabase
      .from("client_documents")
      .select("id, client_id, document_type, file_name, mime_type, size_bytes, storage_bucket, storage_path, uploaded_by, created_at, status, expiry_date, verified")
      .in("client_id", vaultClientIds)
      // Only CURRENT documents are reusable — not superseded or archived ones (032).
      .eq("status", "current");
    for (const r of (vaultRows as ClientDocument[] | null) ?? []) {
      (vaultByClient[r.client_id] ??= []).push(r);
    }
  }

  // Transfer-level documents (034) — the firm reuses the property's deed search
  // etc. on this matter's shared slots rather than re-fetching them. RLS confines
  // this to transfers whose attorney firm is theirs.
  const partnerTransferId = (matter as unknown as { transfer_id?: string | null }).transfer_id ?? null;
  const { data: transferDocData } = partnerTransferId
    ? await supabase
        .from("transfer_documents")
        .select("id, transfer_id, document_type, file_name, mime_type, size_bytes, storage_bucket, storage_path, status, verified, uploaded_by, created_at")
        .eq("transfer_id", partnerTransferId)
        .eq("status", "current")
    : { data: null };
  const transferDocs = (transferDocData as TransferDocument[] | null) ?? [];

  // In-place FICA (033) — the firm can complete the client's details and record
  // consent without ConveyClear sending an onboarding link. Municipal-portal
  // credentials are excluded for partners (isStaff=false): they are the client's
  // own council login and the firm has no business holding them. The API enforces
  // that too — it refuses those fields from a partner, it doesn't just hide them.
  const ficaSubjects = await buildFicaSubjects(supabase, matterClientId, parties);

  const activities = (actData as { id: string; body: string; activity_type: string; created_at: string }[] | null) ?? [];

  // The shared enquiry thread on this matter (#3). RLS gives the firm its own
  // threads plus every 'shared' one on a matter it can access.
  const enquiryThreads = await getMatterEnquiries(supabase, params.id);

  const serviceCode = (matter as unknown as { services?: { code?: string } | null }).services?.code ?? null;
  const pipeline = getPipeline(serviceCode, matter.municipality, (matter as unknown as { service_subtype?: string | null }).service_subtype);

  // Council/COT decision the partner is allowed to see. Resolved from
  // service_data.stage_outcome against the pipeline; shown only when the chosen
  // outcome is client-visible (e.g. RCF Memo Approved/Delayed/Rejected + reason).
  const sd = ((matter as unknown as { service_data?: Record<string, unknown> | null }).service_data ?? {}) as Record<string, unknown>;
  let decisionLabel: string | null = null;
  if (pipeline && sd.stage_outcome) {
    for (const ph of pipeline.phases) {
      for (const st of ph.stages) {
        const o = st.outcomes?.find((x) => x.key === sd.stage_outcome);
        if (o && o.clientVisible) {
          const r = o.reasons?.find((x) => x.key === sd.stage_reason);
          decisionLabel = `${o.label}${r ? ` — ${r.label}` : ""}`;
        }
      }
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Back to the transfer when the matter belongs to one — that is where the
          user came from. Partners may read their own firm's transfers, so this
          link is always reachable for them. (The CLIENT dashboard deliberately
          keeps "All matters": clients have no transfer-level access at all,
          migration 026, because a transfer spans both sides of the deal.) */}
      <Link
        href={partnerTransferId ? `/partner/transfers/${partnerTransferId}` : "/partner/matters"}
        className="inline-flex items-center gap-1 text-sm text-ink-3 hover:text-ink-2"
      >
        <ArrowLeft className="h-4 w-4" />{" "}
        {partnerTransferId ? matter.property_transfers?.reference ?? "Property transfer" : "Back to matters"}
      </Link>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[40px] font-semibold leading-[1.06] tracking-[-0.032em] text-ink">{matter.title || clientDisplayName(client) || "Matter"}</h1>
          <div className="mt-4 flex flex-wrap gap-2">
            {matter.municipality && <MetaChip label="Council" value={matter.municipality} />}
            {(() => {
              const open = workdaysSince(matter.created_at);
              return open === null ? null : (
                <MetaChip
                  label="Open"
                  value={`${open} workday${open === 1 ? "" : "s"}`}
                  tone={open > 60 ? "waiting" : "neutral"}
                />
              );
            })()}
            <MetaChip label="Opened" value={formatDate(matter.created_at)} />
            {matter.partner_file_ref && <MetaChip label="Your ref" value={matter.partner_file_ref} />}
          </div>
        </div>
        {matter.status && (
          <StatusPill
            tone={
              ({ new: "waiting", open: "action", on_hold: "waiting", won: "ok", lost: "danger", archived: "neutral" } as Record<string, StatusTone>)[
                matter.status
              ] ?? "neutral"
            }
          >
            {MATTER_STATUS_LABELS[matter.status as MatterStatus]}
          </StatusPill>
        )}
      </div>

      {/* Parent property transfer, when this matter belongs to one (read-only). */}
      <MatterTransferCard
        matterId={params.id}
        transfer={matter.property_transfers ?? null}
        basePath="/partner/transfers"
      />

      {/* Pipeline progress (client-facing view) */}
      {pipeline && (
        <Card>
          <PipelineProgress
            pipeline={pipeline}
            currentPhase={matter.current_phase}
            currentStage={(matter as unknown as { current_stage?: string | null }).current_stage ?? null}
            audience="client"
          />
        </Card>
      )}

      {/* Council decision (e.g. COT Decision: Memo Approved/Delayed/Rejected) */}
      {decisionLabel && (
        <Callout tone="waiting" label="Council decision">
          <span className="text-[17px] font-semibold text-ink">{decisionLabel}</span>
        </Callout>
      )}

      {/* Council rates account number (read-only for partners) */}
      {typeof sd.rates_account_no === "string" && sd.rates_account_no && (
        <Card>
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.09em] text-ink-3">Rates account number</p>
          <p className="mt-1 text-[17px] font-semibold tabular-nums text-ink">{sd.rates_account_no}</p>
        </Card>
      )}

      {/* Upload docs for the client — hidden once documents have been submitted */}
      <PartnerDocUpload matterId={matter.id} submitted={docs.length > 0} />

      {/* Parties (COO buyer/seller) — renders nothing for single-client matters */}
      {/* Party FICA moved INTO the party card (see PartiesCard). Passing the
          subjects here keeps the partner's capture where staff's now is, rather
          than silently removing it when InPlaceFica stopped rendering parties. */}
      <PartiesCard
        parties={parties}
        matterId={params.id}
        ficaSubjects={ficaSubjects}
        isStaff={false}
        municipality={matter.municipality}
        serviceCode={serviceCode}
        prcStage={(matter as unknown as { service_subtype?: string | null }).service_subtype ?? null}
      />

      {/* In-place FICA — client details + consent, without an onboarding link. */}
      <InPlaceFica
        matterId={params.id}
        subjects={ficaSubjects}
        isStaff={false}
        municipality={matter.municipality}
        serviceCode={serviceCode}
        prcStage={(matter as unknown as { service_subtype?: string | null }).service_subtype ?? null}
      />

      {/* In-place intake — service-aware required-document checklist + upload.
          Partners upload on the client's behalf and may mark an optional document
          "not available"; without that, partner-side intake progress could never
          reach complete. toggleDocUnavailable authorises the firm itself.
          Renders null for non-COO/PRC. */}
      <InPlaceIntake
        matterId={matter.id}
        serviceCode={serviceCode}
        serviceSubtype={(matter as unknown as { service_subtype?: string | null }).service_subtype ?? null}
        parties={parties}
        documents={docs}
        municipality={matter.municipality}
        unavailable={Array.isArray(sd.docs_unavailable) ? (sd.docs_unavailable as string[]) : []}
        canManage
        vaultByClient={vaultByClient}
        matterClientId={matterClientId}
        transferDocs={transferDocs}
      />

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Client (single-client matters only) */}
        {client && (
        <Card>
          <h2 className="text-[19px] font-semibold tracking-[-0.015em] text-ink mb-4">Client</h2>
          <dl className="space-y-2.5 text-[14px]">
            <div className="flex justify-between"><dt className="text-ink-3">Name</dt><dd className="text-ink">{clientDisplayName(client)}</dd></div>
            <div className="flex justify-between"><dt className="text-ink-3">Type</dt><dd className="text-ink">{client?.entity_type?.replace("_", " ") || "—"}</dd></div>
            <div className="flex justify-between"><dt className="text-ink-3">Email</dt><dd className="text-ink">{client?.primary_email || "—"}</dd></div>
            <div className="flex justify-between"><dt className="text-ink-3">Cell</dt><dd className="text-ink">{client?.primary_cell || "—"}</dd></div>
          </dl>
        </Card>
        )}

        {/* Documents — your / client uploads vs ConveyClear uploads (note 29) */}
        <Card>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[19px] font-semibold tracking-[-0.015em] text-ink">Documents</h2>
            <StorageUpload matterId={matter.id} />
          </div>
          {docs.length === 0 ? (
            <p className="text-sm text-ink-3">No documents yet.</p>
          ) : (
            <div className="space-y-4">
              {([
                { title: "Your / client uploads", list: docs.filter((d) => ["client", "attorney"].includes((d as { uploaded_by?: string | null }).uploaded_by ?? "")) },
                { title: "ConveyClear uploads", list: docs.filter((d) => !["client", "attorney"].includes((d as { uploaded_by?: string | null }).uploaded_by ?? "")) },
              ] as const).map((grp) => (
                <div key={grp.title}>
                  <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.09em] text-ink-3">{grp.title} ({grp.list.length})</p>
                  {grp.list.length === 0 ? (
                    <p className="text-sm text-ink-3">None.</p>
                  ) : (
                    <ul className="space-y-2">
                      {grp.list.map((d) => (
                        <li key={d.id} className="flex items-center gap-2 text-sm">
                          <FileText className="h-4 w-4 text-ink-3 shrink-0" />
                          <span className="flex-1 text-ink-2 truncate">{d.file_name || d.document_type}</span>
                          {d.storage_path && signedUrls[d.storage_path] ? (
                            <a href={signedUrls[d.storage_path]} target="_blank" rel="noopener noreferrer" className="shrink-0 text-xs font-semibold text-action hover:underline">View</a>
                          ) : d.drive_file_id ? (
                            <a href={`https://drive.google.com/file/d/${d.drive_file_id}/view`} target="_blank" rel="noopener noreferrer" className="shrink-0 text-xs font-semibold text-action hover:underline">View</a>
                          ) : null}
                          {d.verified && <StatusPill tone="ok">Verified</StatusPill>}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Activity */}
      <Card>
        <h2 className="text-[19px] font-semibold tracking-[-0.015em] text-ink mb-4">Activity</h2>
        {activities.length === 0 ? (
          <p className="text-sm text-ink-3">No activity yet.</p>
        ) : (
          <ul className="space-y-3">
            {activities.map((a) => (
              <li key={a.id} className="flex gap-3 text-sm">
                <div className="mt-1 h-2 w-2 rounded-full bg-action shrink-0" />
                <div>
                  <p className="text-ink-2">{a.body}</p>
                  <p className="text-xs text-ink-3">{formatDate(a.created_at)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Enquiries — the shared thread with ConveyClear and the client (#3). */}
      <MatterEnquiries matterId={params.id} threads={enquiryThreads} audience="partner" />
    </div>
  );
}
