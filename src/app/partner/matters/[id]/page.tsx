import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import PartnerDocUpload from "@/components/partner/PartnerDocUpload";
import PartiesCard from "@/components/matters/PartiesCard";
import StorageUpload from "@/components/matters/StorageUpload";
import { createAdminClient } from "@/lib/supabase/admin";
import { signedDownloadUrls } from "@/lib/storage";
import { formatDate } from "@/lib/utils";
import {
  clientDisplayName,
  PHASE_LABELS,
  MATTER_STATUS_LABELS,
  type Matter,
  type MatterPhase,
  type MatterStatus,
  type MatterDocument,
  type MatterParty,
} from "@/types";
import { ArrowLeft, FileText, CheckCircle2 } from "lucide-react";

const PHASES: MatterPhase[] = ["1", "2", "3", "4"];

export default async function PartnerMatterDetail({ params }: { params: { id: string } }) {
  const supabase = await createClient();

  const { data: matterData } = await supabase
    .from("matters")
    .select("id, title, current_phase, status, municipality, service_notes, deadline, created_at, clients(id, entity_type, full_name, business_name, primary_email, primary_cell)")
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
    supabase.from("documents").select("id, document_type, document_status, file_name, uploaded_at, verified, matter_party_id, storage_bucket, storage_path, drive_file_id").eq("matter_id", params.id),
    supabase.from("matter_activities").select("id, body, activity_type, created_at").eq("matter_id", params.id).order("created_at", { ascending: false }).limit(20),
    supabase.from("matter_parties").select("*").eq("matter_id", params.id).order("role", { ascending: true }),
  ]);
  const docs = (docsData as MatterDocument[] | null) ?? [];
  const parties = (partiesData as MatterParty[] | null) ?? [];
  const storagePaths = docs.map((d) => d.storage_path).filter((p): p is string => Boolean(p));
  const signedUrls = storagePaths.length > 0 ? await signedDownloadUrls(createAdminClient(), storagePaths) : {};
  const activities = (actData as { id: string; body: string; activity_type: string; created_at: string }[] | null) ?? [];

  const currentPhaseNum = matter.current_phase ? parseInt(matter.current_phase, 10) : 0;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Link href="/partner/matters" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft className="h-4 w-4" /> Back to matters
      </Link>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{matter.title || clientDisplayName(client) || "Matter"}</h1>
          <p className="text-sm text-gray-500 mt-1">{matter.municipality || "—"} · Opened {formatDate(matter.created_at)}</p>
        </div>
        {matter.status && (
          <Badge
            label={MATTER_STATUS_LABELS[matter.status as MatterStatus]}
            variant={({ open: "info", won: "success", lost: "danger", archived: "gray", on_hold: "warning" } as const)[matter.status] ?? "gray"}
          />
        )}
      </div>

      {/* 4-phase progress */}
      <Card>
        <div className="flex items-center justify-between">
          {PHASES.map((p, i) => {
            const n = i + 1;
            const done = currentPhaseNum > n;
            const active = currentPhaseNum === n;
            return (
              <div key={p} className="flex-1 flex flex-col items-center text-center">
                <div
                  className={
                    "flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold " +
                    (done ? "bg-green-500 text-white" : active ? "bg-[#1B2E6B] text-white" : "bg-gray-200 text-gray-500")
                  }
                >
                  {done ? <CheckCircle2 className="h-5 w-5" /> : n}
                </div>
                <p className={"mt-2 text-xs " + (active ? "font-semibold text-[#1B2E6B]" : "text-gray-500")}>{PHASE_LABELS[p]}</p>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Upload docs for the client */}
      <PartnerDocUpload matterId={matter.id} />

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

        {/* Documents */}
        <Card>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-900">Documents</h2>
            <StorageUpload matterId={matter.id} />
          </div>
          {docs.length === 0 ? (
            <p className="text-sm text-gray-400">No documents yet.</p>
          ) : (
            <ul className="space-y-2">
              {docs.map((d) => (
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
    </div>
  );
}
