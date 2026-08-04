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
  type ClientDocument,
  type MatterPriority,
  type MatterStatus,
  type CouncilPoc,
  type Client,
  type TransferDocument,
} from "@/types";
import { ArrowLeft, FileText, MessageSquare, ArrowUpCircle, UploadCloud, Mail, Settings, Lock, User, Workflow } from "lucide-react";
import CollectFicaButton from "@/components/admin/CollectFicaButton";
import PartiesCard from "@/components/matters/PartiesCard";
import MatterTransferCard, { type LinkedTransfer } from "@/components/matters/MatterTransferCard";
import MatterPocsCard from "@/components/matters/MatterPocsCard";
import PipelineProgress from "@/components/matters/PipelineProgress";
import DocRenameButton from "@/components/matters/DocRenameButton";
import CouncilPackButton from "@/components/matters/CouncilPackButton";
import Celebrate from "@/components/matters/Celebrate";
import MatterEnquiries from "@/components/enquiries/MatterEnquiries";
import { getMatterEnquiries } from "@/lib/enquiries";
import { notifyMatterParties, notifyStaff } from "@/lib/notify";
import {
  getPipeline,
  phaseLabel,
  stageLabel,
  phaseSteps,
  findStage,
  isStageClientVisible,
  skippedStageNames,
  decisionStageForOutcome,
  phaseOrder,
  type Pipeline,
} from "@/lib/pipelines";
import StorageUpload from "@/components/matters/StorageUpload";
import InPlaceIntake from "@/components/matters/InPlaceIntake";
import InPlaceFica from "@/components/matters/InPlaceFica";
import SubmitButton from "@/components/ui/SubmitButton";
import { buildFicaSubjects } from "@/lib/fica";
import { logMatterActivity } from "@/lib/activity";
import { createAdminClient } from "@/lib/supabase/admin";
import { signedDocUrls } from "@/lib/storage";

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
    post: <MessageSquare className="h-4 w-4 text-gray-500" />,
    phase_transition: <ArrowUpCircle className="h-4 w-4 text-[#1B2E6B]" />,
    document_upload: <UploadCloud className="h-4 w-4 text-green-500" />,
    email_bridge: <Mail className="h-4 w-4 text-blue-500" />,
    system: <Settings className="h-4 w-4 text-gray-500" />,
    status_change: <ArrowUpCircle className="h-4 w-4 text-amber-500" />,
  };
  return <>{icons[type] ?? <MessageSquare className="h-4 w-4 text-gray-500" />}</>;
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

