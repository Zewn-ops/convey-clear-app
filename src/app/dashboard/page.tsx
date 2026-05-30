import { redirect } from "next/navigation";
import Link from "next/link";
import Card from "@/components/ui/Card";
import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";
import { formatDate } from "@/lib/utils";
import {
  clientDisplayName,
  PHASE_LABELS,
  type Matter,
  type MatterDocument,
  type MatterPhase,
} from "@/types";
import { Briefcase, Clock, CheckCircle, FolderOpen, FileText } from "lucide-react";

export const metadata = { title: "Dashboard — ConveyClear" };

export default async function DashboardPage() {
  const session = await getSessionProfile();
  if (!session) redirect("/auth/login");
  const profile = session.profile;

  const supabase = await createClient();

  // RLS scopes these automatically: client→own, partner→their clients, staff→all.
  const { data: mattersData } = await supabase
    .from("matters")
    .select(
      "id, title, current_phase, status, priority, deadline, created_at, clients(id, entity_type, full_name, business_name)"
    )
    .order("created_at", { ascending: false })
    .limit(8);
  const matters = (mattersData as Matter[] | null) ?? [];

  const { data: documentsData } = await supabase
    .from("documents")
    .select("id, matter_id, document_type, file_name, created_at")
    .order("created_at", { ascending: false })
    .limit(5);
  const documents = (documentsData as MatterDocument[] | null) ?? [];

  const activeCount = matters.filter((m) => m.status === "open").length;
  const completedCount = matters.filter((m) => m.status === "won").length;
  const firstName = profile?.full_name?.split(" ")[0] ?? "there";

  const stats = [
    { label: "Matters", value: matters.length, icon: Briefcase, tone: "text-[#1B2E6B] bg-[#1B2E6B]/10" },
    { label: "Active", value: activeCount, icon: Clock, tone: "text-amber-600 bg-amber-100" },
    { label: "Completed", value: completedCount, icon: CheckCircle, tone: "text-green-600 bg-green-100" },
    { label: "Documents", value: documents.length, icon: FolderOpen, tone: "text-[#E8521A] bg-[#E8521A]/10" },
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#1B2E6B]">Welcome back, {firstName}</h1>
        <p className="text-sm text-gray-500 mt-1">Here&apos;s a summary of your matters.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map(({ label, value, icon: Icon, tone }) => (
          <Card key={label} className="flex items-center gap-3">
            <div className={`rounded-lg p-2.5 ${tone}`}>
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold text-[#1B2E6B]">{value}</p>
              <p className="text-xs text-gray-500">{label}</p>
            </div>
          </Card>
        ))}
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-gray-900">Recent Matters</h2>
          <Link href="/dashboard/matters" className="text-sm text-[#E8521A] hover:underline">
            View all
          </Link>
        </div>
        {matters.length > 0 ? (
          <div className="space-y-3">
            {matters.map((m) => (
              <Link key={m.id} href={`/dashboard/matters/${m.id}`}>
                <Card className="hover:border-[#1B2E6B]/30 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900 truncate">
                        {m.title || clientDisplayName(m.clients) || "Untitled matter"}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {clientDisplayName(m.clients)} · opened {formatDate(m.created_at)}
                      </p>
                    </div>
                    {m.current_phase && (
                      <span className="shrink-0 text-xs font-medium px-2.5 py-1 rounded-full bg-[#1B2E6B]/10 text-[#1B2E6B]">
                        Phase {m.current_phase}: {PHASE_LABELS[m.current_phase as MatterPhase]}
                      </span>
                    )}
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        ) : (
          <Card className="text-center py-10">
            <Briefcase className="h-10 w-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">No matters yet</p>
          </Card>
        )}
      </div>

      {documents.length > 0 && (
        <div>
          <h2 className="font-semibold text-gray-900 mb-3">Recent Documents</h2>
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
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}
    </div>
  );
}
