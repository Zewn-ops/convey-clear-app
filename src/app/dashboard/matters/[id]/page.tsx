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
} from "@/types";
import { ArrowLeft, FileText } from "lucide-react";

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
      "id, title, current_phase, current_stage, status, priority, deadline, deal_value, municipality, service_notes, created_at, clients(id, entity_type, full_name, business_name)"
    )
    .eq("id", id)
    .maybeSingle();
  const matter = matterData as Matter | null;
  if (!matter) notFound();

  const { data: docsData } = await supabase
    .from("documents")
    .select("id, matter_id, document_type, document_status, file_name, verified, created_at")
    .eq("matter_id", id)
    .order("created_at", { ascending: false });
  const documents = (docsData as MatterDocument[] | null) ?? [];

  const phases: MatterPhase[] = ["1", "2", "3", "4"];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Link
        href="/dashboard/matters"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-[#1B2E6B]"
      >
        <ArrowLeft className="h-4 w-4" /> All matters
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-[#1B2E6B]">
          {matter.title || clientDisplayName(matter.clients) || "Matter"}
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          {clientDisplayName(matter.clients)}
          {matter.municipality ? ` · ${matter.municipality}` : ""}
        </p>
      </div>

      {/* 4-phase progress */}
      <Card>
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Progress</p>
        <div className="flex gap-2">
          {phases.map((p) => {
            const active = matter.current_phase === p;
            const done = matter.current_phase ? Number(matter.current_phase) > Number(p) : false;
            return (
              <div key={p} className="flex-1">
                <div
                  className={`h-1.5 rounded-full ${
                    active ? "bg-[#E8521A]" : done ? "bg-[#1B2E6B]" : "bg-gray-200"
                  }`}
                />
                <p className={`mt-1.5 text-[11px] ${active ? "text-[#E8521A] font-medium" : "text-gray-400"}`}>
                  {PHASE_LABELS[p]}
                </p>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Facts */}
      <Card>
        <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
          <Fact label="Status" value={matter.status ? MATTER_STATUS_LABELS[matter.status as MatterStatus] : "—"} />
          <Fact label="Priority" value={matter.priority ? PRIORITY_LABELS[matter.priority as MatterPriority] : "—"} />
          <Fact label="Stage" value={matter.current_stage || "—"} />
          <Fact label="Deadline" value={matter.deadline ? formatDate(matter.deadline) : "—"} />
          <Fact label="Opened" value={formatDate(matter.created_at)} />
          {matter.service_notes && <Fact label="Notes" value={matter.service_notes} />}
        </dl>
      </Card>

      {/* Documents */}
      <div>
        <h2 className="font-semibold text-gray-900 mb-3">Documents</h2>
        {documents.length > 0 ? (
          <Card padding="none">
            <ul className="divide-y divide-gray-100">
              {documents.map((doc) => (
                <li key={doc.id} className="flex items-center gap-3 px-5 py-3">
                  <FileText className="h-4 w-4 text-gray-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">
                      {doc.file_name || doc.document_type}
                    </p>
                    <p className="text-xs text-gray-400">
                      {doc.document_type} · {formatDate(doc.created_at)}
                    </p>
                  </div>
                  {doc.verified && (
                    <span className="text-xs text-green-600 font-medium">Verified</span>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        ) : (
          <Card className="text-center py-8">
            <p className="text-gray-500 text-sm">No documents yet</p>
          </Card>
        )}
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-gray-400">{label}</dt>
      <dd className="text-gray-800 mt-0.5">{value}</dd>
    </div>
  );
}
