import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import Card from "@/components/ui/Card";
import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";
import { formatDate } from "@/lib/utils";
import {
  clientDisplayName,
  MATTER_STATUS_LABELS,
  PHASE_LABELS,
  PRIORITY_LABELS,
  type Matter,
  type MatterDocument,
  type MatterPhase,
  type MatterPriority,
  type MatterStatus,
  type TransferDocument,
} from "@/types";
import PhaseProgress from "@/components/ui/PhaseProgress";
import { getPipeline, phaseLabel, phaseOrder, phaseSteps, stageLabel } from "@/lib/pipelines";
import { ArrowLeft, FileText } from "lucide-react";
import ClientDocUpload from "@/components/dashboard/ClientDocUpload";
import MatterEnquiries from "@/components/enquiries/MatterEnquiries";
import { getMatterEnquiries } from "@/lib/enquiries";
import { signedDocUrls } from "@/lib/storage";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function MatterDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSessionProfile();
  if (!session) redirect("/auth/login");

  const supabase = await createClient();
  // RLS ensures the row only returns if this user may access it.
  const { data: matterData } = await supabase
    .from("matters")
    .select(
      "id, title, current_phase, current_stage, status, priority, deadline, deal_value, municipality, service_subtype, service_notes, transfer_id, created_at, clients(id, entity_type, full_name, business_name), services(code, name)"
    )
    .eq("id", id)
    .maybeSingle();
  // Matter does not model the services relation or service_subtype, and it types
  // current_phase as MatterPhase ("1".."4") even though the pipeline phases are
  // slugs. Widened here rather than reshaping the shared type mid-flight.
  type MatterWithService = Matter & {
    service_subtype?: string | null;
    services?: { code?: string | null; name?: string | null } | null;
  };
  const matter = matterData as MatterWithService | null;
  if (!matter) notFound();

  // Transaction documents the client is allowed to see (058, Meeting 2 §40/§100).
  // No visibility filter here on purpose: transfer_documents_party_read already
  // decides — shared documents, plus anything that came out of this client's own
  // vault. Re-stating the rule in the query would be a second, weaker copy of it.
  const { data: sharedDocsData } = matter.transfer_id
    ? await supabase
        .from("transfer_documents")
        .select("id, transfer_id, document_type, file_name, storage_bucket, storage_path, created_at, visibility, client_document_id, uploaded_by, mime_type, size_bytes")
        .eq("transfer_id", matter.transfer_id)
        .eq("status", "current")
        .order("created_at", { ascending: false })
    : { data: [] };
  const sharedDocs = (sharedDocsData as TransferDocument[] | null) ?? [];
  const sharedUrls =
    sharedDocs.length > 0 ? await signedDocUrls(createAdminClient(), sharedDocs) : {};

  const { data: docsData } = await supabase
    .from("documents")
    .select("id, matter_id, document_type, document_status, file_name, verified, created_at, storage_bucket, storage_path, drive_file_id")
    .eq("matter_id", id)
    // Hide documents replaced by a newer upload in the same slot (migration 030).
    .neq("document_status", "superseded")
    .order("created_at", { ascending: false });
  const documents = (docsData as MatterDocument[] | null) ?? [];
  // Signed, short-lived URLs so the client can view/download their own documents
  // (bucket-aware — a reused FICA-vault doc lives in the client-documents bucket).
  const signedUrls = documents.length > 0 ? await signedDocUrls(createAdminClient(), documents) : {};

  // The shared enquiry thread (#3). RLS hands a client only the 'shared' threads
  // on this matter — never the firm's own channel with ConveyClear.
  const enquiryThreads = await getMatterEnquiries(supabase, id);

  // Which progress bar this matter gets. A matter on a pipeline phase
  // ("onboarding", "operations", …) has no numeric phase, so the legacy 4-phase
  // bar below measured Number("onboarding") = NaN and rendered every segment
  // grey — an inert bar on the client's own matter. Prefer the pipeline bar,
  // which is what the partner portal already shows, and keep the legacy bar for
  // older matters that really do carry "1".."4".
  const pipeline = getPipeline(matter.services?.code, matter.municipality, matter.service_subtype);
  const pipelineSteps = pipeline ? phaseSteps(pipeline) : [];
  const pipelineIdx = pipeline ? phaseOrder(pipeline, matter.current_phase) : -1;
  const hasPipelineProgress = pipeline !== null && pipelineIdx >= 0;

  const phases: MatterPhase[] = ["1", "2", "3", "4"];
  const isClient = session.profile?.role === "client";

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Link
        href="/dashboard/matters"
        className="inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-action"
      >
        <ArrowLeft className="h-4 w-4" /> All matters
      </Link>

      <div>
        <h1 className="text-[40px] font-semibold leading-[1.06] tracking-[-0.032em] text-action">
          {matter.title || clientDisplayName(matter.clients) || "Matter"}
        </h1>
        <p className="text-sm text-ink-3 mt-1">
          {clientDisplayName(matter.clients)}
          {matter.municipality ? ` · ${matter.municipality}` : ""}
        </p>
      </div>

      <Card>
        <p className="text-xs font-medium text-ink-3 uppercase tracking-wide mb-3">Progress</p>
        {hasPipelineProgress ? (
          <PhaseProgress
            phase={pipelineIdx + 1}
            total={pipelineSteps.length}
            // client=true: the client sees the outward-facing phase name, not
            // the internal one staff use.
            label={phaseLabel(pipeline, matter.current_phase, true)}
            done={pipelineIdx === pipelineSteps.length - 1}
          />
        ) : (
        <div className="flex gap-2">
          {phases.map((p) => {
            const active = matter.current_phase === p;
            const done = matter.current_phase ? Number(matter.current_phase) > Number(p) : false;
            return (
              <div key={p} className="flex-1">
                <div
                  className={`h-1.5 rounded-full ${
                    active ? "bg-action-fill" : done ? "bg-action-fill" : "bg-line"
                  }`}
                />
                <p className={`mt-1.5 text-[11px] ${active ? "text-action font-medium" : "text-ink-3"}`}>
                  {PHASE_LABELS[p]}
                </p>
              </div>
            );
          })}
        </div>
        )}
      </Card>

      {/* Facts */}
      <Card>
        <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
          <Fact label="Status" value={matter.status ? MATTER_STATUS_LABELS[matter.status as MatterStatus] : "—"} />
          <Fact label="Priority" value={matter.priority ? PRIORITY_LABELS[matter.priority as MatterPriority] : "—"} />
          {/* stageLabel, not the raw column: current_stage holds a slug, so this
              read "inquiry" to the client instead of the stage's real name. */}
          <Fact
            label="Stage"
            value={matter.current_stage ? stageLabel(pipeline, matter.current_stage) : "—"}
          />
          <Fact label="Deadline" value={matter.deadline ? formatDate(matter.deadline) : "—"} />
          <Fact label="Opened" value={formatDate(matter.created_at)} />
          {matter.service_notes && <Fact label="Notes" value={matter.service_notes} />}
        </dl>
      </Card>

      {/* Enquiries — the client's direct line to ConveyClear on this matter (#3). */}
      <MatterEnquiries matterId={id} threads={enquiryThreads} audience="client" />

      {/* Upload (client only) */}
      {isClient && <ClientDocUpload matterId={matter.id} />}

      {/* Documents */}
      <div>
        <h2 className="font-semibold text-ink mb-3">Documents</h2>
        {documents.length > 0 ? (
          <Card padding="none" className="overflow-hidden">
            <ul className="divide-y divide-line">
              {documents.map((doc) => (
                <li key={doc.id} className="flex items-center gap-3 px-5 py-3">
                  <FileText className="h-4 w-4 text-ink-3 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-ink truncate">
                      {doc.file_name || doc.document_type}
                    </p>
                    <p className="text-xs text-ink-3">
                      {doc.document_type} · {formatDate(doc.created_at)}
                    </p>
                  </div>
                  {doc.verified && (
                    <span className="text-xs text-green-600 font-medium shrink-0">Verified</span>
                  )}
                  {doc.storage_path && signedUrls[doc.storage_path] ? (
                    <a href={signedUrls[doc.storage_path]} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-action hover:underline shrink-0">View</a>
                  ) : doc.drive_file_id ? (
                    <a href={`https://drive.google.com/file/d/${doc.drive_file_id}/view`} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-action hover:underline shrink-0">View</a>
                  ) : null}
                </li>
              ))}
            </ul>
          </Card>
        ) : (
          <Card className="text-center py-8">
            <p className="text-ink-3 text-sm">No documents yet</p>
          </Card>
        )}

        {/* Documents about the TRANSACTION rather than this matter (058).
            Rendered only when there is something to show: an empty "Transaction
            documents" heading on every matter would read as something being
            broken, when the truthful state is that nothing has been shared. */}
        {sharedDocs.length > 0 && (
          <div className="mt-8">
            <h2 className="font-semibold text-ink mb-1">Transaction documents</h2>
            <p className="text-xs text-ink-3 mb-3">
              Shared with you by ConveyClear for this property transaction.
            </p>
            <Card padding="none" className="overflow-hidden">
              <ul className="divide-y divide-line">
                {sharedDocs.map((doc) => (
                  <li key={doc.id} className="flex items-center gap-3 px-5 py-3">
                    <FileText className="h-4 w-4 text-ink-3 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-ink truncate">
                        {doc.file_name || doc.document_type}
                      </p>
                      <p className="text-xs text-ink-3">
                        {doc.document_type} · {formatDate(doc.created_at)}
                      </p>
                    </div>
                    {doc.storage_path && sharedUrls[doc.storage_path] ? (
                      <a
                        href={sharedUrls[doc.storage_path]}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-medium text-action hover:underline shrink-0"
                      >
                        View
                      </a>
                    ) : null}
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-ink-3">{label}</dt>
      <dd className="text-ink mt-0.5">{value}</dd>
    </div>
  );
}
