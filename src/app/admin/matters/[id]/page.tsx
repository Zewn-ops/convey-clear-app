import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import Link from "next/link";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import { formatDate, formatDateTime, municipalityLabel } from "@/lib/utils";
import { matterProgressBlockedReason, requiresTransfer } from "@/lib/transfer-gate";
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
import PartiesCard from "@/components/matters/PartiesCard";
import MatterTransferCard, { type LinkedTransfer } from "@/components/matters/MatterTransferCard";
import MatterPocsCard from "@/components/matters/MatterPocsCard";
import PipelineProgress from "@/components/matters/PipelineProgress";
import PhaseProgress from "@/components/ui/PhaseProgress";
import DocRenameButton from "@/components/matters/DocRenameButton";
import CouncilPackButton from "@/components/matters/CouncilPackButton";
import Celebrate from "@/components/matters/Celebrate";
import MatterFeed from "@/components/matters/MatterFeed";
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
import { normalisePrcStage, prcStageLabel, PRC_SUBTYPES } from "@/lib/prc-docs";
import MatterUploadPanel from "@/components/matters/MatterUploadPanel";
import InPlaceIntake from "@/components/matters/InPlaceIntake";
import InPlaceFica from "@/components/matters/InPlaceFica";
import SubmitButton from "@/components/ui/SubmitButton";
import { buildFicaSubjects } from "@/lib/fica";
import CouncilPortalDetails from "@/components/matters/CouncilPortalDetails";
import { resolveDocClass, type PartyRole } from "@/lib/doc-classes";
import {
  councilPartyFieldKeys,
  DOC_CLASSES,
  DOC_CLASS_LABELS,
  DOC_CLASS_HINTS,
  type DocClass,
} from "@/lib/councils";
import { logMatterActivity } from "@/lib/activity";
import { createAdminClient } from "@/lib/supabase/admin";
import { signedDocUrls } from "@/lib/storage";

export const dynamic = "force-dynamic";

/**
 * The record's own name in the tab.
 *
 * Every detail page fell through to the ROOT metadata, so an ADMIN looking at a
 * property transfer had a tab reading "ConveyClear -- Client Portal" (found
 * 2026-09-02). Staff keep several of these open at once; a tab that names the
 * portal rather than the record cannot be told from its neighbours.
 */
export const metadata = { title: "Matter \u2014 ConveyClear Admin" };


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
    post: <MessageSquare className="h-4 w-4 text-ink-3" />,
    phase_transition: <ArrowUpCircle className="h-4 w-4 text-action" />,
    document_upload: <UploadCloud className="h-4 w-4 text-green-500" />,
    email_bridge: <Mail className="h-4 w-4 text-blue-500" />,
    system: <Settings className="h-4 w-4 text-ink-3" />,
    status_change: <ArrowUpCircle className="h-4 w-4 text-amber-500" />,
  };
  return <>{icons[type] ?? <MessageSquare className="h-4 w-4 text-ink-3" />}</>;
}

