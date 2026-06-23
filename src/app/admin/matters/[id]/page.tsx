import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import Link from "next/link";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import { formatDate, formatDateTime, municipalityLabel } from "@/lib/utils";
import {
  isStaffRole,
  clientDisplayName,
  MATTER_STATUS_LABELS,
  PRIORITY_LABELS,
  type Matter,
  type MatterDocument,
  type MatterParty,
  type MatterPriority,
  type MatterStatus,
  type CouncilPoc,
} from "@/types";
import { ArrowLeft, FileText, MessageSquare, ArrowUpCircle, UploadCloud, Mail, Settings, Lock } from "lucide-react";
import CollectFicaButton from "@/components/admin/CollectFicaButton";
import PartiesCard from "@/components/matters/PartiesCard";
import MatterPocsCard from "@/components/matters/MatterPocsCard";
import PipelineProgress from "@/components/matters/PipelineProgress";
import DocRenameButton from "@/components/matters/DocRenameButton";
import Celebrate from "@/components/matters/Celebrate";
import { notifyMatterParties, notifyStaff } from "@/lib/notify";
import {
  getPipeline,
  phaseLabel,
  stageLabel,
  phaseSteps,
  findStage,
  isStageClientVisible,
  skippedStageNames,
} from "@/lib/pipelines";
import StorageUpload from "@/components/matters/StorageUpload";
import { createAdminClient } from "@/lib/supabase/admin";
import { signedDownloadUrls } from "@/lib/storage";

export const dynamic = "force-dynamic";

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

