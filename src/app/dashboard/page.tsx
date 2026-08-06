import { redirect } from "next/navigation";
import Link from "next/link";
import Card from "@/components/ui/Card";
import { createClient } from "@/lib/supabase/server";
import { getEntityContext } from "@/lib/entity";
import { entityKind } from "@/lib/entity-display";
import { getSessionProfile } from "@/lib/auth";
import { formatDate } from "@/lib/utils";
import {
  clientDisplayName,
  type Matter,
  type MatterDocument,
} from "@/types";
import { matterPhaseLabel } from "@/lib/phase-label";
import { Briefcase, Clock, CheckCircle, FolderOpen, FileText, PlusCircle } from "lucide-react";

export const metadata = { title: "Dashboard — ConveyClear" };

export default async function DashboardPage() {
  const session = await getSessionProfile();
  if (!session) redirect("/auth/login");
  const profile = session.profile;

  const supabase = await createClient();

  const { activeId, active } = await getEntityContext();

  // RLS scopes these automatically: client→own entities, partner→their clients,
  // staff→all.
  let mattersQuery = supabase
    .from("matters")
    .select(
      "id, title, current_phase, status, priority, deadline, created_at, clients(id, entity_type, full_name, business_name)"
    )
    .order("created_at", { ascending: false })
    .limit(8);

  // Narrow to the selected entity. RLS already limits this to entities the user
  // is a member of, so this is a view preference and not the boundary: dropping
  // it would show the union of their own entities, never anyone else's.
  if (activeId) mattersQuery = mattersQuery.eq("client_id", activeId);

  const { data: mattersData } = await mattersQuery;
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
  const isClient = profile?.role === "client";

  // The heading names WHOSE affairs you are looking at, not who you are. On a
  // business entity "Welcome back, Thabo" was actively wrong: the matters below
  // belong to Brookfield Props, and Thabo may be one of several people acting
  // for it. A personal entity is still the person, so the greeting stays there.
  const onBusinessEntity = Boolean(active && active.entityType !== "natural_person");
  const heading = onBusinessEntity ? `${active!.name} — Matters` : `Welcome back, ${firstName}`;
  const subheading = onBusinessEntity
    ? `${entityKind(active!)} entity · here's a summary of its matters.`
    : "Here's a summary of your matters.";

  const stats = [
    { label: "Matters", value: matters.length, icon: Briefcase, tone: "text-action bg-action-fill/10" },
    { label: "Active", value: activeCount, icon: Clock, tone: "text-amber-600 bg-amber-100" },
    { label: "Completed", value: completedCount, icon: CheckCircle, tone: "text-green-600 bg-green-100" },
    { label: "Documents", value: documents.length, icon: FolderOpen, tone: "text-action bg-action-fill/10" },
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-[40px] font-semibold leading-[1.06] tracking-[-0.032em] text-action">{heading}</h1>
          <p className="text-sm text-ink-3 mt-1">{subheading}</p>
        </div>
        {isClient && (
          <Link
            href="/dashboard/request"
            className="inline-flex items-center gap-2 rounded-lg bg-action-fill px-4 py-2 text-sm font-medium text-white hover:opacity-90 shrink-0"
          >
            <PlusCircle className="h-4 w-4" /> Request a service
          </Link>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map(({ label, value, icon: Icon, tone }) => (
          <Card key={label} className="flex items-center gap-3">
            <div className={`rounded-lg p-2.5 ${tone}`}>
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[40px] font-semibold leading-[1.06] tracking-[-0.032em] text-action">{value}</p>
              <p className="text-xs text-ink-3">{label}</p>
            </div>
          </Card>
        ))}
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-ink">Recent Matters</h2>
          <Link href="/dashboard/matters" className="text-sm text-action hover:underline">
            View all
          </Link>
        </div>
        {matters.length > 0 ? (
          <div className="space-y-3">
            {matters.map((m) => (
              <Link key={m.id} href={`/dashboard/matters/${m.id}`} className="block">
                <Card className="transition-shadow duration-200 ease-out hover:shadow-lg">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-ink truncate">
                        {m.title || clientDisplayName(m.clients) || "Untitled matter"}
                      </p>
                      <p className="text-xs text-ink-3 mt-0.5">
                        {clientDisplayName(m.clients)} · opened {formatDate(m.created_at)}
                      </p>
                    </div>
                    {m.current_phase && (
                      <span className="shrink-0 text-xs font-medium px-2.5 py-1 rounded-full bg-action-fill/10 text-action">
                        {matterPhaseLabel(m.current_phase)}
                      </span>
                    )}
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        ) : (
          <Card className="text-center py-10">
            <Briefcase className="h-10 w-10 text-ink-3 mx-auto mb-3" />
            <p className="text-ink-3 text-sm">No matters yet</p>
            {isClient && (
              <Link
                href="/dashboard/request"
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-action-fill px-4 py-2 text-sm font-medium text-white hover:opacity-90"
              >
                <PlusCircle className="h-4 w-4" /> Request a service
              </Link>
            )}
          </Card>
        )}
      </div>

      {documents.length > 0 && (
        <div>
          <h2 className="font-semibold text-ink mb-3">Recent Documents</h2>
          <Card padding="none">
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
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}
    </div>
  );
}
