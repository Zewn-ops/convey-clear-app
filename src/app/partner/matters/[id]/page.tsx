import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import PartnerDocUpload from "@/components/partner/PartnerDocUpload";
import PartiesCard from "@/components/matters/PartiesCard";
import PipelineProgress from "@/components/matters/PipelineProgress";
import StorageUpload from "@/components/matters/StorageUpload";
import { createAdminClient } from "@/lib/supabase/admin";
import { signedDownloadUrls } from "@/lib/storage";
import { getPipeline } from "@/lib/pipelines";
import { formatDate } from "@/lib/utils";
import {
  clientDisplayName,
  MATTER_STATUS_LABELS,
  type Matter,
  type MatterStatus,
  type MatterDocument,
  type MatterParty,
} from "@/types";
import { ArrowLeft, FileText } from "lucide-react";

export default async function PartnerMatterDetail({ params }: { params: { id: string } }) {
  const supabase = await createClient();

  const { data: matterData } = await supabase
    .from("matters")
    .select("id, title, current_phase, current_stage, status, municipality, service_subtype, partner_file_ref, service_notes, deadline, created_at, clients(id, entity_type, full_name, business_name, primary_email, primary_cell), services(code)")
    .eq("id", params.id)
    .maybeSingle();

  if (!matterData) notFound();
  const matter = matterData as unknown as Matter;
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
    supabase.from("documents").select("id, document_type, document_status, file_name, uploaded_at, verified, matter_party_id, storage_bucket, storage_path, drive_file_id, uploaded_by").eq("matter_id", params.id),
    // Comment-type ('post') activities are INTERNAL ONLY — partners (and clients)
    // see only lifecycle events, never staff notes. (Jukka, 2026-06-16.)
    supabase.from("matter_activities").select("id, body, activity_type, created_at").eq("matter_id", params.id).in("activity_type", ["status_change", "document_upload", "phase_transition", "poa_signed"]).order("created_at", { ascending: false }).limit(20),
    supabase.from("matter_parties").select("*").eq("matter_id", params.id).order("role", { ascending: true }),
  ]);
  const docs = (docsData as MatterDocument[] | null) ?? [];
  const parties = (partiesData as MatterParty[] | null) ?? [];
  const storagePaths = docs.map((d) => d.storage_path).filter((p): p is string => Boolean(p));
  const signedUrls = storagePaths.length > 0 ? await signedDownloadUrls(createAdminClient(), storagePaths) : {};
  const activities = (actData as { id: string; body: string; activity_type: string; created_at: string }[] | null) ?? [];

  // Enquiries linked to this matter (C2 — partners view them from the matter page).
  const { data: enqData } = await supabase
    .from("enquiries")
    .select("id, subject, status, created_at")
    .eq("matter_id", params.id)
    .order("created_at", { ascending: false });
  const relatedEnquiries = (enqData ?? []) as { id: string; subject: string; status: string; created_at: string }[];

  const serviceCode = (matter as unknown as { services?: { code?: string } | null }).services?.code ?? null;
  const pipeline = getPipeline(serviceCode, matter.municipality, (matter as unknown as { service_subtype?: string | null }).service_subtype);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Link href="/partner/matters" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft className="h-4 w-4" /> Back to matters
      </Link>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{matter.title || clientDisplayName(client) || "Matter"}</h1>
          <p className="text-sm text-gray-500 mt-1">
            {matter.municipality || "—"} · Opened {formatDate(matter.created_at)}
            {matter.partner_file_ref ? ` · Your ref: ${matter.partner_file_ref}` : ""}
          </p>
        </div>
        {matter.status && (
          <Badge
            label={MATTER_STATUS_LABELS[matter.status as MatterStatus]}
            variant={({ new: "warning", open: "info", won: "success", lost: "danger", archived: "gray", on_hold: "warning" } as const)[matter.status] ?? "gray"}
          />
        )}
      </div>

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

      {/* Upload docs for the client — hidden once documents have been submitted */}
      <PartnerDocUpload matterId={matter.id} submitted={docs.length > 0} />

      {/* Parties (COO buyer/seller) — renders nothing for single-client matters */}
      <PartiesCard parties={parties} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Client (single-client matters only) */}
        {client && (
        <Card>
          <h2 className="font-semibold text-gray-900 mb-3">Client</h2>
          <dl className="space-y-1.5 text-sm">
            <div className="flex justify-between"><dt className="text-gray-500">Name</dt><dd className="text-gray-900">{clientDisplayName(client)}</dd></div>
            <div className="flex justify-between"><dt className="text-gray-500">Type</dt><dd className="text-gray-900">{client?.entity_type?.replace("_", " ") || "—"}</dd></div>
            <div className="flex justify-between"><dt className="text-gray-500">Email</dt><dd className="text-gray-900">{client?.primary_email || "—"}</dd></div>
            <div className="flex justify-between"><dt className="text-gray-500">Cell</dt><dd className="text-gray-900">{client?.primary_cell || "—"}</dd></div>
          </dl>
        </Card>
        )}

        {/* Documents — your / client uploads vs ConveyClear uploads (note 29) */}
        <Card>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-900">Documents</h2>
            <StorageUpload matterId={matter.id} />
          </div>
          {docs.length === 0 ? (
            <p className="text-sm text-gray-400">No documents yet.</p>
          ) : (
            <div className="space-y-4">
              {([
                { title: "Your / client uploads", list: docs.filter((d) => ["client", "attorney"].includes((d as { uploaded_by?: string | null }).uploaded_by ?? "")) },
                { title: "ConveyClear uploads", list: docs.filter((d) => !["client", "attorney"].includes((d as { uploaded_by?: string | null }).uploaded_by ?? "")) },
              ] as const).map((grp) => (
                <div key={grp.title}>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">{grp.title} ({grp.list.length})</p>
                  {grp.list.length === 0 ? (
                    <p className="text-sm text-gray-400">None.</p>
                  ) : (
                    <ul className="space-y-2">
                      {grp.list.map((d) => (
                        <li key={d.id} className="flex items-center gap-2 text-sm">
                          <FileText className="h-4 w-4 text-gray-400 shrink-0" />
                          <span className="flex-1 text-gray-700 truncate">{d.file_name || d.document_type}</span>
                          {d.storage_path && signedUrls[d.storage_path] ? (
                            <a href={signedUrls[d.storage_path]} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-[#1B2E6B] hover:underline shrink-0">View</a>
                          ) : d.drive_file_id ? (
                            <a href={`https://drive.google.com/file/d/${d.drive_file_id}/view`} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-[#1B2E6B] hover:underline shrink-0">View</a>
                          ) : null}
                          {d.verified && <Badge label="Verified" variant="success" />}
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
        <h2 className="font-semibold text-gray-900 mb-3">Activity</h2>
        {activities.length === 0 ? (
          <p className="text-sm text-gray-400">No activity yet.</p>
        ) : (
          <ul className="space-y-3">
            {activities.map((a) => (
              <li key={a.id} className="flex gap-3 text-sm">
                <div className="mt-1 h-2 w-2 rounded-full bg-[#1B2E6B] shrink-0" />
                <div>
                  <p className="text-gray-700">{a.body}</p>
                  <p className="text-xs text-gray-400">{formatDate(a.created_at)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Related enquiries (C2) */}
      {relatedEnquiries.length > 0 && (
        <Card>
          <h2 className="font-semibold text-gray-900 mb-3">Enquiries ({relatedEnquiries.length})</h2>
          <ul className="divide-y divide-gray-100">
            {relatedEnquiries.map((e) => (
              <li key={e.id} className="py-2">
                <Link href={`/partner/enquiries/${e.id}`} className="flex items-center justify-between gap-3 text-sm hover:text-[#1B2E6B]">
                  <span className="text-gray-800 truncate">{e.subject}</span>
                  <span className="text-xs text-gray-400 shrink-0">{e.status} · {formatDate(e.created_at)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