// Resolve a matter's pipeline + current status/stage. MODULE-SCOPE on purpose:
// the "use server" actions below reference it, and inline server actions are
// extracted into their own bundle — a helper defined inside the component is not
// in scope there at runtime (ReferenceError in prod, though dev tolerates it).
async function matterCtx(supabase: Awaited<ReturnType<typeof createClient>>, matterId: string) {
  const { data } = await supabase
    .from("matters")
    .select("status, current_stage, municipality, service_subtype, services(code)")
    .eq("id", matterId)
    .maybeSingle();
  const code = (data as { services?: { code?: string } | null } | null)?.services?.code ?? null;
  const pl = getPipeline(code, data?.municipality, (data as { service_subtype?: string | null } | null)?.service_subtype);
  return { row: data, pl };
}

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
    if (!newPhase?.trim()) return;

    const { row, pl } = await matterCtx(supabase, matterId);
    const label = phaseLabel(pl, newPhase);
    // Note 2026-06-22: first staff progression flips New → Open automatically.
    const statusPatch = row?.status === "new" ? { status: "open" as const } : {};

    await supabase.from("matters").update({ current_phase: newPhase, ...statusPatch }).eq("id", matterId);
    await supabase.from("matter_activities").insert({
      matter_id: matterId, author_id: userId || null, activity_type: "phase_transition",
      body: `Phase: ${label}`,
    });
    // Client/partner are only pinged for phases they can see (avoid overload).
    const phaseClientVisible = pl ? (phaseSteps(pl).some((s) => s.key === newPhase) && newPhase !== pl.prePhase.key) : true;
    if (phaseClientVisible) {
      await notifyMatterParties(matterId, { type: "phase", title: `Moved to ${label}` }, { excludeUserId: userId || null });
    }
    revalidatePath(`/admin/matters/${matterId}`);
  }

  async function setStage(formData: FormData) {
    "use server";
    const supabase = await createClient();
    const newStage = formData.get("stage") as string;
    const matterId = formData.get("matter_id") as string;
    const userId = formData.get("author_id") as string;
    if (!newStage?.trim()) return;

    const { row, pl } = await matterCtx(supabase, matterId);
    const label = stageLabel(pl, newStage);
    const prevStage = (row as { current_stage?: string | null } | null)?.current_stage ?? null;
    const statusPatch = row?.status === "new" ? { status: "open" as const } : {};

    await supabase.from("matters").update({ current_stage: newStage, ...statusPatch }).eq("id", matterId);
    await supabase.from("matter_activities").insert({
      matter_id: matterId, author_id: userId || null, activity_type: "status_change",
      body: `Stage: ${label}`,
    });
    // General Note: when stages are skipped (e.g. 1 → 4), list them on the feed.
    const skipped = pl ? skippedStageNames(pl, prevStage, newStage) : [];
    if (skipped.length > 0) {
      await supabase.from("matter_activities").insert({
        matter_id: matterId, author_id: userId || null, activity_type: "system",
        body: `Skipped: ${skipped.join(", ")}`,
      });
    }
    // Only notify the client/partner for client-visible stages (orange).
    const clientVisible = pl ? isStageClientVisible(pl, newStage) : true;
    if (clientVisible) {
      await notifyMatterParties(matterId, { type: "stage", title: `Update: ${label}` }, { excludeUserId: userId || null });
    }
    revalidatePath(`/admin/matters/${matterId}`);
  }

  // Record a branching decision (RCF/RCC: Approved / Delayed / Rejected + reason).
  // The control posts one "<outcome>:<reason>" value; we store both in service_data.
  async function setOutcome(formData: FormData) {
    "use server";
    const supabase = await createClient();
    const combined = (formData.get("outcomeReason") as string) ?? "";
    const matterId = formData.get("matter_id") as string;
    const userId = formData.get("author_id") as string;
    if (!combined.trim()) return;
    const [outcomeKey, reasonKey = ""] = combined.split(":");

    const { row, pl } = await matterCtx(supabase, matterId);
    const stageDef = pl ? findStage(pl, (row as { current_stage?: string | null } | null)?.current_stage)?.stage : null;
    const outcomeDef = stageDef?.outcomes?.find((o) => o.key === outcomeKey);
    const reasonDef = outcomeDef?.reasons?.find((r) => r.key === reasonKey);
    const label = `${outcomeDef?.label ?? outcomeKey}${reasonDef ? ` — ${reasonDef.label}` : ""}`;

    const { data: cur } = await supabase.from("matters").select("service_data").eq("id", matterId).maybeSingle();
    const service_data = {
      ...(((cur as { service_data?: Record<string, unknown> } | null)?.service_data) ?? {}),
      stage_outcome: outcomeKey,
      stage_reason: reasonKey || null,
    };
    await supabase.from("matters").update({ service_data }).eq("id", matterId);
    await supabase.from("matter_activities").insert({
      matter_id: matterId, author_id: userId || null, activity_type: "status_change",
      body: `Outcome: ${label}`,
    });
    if (outcomeDef?.clientVisible) {
      await notifyMatterParties(matterId, { type: "outcome", title: `Outcome: ${label}` }, { excludeUserId: userId || null });
    }
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

    // Internal notes notify ConveyClear staff (note 11) — never the client/partner.
    // Title prefixing ("<matter title>: …") is centralised in notifyUsers.
    await notifyStaff({
      type: "note",
      title: "Internal note",
      body: body.trim().slice(0, 140),
      link: `/admin/matters/${matterId}`,
      matter_id: matterId,
    });

    revalidatePath(`/admin/matters/${matterId}`);
  }

  const supabase = await createClient();

  const [{ data: matterData }, { data: docsData }, { data: activitiesData }, { data: partiesData }] = await Promise.all([
    supabase
      .from("matters")
      .select(
        "id, title, current_phase, current_stage, status, priority, deadline, deal_value, municipality, partner_file_ref, service_subtype, service_data, service_notes, drive_folder_id, created_at, updated_at, clients(id, entity_type, full_name, first_name, last_name, business_name, primary_email, primary_cell), business_partners(name, abbreviation), services(id, code, name, config)"
      )
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("documents")
      .select("id, matter_id, document_type, document_status, file_name, drive_file_id, storage_bucket, storage_path, matter_party_id, verified, uploaded_by, created_at")
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

  const svc = (matter as { services?: { code?: string; name?: string } | null }).services;
  const firm = (matter as { business_partners?: { name?: string | null; abbreviation?: string | null } | null }).business_partners;
  // COO has no FICA — its document button + onboarding link say "documents" (A7).
  const isCoo = (svc?.code ?? "").toUpperCase() === "COO";
  const pipeline = getPipeline(svc?.code, matter.municipality, (matter as { service_subtype?: string | null }).service_subtype);
  const curPhaseDef = pipeline?.phases.find((p) => p.key === matter.current_phase) ?? null;
  const curPhaseStages = curPhaseDef?.stages ?? [];

  // Decision stage (RCF/RCC outcome) controls, when the current stage branches.
  const decisionStage = pipeline ? findStage(pipeline, matter.current_stage)?.stage ?? null : null;
  const decisionOptions: { value: string; label: string }[] = [];
  for (const o of decisionStage?.outcomes ?? []) {
    if (o.reasons?.length) {
      for (const r of o.reasons) decisionOptions.push({ value: `${o.key}:${r.key}`, label: `${o.label} — ${r.label}` });
    } else {
      decisionOptions.push({ value: o.key, label: o.label });
    }
  }
  const sd = ((matter as { service_data?: Record<string, unknown> | null }).service_data ?? {}) as Record<string, unknown>;
  const currentOutcomeValue = sd.stage_outcome ? `${sd.stage_outcome}${sd.stage_reason ? `:${sd.stage_reason}` : ""}` : "";
  const currentOutcomeLabel = (() => {
    const o = decisionStage?.outcomes?.find((x) => x.key === sd.stage_outcome);
    if (!o) return null;
    const r = o.reasons?.find((x) => x.key === sd.stage_reason);
    return `${o.label}${r ? ` — ${r.label}` : ""}`;
  })();

  const clientName = matter.clients ? clientDisplayName(matter.clients) : null;
  const displayName = clientName || matter.title || "Matter";

  // Documents split: client/business-partner uploads vs ConveyClear uploads (note 29).
  const isClientUpload = (d: MatterDocument) =>
    ["client", "attorney"].includes((d as { uploaded_by?: string | null }).uploaded_by ?? "");
  const clientPartnerDocs = documents.filter(isClientUpload);
  const ccDocs = documents.filter((d) => !isClientUpload(d));

  const docRow = (doc: MatterDocument) => (
    <li key={doc.id} className="flex items-center gap-3 px-5 py-3">
      <FileText className="h-4 w-4 text-gray-400 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800 truncate">{doc.file_name || doc.document_type}</p>
        <p className="text-xs text-gray-400">
          {doc.document_type} · {formatDate(doc.created_at)}
          {doc.matter_party_id && partyById.get(doc.matter_party_id) ? ` · ${partyById.get(doc.matter_party_id)!.role}` : ""}
        </p>
      </div>
      {doc.storage_path && signedUrls[doc.storage_path] ? (
        <div className="flex items-center gap-3 shrink-0">
          <a href={signedUrls[doc.storage_path]} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-[#1B2E6B] hover:underline">View</a>
          <a href={`${signedUrls[doc.storage_path]}&download=${encodeURIComponent(doc.file_name ?? "document")}`} className="text-xs font-medium text-[#E8521A] hover:underline">Download</a>
        </div>
      ) : doc.drive_file_id ? (
        <div className="flex items-center gap-3 shrink-0">
          <a href={`https://drive.google.com/file/d/${doc.drive_file_id}/view`} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-[#1B2E6B] hover:underline">View</a>
          <a href={`https://drive.google.com/uc?export=download&id=${doc.drive_file_id}`} className="text-xs font-medium text-[#E8521A] hover:underline">Download</a>
        </div>
      ) : (
        <span className="text-xs text-gray-300 shrink-0">No file</span>
      )}
      <DocRenameButton documentId={doc.id} current={doc.file_name || doc.document_type} />
      {doc.verified && <span className="text-xs text-green-600 font-medium shrink-0">Verified</span>}
      {doc.document_status && doc.document_status !== "uploaded" && (
        <span className="text-xs text-amber-600 font-medium shrink-0">{doc.document_status}</span>
      )}
    </li>
  );

  const docGroup = (title: string, list: MatterDocument[]) => (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">{title} ({list.length})</p>
      {list.length > 0 ? (
        <Card padding="none"><ul className="divide-y divide-gray-100">{list.map(docRow)}</ul></Card>
      ) : (
        <Card className="text-center py-5"><p className="text-sm text-gray-400">None</p></Card>
      )}
    </div>
  );

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
              {matter.municipality ? ` · ${municipalityLabel(matter.municipality)}` : ""}
              {svc?.name ? ` · ${svc.name}` : ""}
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

      {/* Pipeline (config-driven) */}
      {pipeline ? (
        <Card className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Pipeline · {pipeline.label}</p>
            <span className="text-xs text-gray-400">
              {matter.current_stage ? stageLabel(pipeline, matter.current_stage) : "Stage not set"}
            </span>
          </div>
          <PipelineProgress pipeline={pipeline} currentPhase={matter.current_phase} currentStage={matter.current_stage} audience="staff" />
          <div className="pt-3 border-t border-gray-100 grid gap-3 sm:grid-cols-2">
            <form action={advancePhase} className="flex items-end gap-2">
              <input type="hidden" name="matter_id" value={id} />
              <input type="hidden" name="author_id" value={authorId ?? ""} />
              <label className="flex-1 text-xs font-medium text-gray-500">
                Phase
                <select name="phase" defaultValue={matter.current_phase ?? ""} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B2E6B]">
                  {phaseSteps(pipeline).map((s) => (<option key={s.key} value={s.key}>{s.label}</option>))}
                </select>
              </label>
              <button type="submit" className="px-3 py-2 text-sm font-medium bg-[#1B2E6B] text-white rounded-lg hover:bg-[#1B2E6B]/90">Set</button>
            </form>
            <form action={setStage} className="flex items-end gap-2">
              <input type="hidden" name="matter_id" value={id} />
              <input type="hidden" name="author_id" value={authorId ?? ""} />
              <label className="flex-1 text-xs font-medium text-gray-500">
                Stage{curPhaseDef ? ` · ${curPhaseDef.internalName}` : ""}
                <select name="stage" defaultValue={matter.current_stage ?? ""} disabled={curPhaseStages.length === 0} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B2E6B] disabled:bg-gray-50 disabled:text-gray-400">
                  <option value="">— Select stage —</option>
                  {curPhaseStages.map((s) => (<option key={s.key} value={s.key}>{s.name}{s.clientVisible ? "" : " (internal)"}</option>))}
                </select>
              </label>
              <button type="submit" className="px-3 py-2 text-sm font-medium bg-[#E8521A] text-white rounded-lg hover:bg-[#E8521A]/90">Update</button>
            </form>
          </div>

          {/* Decision outcome (RCF/RCC: Approved / Delayed / Rejected + reason) */}
          {decisionOptions.length > 0 && (
            <div className="pt-3 border-t border-gray-100">
              {currentOutcomeLabel && (
                <p className="text-xs text-gray-500 mb-2">Current outcome: <span className="font-medium text-gray-900">{currentOutcomeLabel}</span></p>
              )}
              <form action={setOutcome} className="flex items-end gap-2">
                <input type="hidden" name="matter_id" value={id} />
                <input type="hidden" name="author_id" value={authorId ?? ""} />
                <label className="flex-1 text-xs font-medium text-gray-500">
                  {decisionStage?.name} outcome
                  <select name="outcomeReason" defaultValue={currentOutcomeValue} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B2E6B]">
                    <option value="">— Select outcome —</option>
                    {decisionOptions.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
                  </select>
                </label>
                <button type="submit" className="px-3 py-2 text-sm font-medium bg-[#1B2E6B] text-white rounded-lg hover:bg-[#1B2E6B]/90">Set outcome</button>
              </form>
            </div>
          )}
        </Card>
      ) : (
        <Card>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Pipeline</p>
          <p className="text-sm text-gray-500">
            No pipeline configured for {municipalityLabel(matter.municipality)} / {svc?.name ?? "this service"} yet.
            {" "}Phase: {matter.current_phase ?? "—"} · Stage: {matter.current_stage ?? "—"}.
          </p>
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
            <dt className="text-xs text-gray-400">Estimated closing time</dt>
            <dd className="text-gray-800 mt-0.5">{matter.deadline ? formatDate(matter.deadline) : "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-400">Opened</dt>
            <dd className="text-gray-800 mt-0.5">{formatDate(matter.created_at)}</dd>
          </div>
          {(matter as { service_subtype?: string | null }).service_subtype && (
            <div>
              <dt className="text-xs text-gray-400">Clearance type</dt>
              <dd className="text-gray-800 mt-0.5">{(matter as { service_subtype?: string | null }).service_subtype}</dd>
            </div>
          )}
          {/* Service-specific referral fields (PRC account no / utilities / query ref) merged in. */}
          {Object.entries(((matter as { service_data?: Record<string, unknown> | null }).service_data ?? {}))
            .filter(([k, v]) => v && !["stage_outcome", "stage_reason"].includes(k))
            .map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs text-gray-400 capitalize">{k.replace(/_/g, " ")}</dt>
                <dd className="text-gray-800 mt-0.5">{String(v)}</dd>
              </div>
            ))}
          {matter.service_notes && (
            <div className="col-span-2 sm:col-span-3">
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

      {/* ConveyClear internal — staff-only container (note 2026-06-22). */}
      <Card className="border-[#1B2E6B]/20 bg-[#1B2E6B]/5">
        <div className="flex items-center gap-1.5 mb-3">
          <Lock className="h-3.5 w-3.5 text-[#1B2E6B]" />
          <h2 className="text-xs font-semibold uppercase tracking-wide text-[#1B2E6B]">ConveyClear internal</h2>
        </div>
        <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
          {firm?.name && (
            <div>
              <dt className="text-xs text-gray-400">Referring firm</dt>
              <dd className="text-gray-800 mt-0.5">{firm.name}{firm.abbreviation ? ` (${firm.abbreviation})` : ""}</dd>
            </div>
          )}
          {matter.partner_file_ref && (
            <div>
              <dt className="text-xs text-gray-400">Internal file ref</dt>
              <dd className="text-gray-800 mt-0.5">{matter.partner_file_ref}</dd>
            </div>
          )}
          {matter.deal_value && (
            <div>
              <dt className="text-xs text-gray-400">Deal value</dt>
              <dd className="text-gray-800 mt-0.5">R {matter.deal_value.toLocaleString("en-ZA")}</dd>
            </div>
          )}
          {!firm?.name && !matter.partner_file_ref && !matter.deal_value && (
            <p className="text-sm text-gray-400 col-span-3">No internal details captured yet.</p>
          )}
        </dl>
      </Card>

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
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
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

      {/* Documents — split client/partner uploads vs ConveyClear uploads (note 29) */}
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold text-gray-900">Documents ({documents.length})</h2>
          <div className="flex items-center gap-3">
            <StorageUpload matterId={id} />
            <CollectFicaButton matterId={id} fica={!isCoo} />
          </div>
        </div>
        {docGroup("Client / business-partner uploads", clientPartnerDocs)}
        {docGroup("ConveyClear uploads", ccDocs)}
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
