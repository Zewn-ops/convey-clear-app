import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import Link from "next/link";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import { formatDate, formatDateTime } from "@/lib/utils";
import {
  isStaffRole,
  clientDisplayName,
  MATTER_STATUS_LABELS,
  PHASE_LABELS,
  PRIORITY_LABELS,
  type Matter,
  type MatterDocument,
  type MatterParty,
  type MatterPhase,
  type MatterPriority,
  type MatterStatus,
  type CouncilPoc,
} from "@/types";
import { ArrowLeft, FileText, MessageSquare, ArrowUpCircle, UploadCloud, Mail, Settings } from "lucide-react";
import CollectFicaButton from "@/components/admin/CollectFicaButton";
import PartiesCard from "@/components/matters/PartiesCard";
import MatterPocsCard from "@/components/matters/MatterPocsCard";
import DocRenameButton from "@/components/matters/DocRenameButton";
import Celebrate from "@/components/matters/Celebrate";
import { notifyMatterParties } from "@/lib/notify";
import StorageUpload from "@/components/matters/StorageUpload";
import { createAdminClient } from "@/lib/supabase/admin";
import { signedDownloadUrls } from "@/lib/storage";

export const dynamic = "force-dynamic";

interface Stage {
  code: string;
  name: string;
  owner_role: string;
  phase: number;
}

interface ActivityItem {
  id: string;
  activity_type: string;
  body: string | null;
  created_at: string;
  author_label: string | null;
  users?: { full_name: string | null } | null;
}

function statusVariant(status: string): "info" | "success" | "danger" | "warning" | "gray" {
  const map: Record<string, "info" | "success" | "danger" | "warning" | "gray"> = {
    new: "warning", open: "info", won: "success", lost: "danger", archived: "gray", on_hold: "warning",
  };
  return map[status] ?? "gray";
}

function priorityVariant(priority: string): "default" | "danger" | "warning" | "info" | "gray" {
  const map: Record<string, "default" | "danger" | "warning" | "info" | "gray"> = {
    whale: "default", urgent: "danger", priority: "warning", complex: "info", standard: "gray", emerging: "info",
  };
  return map[priority] ?? "gray";
}

function ActivityIcon({ type }: { type: string }) {
  const icons: Record<string, React.ReactNode> = {
    post: <MessageSquare className="h-4 w-4 text-gray-400" />,
    phase_transition: <ArrowUpCircle className="h-4 w-4 text-[#1B2E6B]" />,
    document_upload: <UploadCloud className="h-4 w-4 text-green-500" />,
    email_bridge: <Mail className="h-4 w-4 text-blue-500" />,
    system: <Settings className="h-4 w-4 text-gray-400" />,
    status_change: <ArrowUpCircle className="h-4 w-4 text-amber-500" />,
  };
  return <>{icons[type] ?? <MessageSquare className="h-4 w-4 text-gray-400" />}</>;
}

const phases: MatterPhase[] = ["1", "2", "3", "4"];