// Bug fix (A&A demo #1): when a matter is reverted to *before* the decision stage
// that produced its stored outcome, clear service_data.stage_outcome/stage_reason
// so a stale COT decision doesn't linger. The admin view keys the decision off
// current_stage (so it lingers on a phase revert, which leaves current_stage
// untouched); the partner view resolves it from stage_outcome across every stage
// (so it lingers on any revert). Clearing the stored outcome fixes both surfaces.
// MODULE-SCOPE on purpose — referenced by "use server" actions (see matterCtx note).
// No-op when there is no outcome or the move is not a backward revert past it.
async function clearOutcomeIfReverted(
  supabase: Awaited<ReturnType<typeof createClient>>,
  matterId: string,
  pl: Pipeline | null,
  target: { stageKey?: string | null; phaseKey?: string | null },
  userId: string | null
) {
  if (!pl) return;
  const { data: cur } = await supabase.from("matters").select("service_data").eq("id", matterId).maybeSingle();
  const sd = ((cur as { service_data?: Record<string, unknown> } | null)?.service_data) ?? {};
  const outcomeKey = typeof sd.stage_outcome === "string" ? sd.stage_outcome : null;
  if (!outcomeKey) return;
  const decision = decisionStageForOutcome(pl, outcomeKey);
  if (!decision) return;
  const newStageIndex = target.stageKey ? findStage(pl, target.stageKey)?.absoluteIndex ?? null : null;
  const newPhaseIndex = target.phaseKey ? phaseOrder(pl, target.phaseKey) : null;
  const reverted =
    (newStageIndex != null && newStageIndex < decision.absoluteIndex) ||
    (newPhaseIndex != null && newPhaseIndex < phaseOrder(pl, decision.phase.key));
  if (!reverted) return;
  const rest = { ...sd };
  delete rest.stage_outcome;
  delete rest.stage_reason;
  await supabase.from("matters").update({ service_data: rest }).eq("id", matterId);
  await logMatterActivity(supabase, {
    matterId, authorId: userId || null, activityType: "system",
    body: `Council decision cleared (matter reverted before ${decision.stage.name})`,
  });
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
    // Reverting to an earlier phase clears any stale council decision (see helper).
    await clearOutcomeIfReverted(supabase, matterId, pl, { phaseKey: newPhase }, userId || null);
    const logged = await logMatterActivity(supabase, {
      matterId, authorId: userId || null, activityType: "phase_transition",
      body: `Phase: ${label}`,
    });
    // Client/partner are only pinged for phases they can see (avoid overload).
    // `deduped` = this exact transition was already recorded seconds ago (a
    // double-click), so the notification went out with it — sending again would
    // duplicate the push as well as the feed row.
    const phaseClientVisible = pl ? (phaseSteps(pl).some((s) => s.key === newPhase) && newPhase !== pl.prePhase.key) : true;
    if (phaseClientVisible && !logged.deduped) {
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
    // Reverting to an earlier stage clears any stale council decision (see helper).
    await clearOutcomeIfReverted(supabase, matterId, pl, { stageKey: newStage }, userId || null);
    const logged = await logMatterActivity(supabase, {
      matterId, authorId: userId || null, activityType: "status_change",
      body: `Stage: ${label}`,
    });
    // General Note: when stages are skipped (e.g. 1 → 4), list them on the feed.
    const skipped = pl ? skippedStageNames(pl, prevStage, newStage) : [];
    if (skipped.length > 0) {
      await logMatterActivity(supabase, {
        matterId, authorId: userId || null, activityType: "system",
        body: `Skipped: ${skipped.join(", ")}`,
      });
    }
    // Only notify the client/partner for client-visible stages (orange), and only
    // if this stage change was actually new (see advancePhase).
    const clientVisible = pl ? isStageClientVisible(pl, newStage) : true;
    if (clientVisible && !logged.deduped) {
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
    const logged = await logMatterActivity(supabase, {
      matterId, authorId: userId || null, activityType: "status_change",
      body: `Outcome: ${label}`,
    });
    if (outcomeDef?.clientVisible && !logged.deduped) {
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
    const logged = await logMatterActivity(supabase, {
      matterId,
      authorId: userId || null,
      activityType: "status_change",
      body: `Status changed to: ${MATTER_STATUS_LABELS[status as MatterStatus] ?? status}`,
    });
    if (!logged.deduped) {
      await notifyMatterParties(
        matterId,
        { type: "status", title: `Status: ${MATTER_STATUS_LABELS[status as MatterStatus] ?? status}` },
        { excludeUserId: userId || null }
      );
    }
    revalidatePath(`/admin/matters/${matterId}`);
  }

  // Council rates account number — the council's primary key for a clearance
  // matter (proof / application / certificate all reference it). Stored on
  // service_data (no migration); shown + editable here, read-only for partners.
  async function setRatesAccount(formData: FormData) {
    "use server";
    const supabase = await createClient();
    const matterId = formData.get("matter_id") as string;
    const value = ((formData.get("rates_account_no") as string) ?? "").trim();
    if (!matterId) return;
    const { data: cur } = await supabase.from("matters").select("service_data").eq("id", matterId).maybeSingle();
    const sd = ((cur as { service_data?: Record<string, unknown> } | null)?.service_data) ?? {};
    await supabase.from("matters").update({ service_data: { ...sd, rates_account_no: value || null } }).eq("id", matterId);
    await logMatterActivity(supabase, {
      matterId, authorId: authorId || null, activityType: "system",
      body: value ? `Rates account number set: ${value}` : "Rates account number cleared",
    });
    revalidatePath(`/admin/matters/${matterId}`);
  }

  async function postNote(formData: FormData) {
    "use server";
    const supabase = await createClient();
    const body = formData.get("body") as string;
    const matterId = formData.get("matter_id") as string;
    const userId = formData.get("author_id") as string;

    if (!body?.trim()) return;

    const logged = await logMatterActivity(supabase, {
      matterId,
      authorId: userId || null,
      activityType: "post",
      body: body.trim(),
    });

    // Internal notes notify ConveyClear staff (note 11) — never the client/partner.
    // Title prefixing ("<matter title>: …") is centralised in notifyUsers.
    // Skipped when the note was a double-click of one already posted seconds ago.
    if (!logged.deduped) {
      await notifyStaff({
        type: "note",
        title: "Internal note",
        body: body.trim().slice(0, 140),
        link: `/admin/matters/${matterId}`,
        matter_id: matterId,
      });
    }

    revalidatePath(`/admin/matters/${matterId}`);
  }

  const supabase = await createClient();

  // Opening a matter clears its unread notification dot for this user.
  if (authorId) {
    await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", authorId)
      .eq("matter_id", id)
      .is("read_at", null);
  }

  const [{ data: matterData }, { data: docsData }, { data: activitiesData }, { data: partiesData }] = await Promise.all([
    supabase
      .from("matters")
      .select(
        "id, title, current_phase, current_stage, status, priority, deadline, deal_value, municipality, partner_file_ref, service_subtype, service_data, service_notes, drive_folder_id, transfer_id, created_at, updated_at, clients(id, entity_type, full_name, first_name, last_name, business_name, primary_email, primary_cell), firms(name, abbreviation), services(id, code, name, config), property_transfers(id, reference, status)"
      )
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("documents")
      .select("id, matter_id, document_type, document_status, file_name, drive_file_id, storage_bucket, storage_path, matter_party_id, verified, uploaded_by, created_at, client_document_id, transfer_document_id, approved_at, disapproved_at, disapproval_reason")
      .eq("matter_id", id)
      // Superseded = replaced by a newer upload in the same slot (migration 030).
      // Kept in the table for audit, never shown as a matter document.
      .neq("document_status", "superseded")
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

  const matter = matterData as
    | (Matter & {
        services?: { id: string; code: string; name: string; config: any } | null;
        property_transfers?: LinkedTransfer | null;
      })
    | null;
  if (!matter) notFound();

  const documents = (docsData as MatterDocument[] | null) ?? [];
  const activities = (activitiesData as ActivityItem[] | null) ?? [];
  const parties = (partiesData as MatterParty[] | null) ?? [];
  const partyById = new Map(parties.map((p) => [p.id, p]));

  // The shared enquiry thread on this matter (#3). RLS scopes it; staff see
  // every thread including the firm-only ones.
  const enquiryThreads = await getMatterEnquiries(supabase, id);

  // Property transfers this matter could be attached to (migration 026).
  const { data: transferOptData } = await supabase
    .from("property_transfers")
    .select("id, reference, property_description")
    .order("created_at", { ascending: false })
    .limit(200);
  const transferOptions = (
    (transferOptData as { id: string; reference: string; property_description: string | null }[] | null) ?? []
  ).map((t) => ({
    id: t.id,
    label: t.property_description ? `${t.reference} — ${t.property_description}` : t.reference,
  }));

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
  const signedUrls = documents.length > 0 ? await signedDocUrls(createAdminClient(), documents) : {};

  // FICA vault (migration 025): reusable docs for the matter's client + each
  // party's linked client, so the in-place intake can offer "Reuse".
  const matterClientId = (matter as { clients?: { id?: string | null } | null }).clients?.id ?? null;
  const vaultClientIds = Array.from(
    new Set([matterClientId, ...parties.map((p) => p.client_id)].filter((x): x is string => Boolean(x)))
  );
  const vaultByClient: Record<string, ClientDocument[]> = {};
  if (vaultClientIds.length > 0) {
    const { data: vaultRows } = await supabase
      .from("client_documents")
      .select("id, client_id, document_type, file_name, mime_type, size_bytes, storage_bucket, storage_path, uploaded_by, created_at, status, expiry_date, verified")
      .in("client_id", vaultClientIds)
      // Only offer CURRENT documents for reuse — never a superseded version or an
      // archived one (migration 032).
      .eq("status", "current");
    for (const r of (vaultRows as ClientDocument[] | null) ?? []) {
      (vaultByClient[r.client_id] ??= []).push(r);
    }
  }

  // Transfer-level documents (034) — offered on the matter's SHARED slots as
  // "From transfer", so the deed search obtained once for the property serves
  // every matter in it. Empty for a standalone matter, which remains the norm.
  const transferId = (matter as { transfer_id?: string | null }).transfer_id ?? null;
  const { data: transferDocData } = transferId
    ? await supabase
        .from("transfer_documents")
        .select("id, transfer_id, document_type, file_name, mime_type, size_bytes, storage_bucket, storage_path, status, verified, uploaded_by, created_at")
        .eq("transfer_id", transferId)
        .eq("status", "current")
    : { data: null };
  const transferDocs = (transferDocData as TransferDocument[] | null) ?? [];

  // In-place FICA (033) — details + consent, PER SUBJECT. A COO matter is
  // party-centric: buyer and seller are separate entities with separate details,
  // consent and directors, and the matter itself often carries no client at all.
  const ficaSubjects = await buildFicaSubjects(supabase, matterClientId, parties);

  const svc = (matter as { services?: { code?: string; name?: string } | null }).services;
  const firm = (matter as { firms?: { name?: string | null; abbreviation?: string | null } | null }).firms;
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

  const docRow = (doc: MatterDocument) => {
    // Approval gate state (042/043/044). approved_at set = released; disapproved_at
    // set = rejected (held, has a reason); neither = pending an admin decision.
    const isDisapproved = doc.disapproved_at != null;
    const isPending = doc.approved_at == null && !isDisapproved;
    // Grey while it is neither approved nor disapproved — a held upload the
    // client and partner firm cannot see yet.
    return (
    <li key={doc.id} className={`flex items-center gap-3 px-5 py-3 ${isPending ? "opacity-60" : ""}`}>
      <FileText className="h-4 w-4 text-gray-500 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800 truncate">{doc.file_name || doc.document_type}</p>
        <p className="text-xs text-gray-500">
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
      {/* Approval gate (042/043/044). Pending = held for an admin; disapproved =
          rejected with a reason. Both stay hidden from the client and partner
          firm; these badges tell staff WHY a row is not out. */}
      {isPending && (
        <span
          className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700"
          title="Not released. Hidden from the client and partner firm until an admin approves it in Document Approvals."
        >
          Awaiting approval
        </span>
      )}
      {isDisapproved && (
        <span
          className="shrink-0 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-700"
          title={doc.disapproval_reason ? `Not approved: ${doc.disapproval_reason}` : "Not approved by an admin."}
        >
          Not approved
        </span>
      )}
      {doc.verified && <span className="text-xs text-green-600 font-medium shrink-0">Verified</span>}
      {doc.document_status && doc.document_status !== "uploaded" && (
        <span className="text-xs text-amber-600 font-medium shrink-0">{doc.document_status}</span>
      )}
    </li>
    );
  };

  const docGroup = (title: string, list: MatterDocument[]) => (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">{title} ({list.length})</p>
      {list.length > 0 ? (
        <Card padding="none"><ul className="divide-y divide-gray-100">{list.map(docRow)}</ul></Card>
      ) : (
        <Card className="text-center py-5"><p className="text-sm text-gray-500">None</p></Card>
      )}
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        {/* Back where you came from. A matter inside a property transfer is
            almost always reached FROM that transfer — Jukka's model makes the
            transfer the primary object — so bouncing to the full matters list
            threw away the context the user was working in. */}
        <Link
          href={transferId ? `/admin/property-transfers/${transferId}` : "/admin/matters"}
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          {transferId ? matter.property_transfers?.reference ?? "Property transfer" : "All matters"}
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

      {/* Parent property transfer — the transaction this matter belongs to. */}
      <MatterTransferCard
        matterId={id}
        transfer={matter.property_transfers ?? null}
        options={transferOptions}
        manage
        basePath="/admin/property-transfers"
      />

      {/* Pipeline (config-driven) */}
      {pipeline ? (
        <Card accent="service" className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5"><Workflow className="h-3.5 w-3.5 text-sky-700" /> Pipeline · {pipeline.label}</p>
            <span className="text-xs text-gray-500">
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
              <SubmitButton pendingLabel="…" className="px-3 py-2 text-sm font-medium bg-[#1B2E6B] text-white rounded-lg hover:bg-[#1B2E6B]/90">Set</SubmitButton>
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
              <SubmitButton pendingLabel="…" className="px-3 py-2 text-sm font-medium bg-[#E8521A] text-white rounded-lg hover:bg-[#E8521A]/90">Update</SubmitButton>
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
                <SubmitButton pendingLabel="Saving…" className="px-3 py-2 text-sm font-medium bg-[#1B2E6B] text-white rounded-lg hover:bg-[#1B2E6B]/90">Set outcome</SubmitButton>
              </form>
            </div>
          )}
        </Card>
      ) : (
        <Card accent="service">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Pipeline</p>
          <p className="text-sm text-gray-500">
            No pipeline configured for {municipalityLabel(matter.municipality)} / {svc?.name ?? "this service"} yet.
            {" "}Phase: {matter.current_phase ?? "—"} · Stage: {matter.current_stage ?? "—"}.
          </p>
        </Card>
      )}

      {/* Council rates account number — the council's primary key for a
          clearance matter (proof / application / certificate reference it). */}
      <Card accent="service">
        <form action={setRatesAccount} className="flex items-end gap-2">
          <input type="hidden" name="matter_id" value={id} />
          <label className="flex-1 text-xs font-medium text-gray-500">
            Rates account number
            <input
              type="text"
              name="rates_account_no"
              defaultValue={typeof sd.rates_account_no === "string" ? sd.rates_account_no : ""}
              placeholder="Council rates account no."
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B2E6B]"
            />
          </label>
          <SubmitButton pendingLabel="Saving…" className="px-3 py-2 text-sm font-medium bg-[#1B2E6B] text-white rounded-lg hover:bg-[#1B2E6B]/90">Save</SubmitButton>
        </form>
      </Card>

      {/* Matter facts */}
      <Card accent="service">
        <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
          <div>
            <dt className="text-xs text-gray-500">Status</dt>
            <dd className="text-gray-800 mt-0.5">{matter.status ? MATTER_STATUS_LABELS[matter.status as MatterStatus] : "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">Priority</dt>
            <dd className="text-gray-800 mt-0.5">{matter.priority ? PRIORITY_LABELS[matter.priority as MatterPriority] : "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">Estimated closing time</dt>
            <dd className="text-gray-800 mt-0.5">{matter.deadline ? formatDate(matter.deadline) : "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">Opened</dt>
            <dd className="text-gray-800 mt-0.5">{formatDate(matter.created_at)}</dd>
          </div>
          {(matter as { service_subtype?: string | null }).service_subtype && (
            <div>
              <dt className="text-xs text-gray-500">Clearance type</dt>
              <dd className="text-gray-800 mt-0.5">{(matter as { service_subtype?: string | null }).service_subtype}</dd>
            </div>
          )}
          {/* Service-specific referral fields (PRC account no / utilities / query ref) merged in. */}
          {Object.entries(((matter as { service_data?: Record<string, unknown> | null }).service_data ?? {}))
            .filter(([k, v]) => v && !["stage_outcome", "stage_reason"].includes(k))
            .map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs text-gray-500 capitalize">{k.replace(/_/g, " ")}</dt>
                <dd className="text-gray-800 mt-0.5">{String(v)}</dd>
              </div>
            ))}
          {matter.service_notes && (
            <div className="col-span-2 sm:col-span-3">
              <dt className="text-xs text-gray-500">Service Notes</dt>
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
          <SubmitButton pendingLabel="Updating…" className="px-3 py-1.5 text-sm font-medium bg-[#1B2E6B] text-white rounded-lg hover:bg-[#1B2E6B]/90">
            Update status
          </SubmitButton>
          {matter.status === "new" && (
            <span className="text-xs font-medium text-amber-600">Awaiting review — set to Open once reviewed</span>
          )}
        </form>
      </Card>

      {/* ConveyClear internal — staff-only container (note 2026-06-22). */}
      <Card accent="internal" className="bg-[#1B2E6B]/5">
        <div className="flex items-center gap-1.5 mb-3">
          <Lock className="h-3.5 w-3.5 text-[#1B2E6B]" />
          <h2 className="text-xs font-semibold uppercase tracking-wide text-[#1B2E6B]">ConveyClear internal</h2>
        </div>
        <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
          {firm?.name && (
            <div>
              <dt className="text-xs text-gray-500">Referring firm</dt>
              <dd className="text-gray-800 mt-0.5">{firm.name}{firm.abbreviation ? ` (${firm.abbreviation})` : ""}</dd>
            </div>
          )}
          {matter.partner_file_ref && (
            <div>
              <dt className="text-xs text-gray-500">Internal file ref</dt>
              <dd className="text-gray-800 mt-0.5">{matter.partner_file_ref}</dd>
            </div>
          )}
          {matter.deal_value && (
            <div>
              <dt className="text-xs text-gray-500">Deal value</dt>
              <dd className="text-gray-800 mt-0.5">R {matter.deal_value.toLocaleString("en-ZA")}</dd>
            </div>
          )}
          {!firm?.name && !matter.partner_file_ref && !matter.deal_value && (
            <p className="text-sm text-gray-500 col-span-3">No internal details captured yet.</p>
          )}
        </dl>
      </Card>

      {/* Celebration when the matter is won/closed (H2) */}
      <Celebrate active={matter.status === "won"} matterId={matter.id} />

      {/* Enquiries — the shared client/partner/CC thread (A&A #3). Read + post
          in place; the activity feed below stays internal. */}
      <MatterEnquiries matterId={id} threads={enquiryThreads} audience="staff" />

      {/* Client info */}
      {matter.clients && (
        <Card accent="client">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5"><User className="h-3.5 w-3.5 text-emerald-700" /> Client</p>
            <Link
              href={`/admin/clients/${(matter.clients as any).id}`}
              className="text-xs text-[#E8521A] hover:underline"
            >
              View profile
            </Link>
          </div>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-xs text-gray-500">Name</dt>
              <dd className="font-medium mt-0.5">{clientDisplayName(matter.clients)}</dd>
            </div>
            {(matter.clients as any).primary_email && (
              <div>
                <dt className="text-xs text-gray-500">Email</dt>
                <dd className="mt-0.5">{(matter.clients as any).primary_email}</dd>
              </div>
            )}
            {(matter.clients as any).primary_cell && (
              <div>
                <dt className="text-xs text-gray-500">Cell</dt>
                <dd className="mt-0.5">{(matter.clients as any).primary_cell}</dd>
              </div>
            )}
          </dl>
        </Card>
      )}

      {/* Parties (COO buyer/seller etc.) — renders nothing for single-client matters */}
      <PartiesCard parties={parties} manage />

      {/* In-place FICA — client details + consent. Together with the document
          checklist below, this is what makes /onboard optional rather than the
          only way to actually finish a matter (migration 033). */}
      <InPlaceFica matterId={id} subjects={ficaSubjects} isStaff />

      {/* In-place intake — service-aware required-document checklist + upload
          (the primary capture method; renders null for non-COO/PRC services) */}
      <InPlaceIntake
        matterId={id}
        serviceCode={svc?.code ?? null}
        parties={parties}
        documents={documents}
        municipality={matter.municipality}
        unavailable={Array.isArray(sd.docs_unavailable) ? (sd.docs_unavailable as string[]) : []}
        canManage
        vaultByClient={vaultByClient}
        matterClientId={matterClientId}
        transferDocs={transferDocs}
      />

      {/* Council POC(s) — internal, staff-only directory link (B5 / Theme G) */}
      <MatterPocsCard matterId={id} linked={linkedPocs} all={allPocs} />

      {/* Documents — split client/partner uploads vs ConveyClear uploads (note 29) */}
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2"><FileText className="h-4 w-4 text-sky-700" /> Documents ({documents.length})</h2>
          <div className="flex flex-wrap items-center gap-3">
            {documents.length > 0 && <CouncilPackButton matterId={id} />}
            <StorageUpload matterId={id} />
            <CollectFicaButton matterId={id} fica={!isCoo} />
          </div>
        </div>
        {docGroup("Client / business-partner uploads", clientPartnerDocs)}
        {docGroup("ConveyClear uploads", ccDocs)}
      </div>

      {/* Internal activity feed. Named for its AUDIENCE, not its content (Jukka,
          meeting 1): staff kept having to remember which of the two threads on
          this page the partner firm can see. The enquiry thread above is the
          shared one; everything here is ours. */}
      <div>
        <div className="mb-3 flex items-center gap-1.5">
          <Lock className="h-3.5 w-3.5 text-gray-500" />
          <h2 className="font-semibold text-gray-900">Internal Activity Feed</h2>
        </div>
        <p className="-mt-2 mb-3 text-xs text-gray-500">
          ConveyClear only. Notes here are never shown to the client or the partner firm — use Matter Enquiries above to
          talk to them.
        </p>

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
            <SubmitButton
              pendingLabel="Posting…"
              className="px-4 py-2 text-sm font-medium bg-[#E8521A] text-white rounded-lg hover:bg-[#E8521A]/90 transition-colors self-end"
            >
              Post
            </SubmitButton>
          </div>
        </form>

        {activities.length > 0 ? (
          <Card accent="internal" padding="none">
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
                      <p className="text-xs text-gray-500 mt-1">
                        {authorName} · {formatDateTime(a.created_at)}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
        ) : (
          <Card accent="internal" className="text-center py-8">
            <p className="text-sm text-gray-500">No activity yet</p>
          </Card>
        )}
      </div>
    </div>
  );
}