// Resolve a matter's pipeline + current status/stage. MODULE-SCOPE on purpose:
// the "use server" actions below reference it, and inline server actions are
// extracted into their own bundle — a helper defined inside the component is not
// in scope there at runtime (ReferenceError in prod, though dev tolerates it).
async function matterCtx(supabase: Awaited<ReturnType<typeof createClient>>, matterId: string) {
  const { data } = await supabase
    .from("matters")
    .select("title, status, current_phase, current_stage, municipality, service_subtype, transfer_id, services(code)")
    .eq("id", matterId)
    .maybeSingle();
  const code = (data as { services?: { code?: string } | null } | null)?.services?.code ?? null;
  const pl = getPipeline(code, data?.municipality, (data as { service_subtype?: string | null } | null)?.service_subtype);
  return { row: data, pl, serviceCode: code, transferId: (data as { transfer_id?: string | null } | null)?.transfer_id ?? null };
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

    const { row, pl, serviceCode, transferId } = await matterCtx(supabase, matterId);

    // Stop-gate (Meeting 2, 2026-08-06): COO and Rates Clearance matters cannot
    // progress unlinked. BACKSTOP ONLY — the control below is disabled and says
    // why, so this should be unreachable from the UI. It returns silently
    // because there is no path here that a user can trigger and then wonder
    // about; if that ever changes, this needs to surface a message instead.
    if (matterProgressBlockedReason({ pipeline: pl, serviceCode, transferId, target: { phaseKey: newPhase } })) {
      return;
    }

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

    const { row, pl, serviceCode, transferId } = await matterCtx(supabase, matterId);

    // Same stop-gate as advancePhase — every stage lives inside a real phase, so
    // setting any stage on an unlinked COO/PRC matter is progression. Backstop.
    if (matterProgressBlockedReason({ pipeline: pl, serviceCode, transferId, target: { stageKey: newStage } })) {
      return;
    }

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
    const { data: cur } = await supabase
      .from("matters")
      .select("service_data, title")
      .eq("id", matterId)
      .maybeSingle();
    const sd = ((cur as { service_data?: Record<string, unknown> } | null)?.service_data) ?? {};
    const previous = typeof sd.rates_account_no === "string" ? sd.rates_account_no.trim() : "";

    // The account number joins the file reference. Jukka, 2026-09-01: "when they
    // put down the rates account number, because that thing is so crucial, that
    // also should form part of the property rates clearance file reference."
    //
    // Appended as the last segment, and REPLACED rather than stacked when it
    // changes — a matter whose account number was corrected twice would
    // otherwise carry all three. A title that does not already end in the old
    // number is left alone: it has been edited by hand, and that is a decision.
    const titlePatch = (() => {
      const current = ((cur as { title?: string | null } | null)?.title ?? "").trim();
      if (!current || previous === value) return {};
      const stripped = previous && current.endsWith(`_${previous.toUpperCase()}`)
        ? current.slice(0, -(previous.length + 1))
        : current;
      if (previous && stripped === current) return {}; // hand-edited — leave it
      const next = value ? `${stripped}_${value.toUpperCase()}` : stripped;
      return next === current ? {} : { title: next };
    })();

    await supabase
      .from("matters")
      .update({ service_data: { ...sd, rates_account_no: value || null }, ...titlePatch })
      .eq("id", matterId);
    await logMatterActivity(supabase, {
      matterId, authorId: authorId || null, activityType: "system",
      body: value ? `Rates account number set: ${value}` : "Rates account number cleared",
    });
    revalidatePath(`/admin/matters/${matterId}`);
  }

  // The rates-clearance stage (RCA | RCF | RCC) — `matters.service_subtype`.
  //
  // 🔴 Until now NOTHING in the app wrote this column. It is read in ten places,
  // getPipeline() and the in-place intake among them, so every PRC matter
  // carried NULL and therefore had no pipeline and no document list. New matters
  // now inherit the stage from their checklist line; this control covers the two
  // cases inheritance cannot — a PRC matter opened outside any transfer, and a
  // stage set wrongly that has to be corrected.
  //
  // Changing the stage changes which documents the matter asks for, so it is
  // logged rather than being a silent edit.
  async function setPrcStage(formData: FormData) {
    "use server";
    const supabase = await createClient();
    const matterId = formData.get("matter_id") as string;
    if (!matterId) return;
    const stage = normalisePrcStage(formData.get("prc_stage") as string);

    const { row, pl: prevPipeline, serviceCode } = await matterCtx(supabase, matterId);
    // Guard, not decoration: a rates stage written onto a COO would send
    // getPipeline() looking for a COO/RCF pipeline that cannot exist.
    if ((serviceCode ?? "").toUpperCase() !== "PRC") return;
    const prev = (row as { service_subtype?: string | null } | null)?.service_subtype ?? null;
    if (prev === stage) return;

    const pipeline = getPipeline(serviceCode, row?.municipality, stage);
    // A matter created before its stage was known has no phase at all, because
    // there was no pipeline to take a pre-phase from. Fill that blank now. Also
    // reset when the stage change swapped the pipeline underneath the matter:
    // its stored position is a key from a tree it is no longer in, and leaving
    // it there renders a phase that the new pipeline does not contain.
    const positionLost = Boolean(prevPipeline && pipeline && prevPipeline.subtype !== pipeline.subtype);
    const phasePatch =
      pipeline && (!row?.current_phase || positionLost)
        ? { current_phase: pipeline.prePhase.key, current_stage: null }
        : {};

    // The stage is in the TITLE (COT_RCA_…, not COT_PRC_…), so setting or
    // changing it renames the matter. Only when the title still carries the old
    // token in the service slot — a hand-edited or partner-referenced title is
    // somebody's decision and is left alone.
    const titlePatch = (() => {
      const current = (row as { title?: string | null } | null)?.title ?? "";
      const from = prev || "PRC";
      const to = stage || "PRC";
      if (!current || from === to) return {};
      const renamed = current.replace(new RegExp(`(^|_)${from}(_|$)`), `$1${to}$2`);
      return renamed === current ? {} : { title: renamed };
    })();

    await supabase
      .from("matters")
      .update({ service_subtype: stage, ...phasePatch, ...titlePatch })
      .eq("id", matterId);
    await logMatterActivity(supabase, {
      matterId,
      authorId: authorId || null,
      activityType: "system",
      body: stage
        ? `Rates clearance stage set: ${prcStageLabel(stage)}${positionLost ? " — pipeline position reset" : ""}`
        : "Rates clearance stage cleared",
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

  // Phase N of M, computed exactly as the client matter page does it. Same
  // helpers, same off-by-one, same "no pipeline / unknown phase" guard — two
  // implementations of one progress figure will drift and then disagree about
  // the same matter in front of the same person.
  const pipelineSteps = pipeline ? phaseSteps(pipeline) : [];
  // A null phase is the pre-phase, not "no pipeline" — see the note in
  // MatterCard. Here it decides whether the progress BAR draws; the stepper
  // below already rendered, so the two disagreed on the same page.
  const pipelineIdx = pipeline
    ? Math.max(phaseOrder(pipeline, matter.current_phase), matter.current_phase ? -1 : 0)
    : -1;
  const hasPipelineProgress = pipeline !== null && pipelineIdx >= 0;
  // Stop-gate (Meeting 2, 2026-08-06). Computed here rather than only enforced
  // in the action so the controls can be disabled WITH a reason — a control that
  // submits and silently does nothing is the defect class this codebase keeps
  // hitting. The transfer card directly above is where the link is made.
  const transferGated = requiresTransfer(svc?.code) && !matter.transfer_id;

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


  // Documents grouped by CLASS rather than by who uploaded them (2026-09-01).
  //
  // matter_documents has no stored class — 076 added one to transfer_documents
  // only — so it is resolved from the council registry for this (council,
  // service, stage). A type the registry does not name goes to `other` rather
  // than being guessed into a class.
  // 🔴 resolveDocClass, NOT the service spec alone.
  //
  // The first cut built the map from THIS service's requirements only, so a
  // certified ID reused onto an RCF — a document the RCF list deliberately no
  // longer names — fell to "Other documents". Found on production 2026-09-01.
  //
  // resolveDocClass is the resolution the council pack already uses: this
  // council's rules first, then any council that names the type, then the
  // default map. So a certified ID is supporting everywhere, and "other" goes
  // back to meaning "nobody has ever classed this", which is what its heading
  // claims. Two resolvers for one question is the 066 mistake.
  const partyRoleById = new Map<string, string>();
  for (const p of parties) partyRoleById.set(p.id, p.role);
  const docsByClass: Record<DocClass | "other", MatterDocument[]> = {
    input: [], supporting: [], output: [], other: [],
  };
  for (const d of documents) {
    const role = d.matter_party_id ? partyRoleById.get(d.matter_party_id) ?? null : null;
    docsByClass[resolveDocClass(matter.municipality, d.document_type ?? "", role as PartyRole)].push(d);
  }

  // The parties, in the shape the upload panel asks "whose is it?" with.
  const uploadParties = parties.map((p) => ({
    id: p.id,
    role: p.role,
    name:
      p.business_name?.trim() ||
      p.full_name?.trim() ||
      [p.first_name, p.last_name].filter(Boolean).join(" ").trim() ||
      p.role.replace(/_/g, " "),
  }));

  const docRow = (doc: MatterDocument) => {
    // Approval gate state (042/043/044). approved_at set = released; disapproved_at
    // set = rejected (held, has a reason); neither = pending an admin decision.
    const isDisapproved = doc.disapproved_at != null;
    const isPending = doc.approved_at == null && !isDisapproved;
    // Grey while it is neither approved nor disapproved — a held upload the
    // client and partner firm cannot see yet.
    return (
    <li key={doc.id} className={`flex items-center gap-3 px-5 py-3 ${isPending ? "opacity-60" : ""}`}>
      <FileText className="h-4 w-4 text-ink-3 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-ink truncate">{doc.file_name || doc.document_type}</p>
        <p className="text-xs text-ink-3">
          {doc.document_type} · {formatDate(doc.created_at)}
          {doc.matter_party_id && partyById.get(doc.matter_party_id) ? ` · ${partyById.get(doc.matter_party_id)!.role}` : ""}
        </p>
      </div>
      {doc.storage_path && signedUrls[doc.storage_path] ? (
        <div className="flex items-center gap-3 shrink-0">
          <a href={signedUrls[doc.storage_path]} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-action hover:underline">View</a>
          <a href={`${signedUrls[doc.storage_path]}&download=${encodeURIComponent(doc.file_name ?? "document")}`} className="text-xs font-medium text-action hover:underline">Download</a>
        </div>
      ) : doc.drive_file_id ? (
        <div className="flex items-center gap-3 shrink-0">
          <a href={`https://drive.google.com/file/d/${doc.drive_file_id}/view`} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-action hover:underline">View</a>
          <a href={`https://drive.google.com/uc?export=download&id=${doc.drive_file_id}`} className="text-xs font-medium text-action hover:underline">Download</a>
        </div>
      ) : (
        <span className="shrink-0 text-xs text-ink-3">No file</span>
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


  return (
    // Width + order, 2026-09-01. Same change as the property-transfer page and
    // for the same reason: the 896px cap left half a wide screen empty, and the
    // sections ran in the order they were built rather than the order they are
    // read. Zewn: "please also rearrange matter page to align with the ordering
    // of prop trf page."
    //
    // Left = the work, in the transfer page's order — who the matter is for,
    // then what stage/pipeline it runs, then what has been filed. Right = the
    // reference detail that used to interrupt it.
    <div className="space-y-6">
      <div>
        {/* Back where you came from. A matter inside a property transfer is
            almost always reached FROM that transfer — Jukka's model makes the
            transfer the primary object — so bouncing to the full matters list
            threw away the context the user was working in. */}
        <Link
          href={transferId ? `/admin/property-transfers/${transferId}` : "/admin/matters"}
          className="inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-ink mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          {transferId ? matter.property_transfers?.reference ?? "Property transfer" : "All matters"}
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-[40px] font-semibold leading-[1.06] tracking-[-0.032em] text-ink">
              {matter.title || displayName}
            </h1>
            <p className="text-sm text-ink-3 mt-1">
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

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,2.15fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-6">
        {/* In-place FICA — client details + consent. Together with the document
            checklist below, this is what makes /onboard optional rather than the
            only way to actually finish a matter (migration 033). */}
        <InPlaceFica
          matterId={id}
          subjects={ficaSubjects}
          isStaff
          municipality={matter.municipality}
          serviceCode={svc?.code ?? null}
          prcStage={(matter as { service_subtype?: string | null }).service_subtype ?? null}
          // The old "Client" card's whole contents. Zewn, 2026-09-01: "this is
          // also duplicated data in 2 sections please fix" — that card named the
          // client and listed their email and cell directly above this one,
          // which opens by naming the same client and saying what is missing
          // from their record.
          contact={
            matter.clients
              ? {
                  name: clientDisplayName(matter.clients),
                  email: (matter.clients as { primary_email?: string | null }).primary_email ?? null,
                  cell: (matter.clients as { primary_cell?: string | null }).primary_cell ?? null,
                  profileHref: `/admin/clients/${(matter.clients as { id: string }).id}`,
                }
              : null
          }
        />
        {/* Parties (COO buyer/seller etc.) — renders nothing for single-client matters */}
        <PartiesCard
          parties={parties}
          manage
          matterId={id}
          ficaSubjects={ficaSubjects}
          isStaff
          municipality={matter.municipality}
          serviceCode={svc?.code ?? null}
          prcStage={(matter as { service_subtype?: string | null }).service_subtype ?? null}
        />
        {/* ── Rates clearance stage ─────────────────────────────────────────────
            A PRC matter is an RCA, an RCF or an RCC, and which one decides both
            its pipeline and its document list. The stage normally arrives from the
            transfer's service checklist; this is where it is set on a matter with
            no transfer, and where a wrong one is corrected.

            Sits directly above the pipeline card because it is the input to it —
            with no stage there is no pipeline, and the card below says so. */}
        {(svc?.code ?? "").toUpperCase() === "PRC" && (
          <Card accent="service">
            <form action={setPrcStage} className="flex items-end gap-2">
              <input type="hidden" name="matter_id" value={id} />
              <label className="flex-1 text-xs font-medium text-ink-3">
                Rates clearance stage
                <select
                  name="prc_stage"
                  defaultValue={(matter as { service_subtype?: string | null }).service_subtype ?? ""}
                  className="bg-surface text-ink mt-1 w-full rounded-lg border border-line py-2 pl-3 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B2E6B]"
                >
                  <option value="">— Stage not chosen —</option>
                  {PRC_SUBTYPES.map((s) => (
                    <option key={s.code} value={s.code}>{s.label}</option>
                  ))}
                </select>
              </label>
              <SubmitButton pendingLabel="Saving…" className="px-3 py-2 text-sm font-medium bg-action-fill text-white rounded-lg hover:bg-action-fill/90">Save</SubmitButton>
            </form>
            <p className="mt-2 text-xs text-ink-3">
              {(matter as { service_subtype?: string | null }).service_subtype
                ? "Changing the stage changes the documents this matter asks for. Moving to a different stage restarts its pipeline, because each stage runs its own."
                : "Choose one — an application, a figures request and a certificate request need different documents and run different pipelines."}
            </p>
          </Card>
        )}
        {/* Pipeline (config-driven) */}
        {pipeline ? (
          <Card accent="service" className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-ink-3 uppercase tracking-wide flex items-center gap-1.5"><Workflow className="h-3.5 w-3.5 text-sky-700" /> Pipeline · {pipeline.label}</p>
              <span className="text-xs text-ink-3">
                {matter.current_stage ? stageLabel(pipeline, matter.current_stage) : "Stage not set"}
              </span>
            </div>

            {/* 🔒 STAFF ONLY. Rendered on the admin matter page and nowhere else
                — not the partner matter page, not the client portal. Zewn,
                2026-09-01: "make a note saying its a default pipeline so that
                only conveyclear members can see the note and not attorneys or
                clients."

                It is a note about OUR build state, not about their matter. A
                client reading it learns only that we have not mapped their
                service yet, which is our problem to solve and not theirs to
                carry. Staff need it because the stage names below are generic
                and would otherwise look like the council's own. */}
            {pipeline.isDefault && (
              <div className="rounded-lg bg-waiting-tint px-3.5 py-3 ring-1 ring-inset ring-waiting/20">
                <p className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-waiting">
                  <Lock className="h-3 w-3" /> Default pipeline · ConveyClear only
                </p>
                <p className="mt-1 text-[13px] text-ink-2">
                  {municipalityLabel(matter.municipality)} / {svc?.name ?? "this service"} has no mapped
                  process yet, so this matter is running the general four-step one. The stages below are
                  ours, not the council&apos;s. Progress still tracks and the client still sees where the
                  matter is — they are not shown this note.
                </p>
              </div>
            )}
            {/* The bar the overview and the client portal both show. The stepper
                below says WHERE the matter is; the bar says HOW FAR, which is the
                thing you want at a glance on a process measured in months. */}
            {hasPipelineProgress && (
              <PhaseProgress
                phase={pipelineIdx + 1}
                total={pipelineSteps.length}
                // Staff see the internal phase name, not the client-facing one.
                label={phaseLabel(pipeline, matter.current_phase)}
                done={pipelineIdx === pipelineSteps.length - 1}
              />
            )}
            <PipelineProgress pipeline={pipeline} currentPhase={matter.current_phase} currentStage={matter.current_stage} audience="staff" />
            {transferGated && (
              <div className="rounded-lg border border-line bg-waiting-tint px-3 py-2.5 flex items-start gap-2">
                <Lock className="h-4 w-4 shrink-0 mt-0.5 text-waiting" />
                <p className="text-xs text-ink-2">
                  <span className="font-semibold text-ink">This matter cannot progress yet.</span>{" "}
                  {svc?.code === "COO" ? "Change of Ownership" : "Rates Clearance"} matters must be
                  linked to a property transfer before the phase or stage can move. Link one in the
                  Property transfer card above.
                </p>
              </div>
            )}
            <div className="pt-3 border-t border-line grid gap-3 sm:grid-cols-2">
              <form action={advancePhase} className="flex items-end gap-2">
                <input type="hidden" name="matter_id" value={id} />
                <input type="hidden" name="author_id" value={authorId ?? ""} />
                <label className="flex-1 text-xs font-medium text-ink-3">
                  Phase
                  <select name="phase" defaultValue={matter.current_phase ?? ""} disabled={transferGated} className="bg-surface text-ink mt-1 w-full rounded-lg border border-line py-2 pl-3 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B2E6B] disabled:bg-raised disabled:text-ink-3">
                    {phaseSteps(pipeline).map((s) => (<option key={s.key} value={s.key}>{s.label}</option>))}
                  </select>
                </label>
                <SubmitButton disabled={transferGated} pendingLabel="…" className="px-3 py-2 text-sm font-medium bg-action-fill text-white rounded-lg hover:bg-action-fill/90">Set</SubmitButton>
              </form>
              <form action={setStage} className="flex items-end gap-2">
                <input type="hidden" name="matter_id" value={id} />
                <input type="hidden" name="author_id" value={authorId ?? ""} />
                <label className="flex-1 text-xs font-medium text-ink-3">
                  Stage{curPhaseDef ? ` · ${curPhaseDef.internalName}` : ""}
                  <select name="stage" defaultValue={matter.current_stage ?? ""} disabled={transferGated || curPhaseStages.length === 0} className="mt-1 w-full rounded-lg border border-line py-2 pl-3 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B2E6B] disabled:bg-raised disabled:text-ink-3">
                    <option value="">— Select stage —</option>
                    {curPhaseStages.map((s) => (<option key={s.key} value={s.key}>{s.name}{s.clientVisible ? "" : " (internal)"}</option>))}
                  </select>
                </label>
                <SubmitButton disabled={transferGated} pendingLabel="…" className="px-3 py-2 text-sm font-medium bg-action-fill text-white rounded-lg hover:bg-action-fill/90">Update</SubmitButton>
              </form>
            </div>

            {/* Decision outcome (RCF/RCC: Approved / Delayed / Rejected + reason) */}
            {decisionOptions.length > 0 && (
              <div className="pt-3 border-t border-line">
                {currentOutcomeLabel && (
                  <p className="text-xs text-ink-3 mb-2">Current outcome: <span className="font-medium text-ink">{currentOutcomeLabel}</span></p>
                )}
                <form action={setOutcome} className="flex items-end gap-2">
                  <input type="hidden" name="matter_id" value={id} />
                  <input type="hidden" name="author_id" value={authorId ?? ""} />
                  <label className="flex-1 text-xs font-medium text-ink-3">
                    {decisionStage?.name} outcome
                    <select name="outcomeReason" defaultValue={currentOutcomeValue} className="bg-surface text-ink mt-1 w-full rounded-lg border border-line py-2 pl-3 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B2E6B]">
                      <option value="">— Select outcome —</option>
                      {decisionOptions.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
                    </select>
                  </label>
                  <SubmitButton pendingLabel="Saving…" className="px-3 py-2 text-sm font-medium bg-action-fill text-white rounded-lg hover:bg-action-fill/90">Set outcome</SubmitButton>
                </form>
              </div>
            )}
          </Card>
        ) : (
          <Card accent="service">
            <p className="text-xs font-semibold text-ink-3 uppercase tracking-wide mb-1">Pipeline</p>
            {/* Two different situations were reading as one message. "No pipeline
                configured" is true when none is DEFINED for this council; it was
                also what a PRC matter said when the pipeline existed and the
                matter simply had no stage to select it with — a fixable thing
                reported as an unbuilt one. Say which. */}
            {(svc?.code ?? "").toUpperCase() === "PRC" &&
            !(matter as { service_subtype?: string | null }).service_subtype ? (
              <p className="text-sm text-ink-3">
                Choose a rates clearance stage above — an RCA, an RCF and an RCC each run their own
                pipeline, so there is nothing to show until this matter says which it is.
              </p>
            ) : (
              // Since the generic four-step fallback exists, this branch is
              // reached only by a matter with NO SERVICE at all — there is
              // nothing to run a process for, not even a default one.
              <p className="text-sm text-ink-3">
                This matter has no service set, so it has no process to run. Set one on Edit and a
                pipeline appears — the general four-step one, if this council and service have no
                mapped process of their own.
              </p>
            )}
          </Card>
        )}
        {/* ── Council portal details ───────────────────────────────────────────
            One panel per party this council asks extra fields of — today the
            BUYER on a City of Tshwane RCA, which is the eTshwane "Purchaser
            details" screen from the handwritten notes (080 / §5.12).

            Sits above the intake because it is read while filling the council's
            portal, and the intake below is about files rather than fields.
            Renders nothing anywhere else: councilPartyFieldKeys returns an empty
            list when the council asks nothing extra. */}
        {ficaSubjects.map((subj) => {
          const keys = councilPartyFieldKeys(
            matter.municipality,
            svc?.code ?? null,
            (matter as { service_subtype?: string | null }).service_subtype ?? null,
            subj.partyRole ?? null
          );
          if (keys.length === 0) return null;
          return (
            <CouncilPortalDetails
              key={subj.partyId ?? "matter-client"}
              label={subj.label}
              client={subj.client}
              municipality={matter.municipality}
              requiredKeys={keys}
              partyEntity={subj.partyEntity ?? null}
            />
          );
        })}

        {/* ── Documents ────────────────────────────────────────────────────────
            Zewn, 2026-09-01: "make the document uploads section match the
            architecture of the prop trf document uploads. so it must have input,
            functional and output documents. also all matters should be able to
            derive documents from the parent prop trf. make sure that is contained
            in the same box as the document uploads box."

            WAS: two groups, "Client / business-partner uploads" and "ConveyClear
            uploads" — a split by WHO SENT IT, which is not a question anyone asks
            of a file. The transfer page had already moved to the three classes
            (076) and the matter had not, so the same deed search was filed one
            way on the transfer and another on the matter.

            The three classes are input · supporting · output (§11.20, the
            established vocabulary — "functional" in Zewn's note is this middle
            one). Unlike transfer_documents, matter documents carry NO stored
            class, so it is resolved here from the council registry for this
            (council, service, stage). A document type the registry does not name
            falls to "Other documents" rather than being guessed into a class.

            One box, and the transfer's documents are in it: a matter under a
            transfer can pull the deed search that was obtained once for the
            property, instead of it being uploaded again per matter (034). */}
        <Card padding="none">
          <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
            <h2 className="font-semibold text-ink flex items-center gap-2"><FileText className="h-4 w-4 text-sky-700" /> Documents ({documents.length})</h2>
            <div className="flex flex-wrap items-center gap-3">
              {documents.length > 0 && <CouncilPackButton matterId={id} />}
            </div>
          </div>

          <div className="space-y-5 px-5 py-4">
            {DOC_CLASSES.map((cls) => (
              <div key={cls}>
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">
                  {DOC_CLASS_LABELS[cls]} ({docsByClass[cls].length})
                </p>
                <p className="mt-0.5 text-xs text-ink-3">{DOC_CLASS_HINTS[cls]}</p>

                {/* The capture checklist lives HERE, inside Input documents,
                    rather than in a card of its own. Zewn to Jukka, 2026-09-01:
                    "these capture docs needs to move into input docs … we'll
                    remove this box because we don't need it." What a service
                    requires and what has been filed against it are one subject;
                    two boxes listed the same file twice. */}
                {cls === "input" && (
                  <div className="mt-3">
                    <InPlaceIntake
                      bare
                      matterId={id}
                      serviceCode={svc?.code ?? null}
                      serviceSubtype={(matter as { service_subtype?: string | null }).service_subtype ?? null}
                      parties={parties}
                      documents={documents}
                      municipality={matter.municipality}
                      unavailable={Array.isArray(sd.docs_unavailable) ? (sd.docs_unavailable as string[]) : []}
                      canManage
                      vaultByClient={vaultByClient}
                      matterClientId={matterClientId}
                      transferDocs={transferDocs}
                    />
                  </div>
                )}
                {docsByClass[cls].length > 0 ? (
                  <ul className="mt-2 divide-y divide-line rounded-lg border border-line">
                    {docsByClass[cls].map(docRow)}
                  </ul>
                ) : (
                  <p className="mt-2 rounded-lg border border-dashed border-line px-3 py-3 text-sm text-ink-3">None yet</p>
                )}
              </div>
            ))}

            {/* Anything the council registry does not name — including every
                document uploaded before the classes existed. Its own heading
                rather than a silent home in "supporting": guessing where an
                existing file belongs is wrong in a way nobody would see. */}
            {docsByClass.other.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">
                  Other documents ({docsByClass.other.length})
                </p>
                <p className="mt-0.5 text-xs text-ink-3">
                  Not named in {municipalityLabel(matter.municipality)}&apos;s requirements for this service, or filed
                  before documents were split into classes.
                </p>
                <ul className="mt-2 divide-y divide-line rounded-lg border border-line">
                  {docsByClass.other.map(docRow)}
                </ul>
              </div>
            )}

            {/* 🔴 THE SAME THREE QUESTIONS AS THE TRANSFER PANEL. This was a bare
                button that filed every hand-uploaded document as `other`,
                unnamed by the uploader and attached to no party — which is a
                large part of why "Other documents" above is not only historic.
                The class is resolved from (council, type, party role), so a type
                nobody picks and a party nobody names can only ever land in the
                fallback.

                Staff get it as well as the firm (§5.13): one upload behaviour,
                or the two matter pages file the same document two ways again,
                which is the drift this card was rebuilt to end. */}
            <div className="border-t border-line pt-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-3">
                Add a document
              </p>
              <MatterUploadPanel
                matterId={id}
                parties={uploadParties}
                municipality={matter.municipality}
                propertyDescription={
                  (matter as unknown as { property_description?: string | null })
                    .property_description ?? null
                }
              />
            </div>

          </div>
        </Card>

        {/* Council POC(s) — internal, staff-only directory link (B5 / Theme G).
            LEFT column from 2026-09-01: a council contact is something staff act
            on while working the matter, not reference detail. Zewn: "move
            council POC to the left". */}
        <MatterPocsCard matterId={id} linked={linkedPocs} all={allPocs} />
        </div>

        <div className="min-w-0 space-y-6">
        {/* Parent property transfer — the transaction this matter belongs to. */}
        <MatterTransferCard
          matterId={id}
          transfer={matter.property_transfers ?? null}
          options={transferOptions}
          manage
          basePath="/admin/property-transfers"
        />
        {/* Matter facts */}
        <Card accent="service">
          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
            <div>
              <dt className="text-xs text-ink-3">Status</dt>
              <dd className="text-ink mt-0.5">{matter.status ? MATTER_STATUS_LABELS[matter.status as MatterStatus] : "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-3">Priority</dt>
              <dd className="text-ink mt-0.5">{matter.priority ? PRIORITY_LABELS[matter.priority as MatterPriority] : "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-3">Estimated closing time</dt>
              <dd className="text-ink mt-0.5">{matter.deadline ? formatDate(matter.deadline) : "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-3">Opened</dt>
              <dd className="text-ink mt-0.5">{formatDate(matter.created_at)}</dd>
            </div>
            {(matter as { service_subtype?: string | null }).service_subtype && (
              <div>
                <dt className="text-xs text-ink-3">Clearance type</dt>
                <dd className="text-ink mt-0.5">{(matter as { service_subtype?: string | null }).service_subtype}</dd>
              </div>
            )}
            {/* Service-specific referral fields (PRC account no / utilities / query ref) merged in. */}
            {Object.entries(((matter as { service_data?: Record<string, unknown> | null }).service_data ?? {}))
              .filter(([k, v]) => v && !["stage_outcome", "stage_reason"].includes(k))
              .map(([k, v]) => (
                <div key={k}>
                  <dt className="text-xs text-ink-3 capitalize">{k.replace(/_/g, " ")}</dt>
                  <dd className="text-ink mt-0.5">{String(v)}</dd>
                </div>
              ))}
            {matter.service_notes && (
              <div className="col-span-2 sm:col-span-3">
                <dt className="text-xs text-ink-3">Service Notes</dt>
                <dd className="text-ink mt-0.5">{matter.service_notes}</dd>
              </div>
            )}
          </dl>

          {/* Status control (H1) — partner/client referrals arrive as "New"; staff
              review then set Open (or Won/Lost/etc.). Won triggers the celebration. */}
          <form action={setMatterStatus} className="mt-4 pt-4 border-t border-line flex flex-wrap items-center gap-2">
            <input type="hidden" name="matter_id" value={id} />
            <input type="hidden" name="author_id" value={authorId ?? ""} />
            <label className="text-xs font-medium text-ink-3">Status</label>
            <select
              name="status"
              defaultValue={matter.status ?? "new"}
              className="bg-surface text-ink rounded-lg border border-line px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B2E6B]"
            >
              {(Object.keys(MATTER_STATUS_LABELS) as MatterStatus[]).map((s) => (
                <option key={s} value={s}>{MATTER_STATUS_LABELS[s]}</option>
              ))}
            </select>
            <SubmitButton pendingLabel="Updating…" className="px-3 py-1.5 text-sm font-medium bg-action-fill text-white rounded-lg hover:bg-action-fill/90">
              Update status
            </SubmitButton>
            {matter.status === "new" && (
              <span className="text-xs font-medium text-amber-600">Awaiting review — set to Open once reviewed</span>
            )}
          </form>
        </Card>
        {/* Council rates account number — the council's primary key for a
            clearance matter (proof / application / certificate reference it). */}
        <Card accent="service">
          <form action={setRatesAccount} className="flex items-end gap-2">
            <input type="hidden" name="matter_id" value={id} />
            <label className="flex-1 text-xs font-medium text-ink-3">
              Rates account number
              <input
                type="text"
                name="rates_account_no"
                defaultValue={typeof sd.rates_account_no === "string" ? sd.rates_account_no : ""}
                placeholder="Council rates account no."
                className="bg-surface text-ink mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B2E6B]"
              />
            </label>
            <SubmitButton pendingLabel="Saving…" className="px-3 py-2 text-sm font-medium bg-action-fill text-white rounded-lg hover:bg-action-fill/90">Save</SubmitButton>
          </form>
        </Card>
        {/* ConveyClear internal — staff-only container (note 2026-06-22). */}
        <Card accent="internal" className="bg-action-fill/5">
          <div className="flex items-center gap-1.5 mb-3">
            <Lock className="h-3.5 w-3.5 text-action" />
            <h2 className="text-xs font-semibold uppercase tracking-wide text-action">ConveyClear internal</h2>
          </div>
          <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
            {firm?.name && (
              <div>
                <dt className="text-xs text-ink-3">Referring firm</dt>
                <dd className="text-ink mt-0.5">{firm.name}{firm.abbreviation ? ` (${firm.abbreviation})` : ""}</dd>
              </div>
            )}
            {matter.partner_file_ref && (
              <div>
                <dt className="text-xs text-ink-3">Internal file ref</dt>
                <dd className="text-ink mt-0.5">{matter.partner_file_ref}</dd>
              </div>
            )}
            {matter.deal_value && (
              <div>
                <dt className="text-xs text-ink-3">Deal value</dt>
                <dd className="text-ink mt-0.5">R {matter.deal_value.toLocaleString("en-ZA")}</dd>
              </div>
            )}
            {!firm?.name && !matter.partner_file_ref && !matter.deal_value && (
              <p className="text-sm text-ink-3 col-span-3">No internal details captured yet.</p>
            )}
          </dl>
        </Card>
        {/* Conversation + Activity, in the property-transfer page's shape.
            Zewn, 2026-09-01: "remove the matter enquiries and copy the prop trfs
            chat and activity feed section to matters."

            Replaces two stacked sections — the MatterEnquiries ticket list and the
            Internal Activity Feed. The tabs read DIFFERENT tables on purpose: the
            conversation is the shared enquiry thread (client + firm + us), the
            activity is staff-only. See the note in MatterFeed for why the smaller
            version of this change would have sent messages nobody could read. */}
        <MatterFeed
          matterId={id}
          threads={enquiryThreads}
          activities={activities}
          audience="staff"
          firmName={firm?.name ?? null}
        />
        </div>
      </div>

      {/* Celebration when the matter is won/closed (H2) */}
      <Celebrate active={matter.status === "won"} matterId={matter.id} />
    </div>
  );
}