export default async function AdminMatterDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSessionProfile();
  if (!session || !isStaffRole(session.profile?.role)) redirect("/auth/login");

  const authorId = session.profile?.id ?? null;

  async function advancePhase(formData: FormData) {
    "use server";
    const supabase = await createClient();
    const newPhase = formData.get("phase") as string;
    const matterId = formData.get("matter_id") as string;
    const userId = formData.get("author_id") as string;

    await supabase
      .from("matters")
      .update({ current_phase: newPhase })
      .eq("id", matterId);

    await supabase.from("matter_activities").insert({
      matter_id: matterId,
      author_id: userId || null,
      activity_type: "phase_transition",
      body: `Matter advanced to Phase ${newPhase}: ${PHASE_LABELS[newPhase as MatterPhase]}`,
    });
    await notifyMatterParties(
      matterId,
      { type: "phase", title: `Advanced to Phase ${newPhase}: ${PHASE_LABELS[newPhase as MatterPhase]}` },
      { excludeUserId: userId || null }
    );

    revalidatePath(`/admin/matters/${matterId}`);
  }

  async function setStage(formData: FormData) {
    "use server";
    const supabase = await createClient();
    const newStage = formData.get("stage") as string;
    const matterId = formData.get("matter_id") as string;
    const userId = formData.get("author_id") as string;

    if (!newStage?.trim()) return;

    await supabase
      .from("matters")
      .update({ current_stage: newStage })
      .eq("id", matterId);

    await supabase.from("matter_activities").insert({
      matter_id: matterId,
      author_id: userId || null,
      activity_type: "status_change",
      body: `Stage updated to: ${newStage}`,
    });

    revalidatePath(`/admin/matters/${matterId}`);
  }

  async function setMatterStatus(formData: FormData) {
    "use server";
    const supabase = await createClient();
    const status = formData.get("status") as string;
    const matterId = formData.get("matter_id") as string;
    const userId = formData.get("author_id") as string;
    if (!status?.trim()) return;

    await supabase.from("matters").update({ status }).eq("id", matterId);
    await supabase.from("matter_activities").insert({
      matter_id: matterId,
      author_id: userId || null,
      activity_type: "status_change",
      body: `Status changed to: ${MATTER_STATUS_LABELS[status as MatterStatus] ?? status}`,
    });
    await notifyMatterParties(
      matterId,
      { type: "status", title: `Status: ${MATTER_STATUS_LABELS[status as MatterStatus] ?? status}` },
      { excludeUserId: userId || null }
    );
    revalidatePath(`/admin/matters/${matterId}`);
  }

  async function postNote(formData: FormData) {
    "use server";
    const supabase = await createClient();
    const body = formData.get("body") as string;
    const matterId = formData.get("matter_id") as string;
    const userId = formData.get("author_id") as string;

    if (!body?.trim()) return;

    await supabase.from("matter_activities").insert({
      matter_id: matterId,
      author_id: userId || null,
      activity_type: "post",
      body: body.trim(),
    });

    revalidatePath(`/admin/matters/${matterId}`);
  }

  const supabase = await createClient();

  const [{ data: matterData }, { data: docsData }, { data: activitiesData }, { data: partiesData }] = await Promise.all([
    supabase
      .from("matters")
      .select(
        "id, title, current_phase, current_stage, status, priority, deadline, deal_value, municipality, partner_file_ref, service_subtype, service_data, service_notes, drive_folder_id, created_at, updated_at, clients(id, entity_type, full_name, business_name, primary_email, primary_cell), services(id, code, name, config)"
      )
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("documents")
      .select("id, matter_id, document_type, document_status, file_name, drive_file_id, storage_bucket, storage_path, matter_party_id, verified, created_at")
      .eq("matter_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("matter_activities")
      .select("id, activity_type, body, created_at, author_label, users(full_name)")
      .eq("matter_id", id)
      .order("created_at", { ascending: false })
      .limit(30),
    supabase
      .from("matter_parties")
      .select("*")
      .eq("matter_id", id)
      .order("role", { ascending: true }),
  ]);

  const matter = matterData as (Matter & { services?: { id: string; code: string; name: string; config: any } | null }) | null;
  if (!matter) notFound();

  const documents = (docsData as MatterDocument[] | null) ?? [];
  const activities = (activitiesData as ActivityItem[] | null) ?? [];
  const parties = (partiesData as MatterParty[] | null) ?? [];
  const partyById = new Map(parties.map((p) => [p.id, p]));

  // Enquiries linked to this matter (C2 — view enquiries from the matter page).
  const { data: enqData } = await supabase
    .from("enquiries")
    .select("id, subject, status, created_at")
    .eq("matter_id", id)
    .order("created_at", { ascending: false });
  const relatedEnquiries = (enqData ?? []) as { id: string; subject: string; status: string; created_at: string }[];

  // Council POCs (B5 / Theme G) — POCs linked to this matter + the full
  // directory for the assign dropdown. Staff-only (admin portal).
  const [{ data: linkedPocData }, { data: allPocData }] = await Promise.all([
    supabase
      .from("matter_council_pocs")
      .select("council_pocs(*)")
      .eq("matter_id", id)
      .order("created_at", { ascending: false }),
    supabase.from("council_pocs").select("*").order("council", { ascending: true }).order("first_name", { ascending: true }),
  ]);
  const linkedPocs = ((linkedPocData as { council_pocs: CouncilPoc | null }[] | null) ?? [])
    .map((r) => r.council_pocs)
    .filter((p): p is CouncilPoc => Boolean(p));
  const allPocs = (allPocData as CouncilPoc[] | null) ?? [];

  // Short-lived signed URLs for docs stored in Supabase Storage (private bucket).
  const storagePaths = documents.map((d) => d.storage_path).filter((p): p is string => Boolean(p));
  const signedUrls = storagePaths.length > 0 ? await signedDownloadUrls(createAdminClient(), storagePaths) : {};

  const serviceConfig = (matter as any).services?.config;
  // COO has no FICA — its document button + onboarding link say "documents" (A7).
  const isCoo = ((matter as any).services?.code ?? "").toUpperCase() === "COO";
  const allStages: Stage[] = serviceConfig?.stages ?? [];
  const currentPhaseNum = matter.current_phase ? Number(matter.current_phase) : null;
  const stagesForCurrentPhase = currentPhaseNum
    ? allStages.filter((s) => s.phase === currentPhaseNum)
    : [];

  const clientName = matter.clients ? clientDisplayName(matter.clients) : null;
  const displayName = clientName || matter.title || "Matter";

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <Link href="/admin/matters" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 mb-4">
          <ArrowLeft className="h-4 w-4" /> All matters
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#1B2E6B]">
              {matter.title || displayName}
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              {displayName}
              {matter.municipality ? ` · ${matter.municipality}` : ""}
              {(matter as any).services?.name ? ` · ${(matter as any).services.name}` : ""}
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            {matter.priority && (
              <Badge label={PRIORITY_LABELS[matter.priority as MatterPriority]} variant={priorityVariant(matter.priority)} />
            )}
            {matter.status && (
              <Badge label={MATTER_STATUS_LABELS[matter.status as MatterStatus]} variant={statusVariant(matter.status)} />
            )}
          </div>
        </div>
      </div>

      {/* 4-phase pipeline */}
      <Card>
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Pipeline Progress</p>
          <span className="text-xs text-gray-400">
            {matter.current_stage ? `Current stage: ${matter.current_stage}` : "Stage not set"}
          </span>
        </div>
        <div className="flex gap-3">
          {phases.map((p) => {
            const active = matter.current_phase === p;
            const done = currentPhaseNum !== null && Number(p) < currentPhaseNum;
            return (
              <div key={p} className="flex-1">
                <div className={`h-2 rounded-full ${active ? "bg-[#E8521A]" : done ? "bg-[#1B2E6B]" : "bg-gray-200"}`} />
                <p className={`mt-2 text-[11px] font-medium ${active ? "text-[#E8521A]" : done ? "text-[#1B2E6B]" : "text-gray-400"}`}>
                  {PHASE_LABELS[p]}
                </p>
              </div>
            );
          })}
        </div>

        {/* Phase advance controls */}
        <div className="mt-4 pt-4 border-t border-gray-100 flex gap-2 flex-wrap">
          {phases.map((p) => (
            <form key={p} action={advancePhase}>
              <input type="hidden" name="phase" value={p} />
              <input type="hidden" name="matter_id" value={id} />
              <input type="hidden" name="author_id" value={authorId ?? ""} />
              <button
                type="submit"
                className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors ${
                  matter.current_phase === p
                    ? "bg-[#E8521A] border-[#E8521A] text-white cursor-default"
                    : "border-gray-200 text-gray-600 hover:border-[#1B2E6B] hover:text-[#1B2E6B]"
                }`}
                disabled={matter.current_phase === p}
              >
                Set Phase {p}
              </button>
            </form>
          ))}
        </div>
      </Card>

      {/* Service pipeline stages for current phase */}
      {stagesForCurrentPhase.length > 0 && (
        <Card>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Phase {matter.current_phase} Stages
          </p>
          <div className="flex gap-2 flex-wrap mb-4">
            {stagesForCurrentPhase.map((stage) => (
              <span
                key={stage.code}
                className={`text-xs px-3 py-1.5 rounded-full border font-medium ${
                  matter.current_stage === stage.code
                    ? "bg-[#1B2E6B] text-white border-[#1B2E6B]"
                    : "border-gray-200 text-gray-600"
                }`}
              >
                {stage.name}
              </span>
            ))}
          </div>
          <form action={setStage} className="flex gap-2">
            <input type="hidden" name="matter_id" value={id} />
            <input type="hidden" name="author_id" value={authorId ?? ""} />
            <select
              name="stage"
              defaultValue={matter.current_stage ?? ""}
              className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B2E6B]"
            >
              <option value="">— Select stage —</option>
              {stagesForCurrentPhase.map((s) => (
                <option key={s.code} value={s.code}>{s.name}</option>
              ))}
            </select>
            <button
              type="submit"
              className="px-4 py-2 text-sm font-medium bg-[#1B2E6B] text-white rounded-lg hover:bg-[#1B2E6B]/90 transition-colors"
            >
              Update stage
            </button>
          </form>
        </Card>
      )}

      {/* Matter facts */}
      <Card>
        <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
          <div>
            <dt className="text-xs text-gray-400">Status</dt>
            <dd className="text-gray-800 mt-0.5">{matter.status ? MATTER_STATUS_LABELS[matter.status as MatterStatus] : "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-400">Priority</dt>
            <dd className="text-gray-800 mt-0.5">{matter.priority ? PRIORITY_LABELS[matter.priority as MatterPriority] : "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-400">Deadline</dt>
            <dd className="text-gray-800 mt-0.5">{matter.deadline ? formatDate(matter.deadline) : "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-400">Opened</dt>
            <dd className="text-gray-800 mt-0.5">{formatDate(matter.created_at)}</dd>
          </div>
          {matter.deal_value && (
            <div>
              <dt className="text-xs text-gray-400">Deal Value</dt>
              <dd className="text-gray-800 mt-0.5">R {matter.deal_value.toLocaleString("en-ZA")}</dd>
            </div>
          )}
          {(matter as any).partner_file_ref && (
            <div>
              <dt className="text-xs text-gray-400">Partner file ref</dt>
              <dd className="text-gray-800 mt-0.5">{(matter as any).partner_file_ref}</dd>
            </div>
          )}
          {matter.service_notes && (
            <div className="col-span-2">
              <dt className="text-xs text-gray-400">Service Notes</dt>
              <dd className="text-gray-800 mt-0.5">{matter.service_notes}</dd>
            </div>
          )}
        </dl>

        {/* Status control (H1) — partner/client referrals arrive as "New"; staff
            review then set Open (or Won/Lost/etc.). Won triggers the celebration. */}
        <form action={setMatterStatus} className="mt-4 pt-4 border-t border-gray-100 flex flex-wrap items-center gap-2">
          <input type="hidden" name="matter_id" value={id} />
          <input type="hidden" name="author_id" value={authorId ?? ""} />
          <label className="text-xs font-medium text-gray-500">Status</label>
          <select
            name="status"
            defaultValue={matter.status ?? "new"}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B2E6B]"
          >
            {(Object.keys(MATTER_STATUS_LABELS) as MatterStatus[]).map((s) => (
              <option key={s} value={s}>{MATTER_STATUS_LABELS[s]}</option>
            ))}
          </select>
          <button type="submit" className="px-3 py-1.5 text-sm font-medium bg-[#1B2E6B] text-white rounded-lg hover:bg-[#1B2E6B]/90">
            Update status
          </button>
          {matter.status === "new" && (
            <span className="text-xs font-medium text-amber-600">Awaiting review — set to Open once reviewed</span>
          )}
        </form>
      </Card>

      {/* Service-specific referral details (e.g. PRC: account no., query ref, seller) */}
      {((matter as any).service_subtype ||
        Object.keys(((matter as any).service_data ?? {}) as Record<string, unknown>).length > 0) && (
        <Card>
          <h2 className="font-semibold text-gray-900 mb-3">
            Service details{(matter as any).service_subtype ? ` · ${(matter as any).service_subtype}` : ""}
          </h2>
          <dl className="grid grid-cols-2 gap-4 text-sm">
            {Object.entries(((matter as any).service_data ?? {}) as Record<string, unknown>)
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <div key={k}>
                  <dt className="text-xs text-gray-400 capitalize">{k.replace(/_/g, " ")}</dt>
                  <dd className="text-gray-800 mt-0.5">{String(v)}</dd>
                </div>
              ))}
          </dl>
        </Card>
      )}

      {/* Celebration when the matter is won/closed (H2) */}
      <Celebrate active={matter.status === "won"} matterId={matter.id} />

      {/* Related enquiries (C2) */}
      {relatedEnquiries.length > 0 && (
        <Card>
          <h2 className="font-semibold text-gray-900 mb-3">Related enquiries ({relatedEnquiries.length})</h2>
          <ul className="divide-y divide-gray-100">
            {relatedEnquiries.map((e) => (
              <li key={e.id} className="py-2">
                <Link href={`/admin/enquiries/${e.id}`} className="flex items-center justify-between gap-3 text-sm hover:text-[#1B2E6B]">
                  <span className="text-gray-800 truncate">{e.subject}</span>
                  <span className="text-xs text-gray-400 shrink-0">{e.status} · {formatDate(e.created_at)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Client info */}
      {matter.clients && (
        <Card>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Client</p>
            <Link
              href={`/admin/clients/${(matter.clients as any).id}`}
              className="text-xs text-[#E8521A] hover:underline"
            >
              View profile
            </Link>
          </div>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-xs text-gray-400">Name</dt>
              <dd className="font-medium mt-0.5">{clientDisplayName(matter.clients)}</dd>
            </div>
            {(matter.clients as any).primary_email && (
              <div>
                <dt className="text-xs text-gray-400">Email</dt>
                <dd className="mt-0.5">{(matter.clients as any).primary_email}</dd>
              </div>
            )}
            {(matter.clients as any).primary_cell && (
              <div>
                <dt className="text-xs text-gray-400">Cell</dt>
                <dd className="mt-0.5">{(matter.clients as any).primary_cell}</dd>
              </div>
            )}
          </dl>
        </Card>
      )}

      {/* Parties (COO buyer/seller etc.) — renders nothing for single-client matters */}
      <PartiesCard parties={parties} manage />

      {/* Council POC(s) — internal, staff-only directory link (B5 / Theme G) */}
      <MatterPocsCard matterId={id} linked={linkedPocs} all={allPocs} />

      {/* Documents */}
      <div>
        <div className="flex items-center justify-between gap-3 mb-3">
          <h2 className="font-semibold text-gray-900">Documents ({documents.length})</h2>
          <div className="flex items-center gap-3">
            {(matter as any).drive_folder_id && (
              <a
                href={`https://drive.google.com/drive/folders/${(matter as any).drive_folder_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs font-medium text-[#1B2E6B] hover:underline"
              >
                Open Drive folder
              </a>
            )}
            <StorageUpload matterId={id} />
            <CollectFicaButton matterId={id} fica={!isCoo} />
          </div>
        </div>
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
                      {doc.matter_party_id && partyById.get(doc.matter_party_id)
                        ? ` · ${partyById.get(doc.matter_party_id)!.role}`
                        : ""}
                    </p>
                  </div>
                  {doc.storage_path && signedUrls[doc.storage_path] ? (
                    <div className="flex items-center gap-3 shrink-0">
                      <a
                        href={signedUrls[doc.storage_path]}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-medium text-[#1B2E6B] hover:underline"
                      >
                        View
                      </a>
                      <a
                        href={`${signedUrls[doc.storage_path]}&download=${encodeURIComponent(doc.file_name ?? "document")}`}
                        className="text-xs font-medium text-[#E8521A] hover:underline"
                      >
                        Download
                      </a>
                    </div>
                  ) : doc.drive_file_id ? (
                    <div className="flex items-center gap-3 shrink-0">
                      <a
                        href={`https://drive.google.com/file/d/${doc.drive_file_id}/view`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-medium text-[#1B2E6B] hover:underline"
                      >
                        View
                      </a>
                      <a
                        href={`https://drive.google.com/uc?export=download&id=${doc.drive_file_id}`}
                        className="text-xs font-medium text-[#E8521A] hover:underline"
                      >
                        Download
                      </a>
                    </div>
                  ) : (
                    <span className="text-xs text-gray-300 shrink-0">No file</span>
                  )}
                  <DocRenameButton documentId={doc.id} current={doc.file_name || doc.document_type} />
                  {doc.verified && (
                    <span className="text-xs text-green-600 font-medium shrink-0">Verified</span>
                  )}
                  {doc.document_status && doc.document_status !== "uploaded" && (
                    <span className="text-xs text-amber-600 font-medium shrink-0">{doc.document_status}</span>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        ) : (
          <Card className="text-center py-8">
            <p className="text-sm text-gray-400">No documents yet</p>
          </Card>
        )}
      </div>

      {/* Activity feed */}
      <div>
        <h2 className="font-semibold text-gray-900 mb-3">Activity Feed</h2>

        {/* Post note form */}
        <form action={postNote} className="mb-4">
          <input type="hidden" name="matter_id" value={id} />
          <input type="hidden" name="author_id" value={authorId ?? ""} />
          <div className="flex gap-2">
            <textarea
              name="body"
              rows={2}
              placeholder="Add a note or update..."
              className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B2E6B] resize-none"
            />
            <button
              type="submit"
              className="px-4 py-2 text-sm font-medium bg-[#E8521A] text-white rounded-lg hover:bg-[#E8521A]/90 transition-colors self-end"
            >
              Post
            </button>
          </div>
        </form>

        {activities.length > 0 ? (
          <Card padding="none">
            <ul className="divide-y divide-gray-100">
              {activities.map((a) => {
                const authorName = (a.users as any)?.full_name ?? a.author_label ?? "System";
                // Internal = not in the external-safe set (mirrors the partner-page
                // whitelist). Staff see these on a grey background so it's obvious
                // at a glance what the client/partner can and cannot see.
                const isInternal = !["status_change", "document_upload", "phase_transition", "poa_signed"].includes(a.activity_type);
                return (
                  <li key={a.id} className={"flex gap-3 px-5 py-4 " + (isInternal ? "bg-gray-100" : "")}>
                    <div className="mt-0.5 shrink-0">
                      <ActivityIcon type={a.activity_type} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm text-gray-800">{a.body || a.activity_type}</p>
                        {isInternal && (
                          <span className="shrink-0 rounded bg-gray-300 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-600" title="Not visible to client or business partner">
                            Internal
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 mt-1">
                        {authorName} · {formatDateTime(a.created_at)}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
        ) : (
          <Card className="text-center py-8">
            <p className="text-sm text-gray-400">No activity yet</p>
          </Card>
        )}
      </div>
    </div>
  );
}
