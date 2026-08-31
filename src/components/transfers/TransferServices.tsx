"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import toast from "react-hot-toast";
import StatusPill, { type StatusTone } from "@/components/ui/StatusPill";
import PhaseProgress from "@/components/ui/PhaseProgress";
import ServiceSteps from "@/components/ui/ServiceSteps";
import type { ServiceProgress } from "@/lib/transfer-service-progress";
import { PRC_SUBTYPES, prcStageLabel } from "@/lib/prc-docs";
import {
  councilAsksRatesScope,
  RATES_SCOPES,
  RATES_SCOPE_LABELS,
  type RatesScope,
} from "@/lib/councils";
import { ChevronRight, ChevronDown, Plus, Trash2, ListChecks } from "lucide-react";

/**
 * The property transfer as an umbrella over its services.
 *
 * Meeting 2026-08-24 §114: "line items with expandable arrows to reveal related
 * sub-services". §122: each carries a marker — not applicable / already done /
 * needs to be done — which staff set, and which drives what ConveyClear does.
 *
 * 🔴 The prerequisite rule is DISPLAYED, never enforced. §114 records that EBP,
 * Certificates, MAD and PRC must clear before Change of Ownership — but whether
 * the portal should BLOCK that ordering was never said out loud in the meeting,
 * and the notes say to ask before building a hard gate. So Change of Ownership
 * shows what is still outstanding above it and stops there. Nothing here
 * prevents anyone doing anything.
 */

// Keys are `services.code`. 072 renamed four of them to the vocabulary the
// councils actually use (BP→EBP, CERT→COC, RCF→PRC, REFUND→REF); both sides of
// the checklist/services convention moved together in that one migration,
// because 066 is the record of what happens when they drift apart.
export const SERVICE_LABELS: Record<string, string> = {
  EBP: "Existing Building Plans",
  COC: "Certificates",
  MAD: "Municipal Account Dispute",
  PRC: "Property Rates Clearance",
  COO: "Change of Ownership",
  REF: "Refund",
  OTHER: "Other",
};

/**
 * The default line items, in the canonical order — mirrors
 * instantiate_transfer_services (072).
 *
 * Zewn, 2026-08-31, on the three council sheets: the order is the SAME for
 * every council. The numbering on each sheet is the order that discussion
 * happened in, not data.
 */
export const DEFAULT_SERVICE_CODES = ["EBP", "COC", "MAD", "PRC", "COO", "REF", "OTHER"] as const;

/** §114 — these must be complete before Change of Ownership proceeds. */
const COO_PREREQUISITES = ["EBP", "COC", "MAD", "PRC"] as const;

/** The sub-services named in the meeting. Suggestions, not a closed list. */
const SUGGESTED: Record<string, string[]> = {
  // §118
  EBP: ["Occupational certificate", "Sectional scheme plans", "Site development plan", "Floor plans"],
  // §120
  COC: ["Electrical", "Building standards", "Environmental", "Gas"],
};

const STATUS_LABEL: Record<string, string> = {
  // 064. "Not specified" is the starting state: before the firm or the client
  // has told us, the portal must not assert that a service is needed.
  not_specified: "Not specified",
  needed: "Needs to be done",
  // 069. "Completed" is OURS; "already done" is somebody else's, before or
  // outside us. Merging them would destroy the only record of what the firm
  // actually delivered — which is exactly what staff were forced to do while
  // there was nowhere else for a finished service to go.
  completed: "Completed",
  already_done: "Already done",
  not_applicable: "Not applicable",
};

/** Read in the order a service moves through them, not alphabetically. */
const STATUS_ORDER = ["not_specified", "needed", "completed", "already_done", "not_applicable"];

/**
 * What the attorney firm may choose (071). Zewn, 2026-08-28: *"their only
 * options for the dropdown should be 'Needs to be done' 'already Done' 'not
 * applicable'"*.
 *
 * `completed` is absent on purpose — 069 made it mean "WE finished it", so a
 * firm setting it would claim ConveyClear delivered the work. `not_specified`
 * is absent because it is the absence of a mark rather than a choice: a firm
 * can mark, but cannot un-mark.
 *
 * ⚠️ Cosmetic only. The real enforcement is 071's trigger, which refuses any
 * other value however the row is reached — this list just avoids offering a
 * firm something it would be refused for picking.
 */
const PARTNER_STATUS_ORDER = ["needed", "already_done", "not_applicable"];

// Zewn, 2026-08-26: needs-to-be-done blue, already-done green, not-applicable
// amber. The tones are named by MEANING rather than colour, so "action" is the
// blue one and "waiting" the amber — see components/ui/StatusPill.tsx, where the
// fills are contrast-measured against white text.
const STATUS_TONE: Record<string, StatusTone> = {
  not_specified: "neutral",
  needed: "action",
  // Both finished states are green — to anyone reading the list, "done" is
  // "done", and the distinction between who did it belongs in the label rather
  // than in a colour nobody would decode.
  completed: "ok",
  already_done: "ok",
  not_applicable: "waiting",
};

/**
 * The staff status <select>, dressed as a StatusPill.
 *
 * Kept beside STATUS_TONE deliberately: these fills MUST track
 * components/ui/StatusPill.tsx, whose label colours are contrast-measured
 * against white rather than chosen (see the note in that file — re-measure
 * before changing any fill). If a tone moves there, move it here too.
 */
const SELECT_TONE: Record<string, string> = {
  not_specified: "bg-raised text-ink-2 ring-1 ring-inset ring-line",
  needed: "bg-action-fill text-white",
  completed: "bg-ok-fill text-white",
  already_done: "bg-ok-fill text-white",
  not_applicable: "bg-waiting-fill text-white",
};

const statusSelectClass = (status: string) =>
  "appearance-none cursor-pointer rounded-full font-semibold tracking-[0.01em] " +
  "transition-opacity hover:opacity-90 disabled:opacity-50 " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-1 " +
  "focus-visible:ring-offset-surface " +
  (SELECT_TONE[status] ?? SELECT_TONE.not_specified);

/**
 * Sits over the select's right edge. It is a SIBLING of the select, not a child,
 * so it cannot inherit the select's text colour — hence the explicit per-status
 * colour. White on the filled tones, ink on the neutral one, matching the label
 * it sits beside.
 */
const chevronClass = (status: string) =>
  "pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 opacity-70 " +
  (status === "not_specified" ? "text-ink-2" : "text-white");

export interface ServiceRow {
  id: string;
  parent_id: string | null;
  service_code: string | null;
  label: string | null;
  status: string;
  third_party: string | null;
  notes: string | null;
  matter_id: string | null;
  position: number;
  /** 072 — which rates-clearance stage a PRC line is. Null until chosen. */
  prc_subtype?: string | null;
  /** 075 — rates only, utilities only, or both. Null where unasked. */
  rates_scope?: string | null;
  /** Derived server-side by lib/transfer-service-progress.ts. */
  progress?: ServiceProgress;
  matterTitle?: string | null;
}

export default function TransferServices({
  transferId,
  rows,
  canManage = false,
  canMark = false,
  matterHrefBase = "/admin/matters",
  municipality = null,
}: {
  transferId: string;
  rows: ServiceRow[];
  /**
   * Staff. The full marker vocabulary plus everything else on a line —
   * third party, notes, the matter link, adding and removing sub-services.
   */
  canManage?: boolean;
  /**
   * The attorney firm may set the marker, and nothing else (071).
   *
   * §122 had these set by ConveyClear alone, and all three layers agreed until
   * Zewn reversed it on 2026-08-28: *"we need to give the arttorneys the
   * ability to mark which services they need"*. The firm gets a narrower
   * vocabulary than staff — see PARTNER_STATUS_ORDER.
   *
   * Ignored when `canManage` is true; staff already have the wider control.
   */
  canMark?: boolean;
  /**
   * Where "Open matter" points, or `null` for an audience that has no matter
   * surface at all. Clients pass null (2026-08-27: matters are not theirs to
   * see); the link would only lead somewhere they cannot go.
   */
  matterHrefBase?: string | null;
  /**
   * The transfer's council. Decides whether the rates-vs-utilities choice is
   * shown at all — COT asks it, CoE does not (§11.17), and which councils ask
   * is config in lib/councils rather than a conditional here.
   */
  municipality?: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  // Staff get the full vocabulary, the firm a narrowed one, everyone else a
  // read-only pill. Kept as two derived values so the three call sites below
  // cannot drift apart.
  const mayPickStatus = canManage || canMark;
  const statusOptions = canManage ? STATUS_ORDER : PARTNER_STATUS_ORDER;

  /**
   * The options for one row, given what it currently holds.
   *
   * A <select> whose `value` is not among its <option>s does not show that
   * value — it renders blank, or silently displays the first option instead.
   * The firm's list is narrower than the vocabulary, so two ordinary states fall
   * straight into that hole:
   *
   *   · `not_specified` — what EVERY line holds at creation (064's default).
   *     Zewn, 2026-08-28: "have all the services marked as not specified upon
   *     creation and then the attorney can choose one of the other options from
   *     there". Without this the attorney opens a brand-new transfer and every
   *     service appears to be already marked "Needs to be done".
   *   · `completed`     — which only staff can set, but the firm can SEE.
   *
   * So the current value is always present, and is disabled when it is not one
   * the firm may choose: the row tells the truth about where it stands, and the
   * three real choices sit under it. Disabling also matches the database —
   * 071's trigger refuses `not_specified` and `completed` from a partner, so
   * offering either as a target would be a control that fails on use.
   */
  const optionsFor = (status: string) =>
    statusOptions.includes(status) ? statusOptions : [status, ...statusOptions];

  const top = rows.filter((r) => !r.parent_id).sort((a, b) => a.position - b.position);
  const childrenOf = (id: string) => rows.filter((r) => r.parent_id === id);

  // Outstanding prerequisites, for the advisory note on Change of Ownership.
  const outstanding = top
    .filter((r) => COO_PREREQUISITES.includes(r.service_code as never) && r.status === "needed")
    .map((r) => SERVICE_LABELS[r.service_code ?? ""] ?? r.service_code);

  async function call(init: RequestInit & { url: string }, key: string) {
    setBusy(key);
    try {
      const { url, ...rest } = init;
      const res = await fetch(url, rest);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error ?? "That did not work.");
        return false;
      }
      router.refresh();
      return true;
    } finally {
      setBusy(null);
    }
  }

  async function setStatus(id: string, status: string) {
    const ok = await call(
      {
        url: "/api/transfer-services",
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      },
      id
    );
    if (ok) toast.success(STATUS_LABEL[status]);
  }

  /**
   * Set the rates-clearance stage, or the rates scope, on a PRC line.
   *
   * Staff only, and refused three ways over: this component hides the control,
   * the route rejects a non-staff caller, and 071's guard — extended by 072 and
   * 075 — refuses the column change in the database however it is reached.
   *
   * ▶ Whether the ATTORNEY should choose the stage is still open. Zewn (§5.9):
   *   "they must select one of the 3 when prc is selected", and "they" is
   *   ambiguous between staff and the firm. Answered conservatively for now,
   *   because being wrong the other way widens what a firm may write.
   */
  async function setPrcField(
    id: string,
    field: "prcSubtype" | "ratesScope",
    value: string
  ) {
    const ok = await call(
      {
        url: "/api/transfer-services",
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, [field]: value || null }),
      },
      id
    );
    if (ok) {
      toast.success(
        field === "prcSubtype"
          ? value
            ? `Rates clearance stage: ${value}`
            : "Stage cleared"
          : "Scope updated"
      );
    }
  }

  async function addSub(parentId: string, label: string) {
    const name = label.trim();
    if (!name) return toast.error("Give the sub-service a name.");
    const ok = await call(
      {
        url: "/api/transfer-services",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transferId, parentId, label: name }),
      },
      parentId
    );
    if (ok) {
      toast.success("Added.");
      setDraft("");
      setAddingTo(null);
      setOpen((s) => new Set(s).add(parentId));
    }
  }

  // Nothing instantiated yet.
  //
  // For STAFF: offer to create it, rather than auto-creating on render — a GET
  // that writes is a trap, and not every transfer wants the full list.
  //
  // For everyone else (Zewn, 2026-08-26): show the seven services as
  // "Not specified" instead. A firm cannot create the list, so telling them one
  // does not exist is a dead end — it explains an absence they have no way to
  // resolve. Showing the standard shape answers the question they actually have,
  // which is "what does this transaction involve", and claims nothing about any
  // of them until ConveyClear sets a marker.
  if (!top.length && !canManage) {
    return (
      <ul className="divide-y divide-line">
        {DEFAULT_SERVICE_CODES.map((code) => (
          <li key={code} className="flex items-center gap-3 px-5 py-3.5">
            <span className="flex-1 truncate text-[15px] font-medium text-ink">
              {SERVICE_LABELS[code]}
            </span>
            <StatusPill tone="neutral">{STATUS_LABEL.not_specified}</StatusPill>
          </li>
        ))}
      </ul>
    );
  }

  if (!top.length) {
    return (
      <div className="px-5 py-10 text-center">
        <ListChecks className="mx-auto h-8 w-8 text-ink-3" />
        <p className="mt-3 font-medium text-ink">No service list yet</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-ink-3">
          A transfer is an umbrella over six services. Create the standard list and mark each one as
          needed, already done, or not applicable.
        </p>
        {canManage && (
          <button
            disabled={busy === "init"}
            onClick={async () => {
              const ok = await call(
                {
                  url: "/api/transfer-services",
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ transferId }),
                },
                "init"
              );
              if (ok) toast.success("Service list created.");
            }}
            className="mt-4 inline-flex items-center gap-2 rounded bg-action-fill px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" /> Create the service list
          </button>
        )}
      </div>
    );
  }

  return (
    <ul className="divide-y divide-line">
      {top.map((r) => {
        const code = r.service_code ?? "";
        const kids = childrenOf(r.id);
        const isOpen = open.has(r.id);
        const suggestions = (SUGGESTED[code] ?? []).filter(
          (s) => !kids.some((k) => k.label?.toLowerCase() === s.toLowerCase())
        );
        const isCoo = code === "COO";

        return (
          <li key={r.id} className="px-5 py-3.5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              {/* The disclosure is the whole left cluster, not a 12px chevron —
                  a target you have to aim at is a target you misclick. */}
              <button
                onClick={() =>
                  setOpen((s) => {
                    const n = new Set(s);
                    n.has(r.id) ? n.delete(r.id) : n.add(r.id);
                    return n;
                  })
                }
                aria-expanded={isOpen}
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
              >
                <ChevronRight
                  className={`h-4 w-4 shrink-0 text-ink-3 transition-transform duration-150 ${
                    isOpen ? "rotate-90" : ""
                  }`}
                />
                <span className="truncate text-[15px] font-medium text-ink">
                  {SERVICE_LABELS[code] ?? code}
                </span>
                {kids.length > 0 && (
                  <span className="shrink-0 text-xs tabular-nums text-ink-3">{kids.length}</span>
                )}
              </button>

              {/* The link needs BOTH: an audience that has a matter surface,
                  and a matter this viewer can actually read. `matterTitle` is
                  set from the RLS-filtered embed, so a null one means the row
                  points at a matter that is not ours — rendering the link then
                  produced a 404, found as the buyer 2026-08-27. Never
                  dead-end (PRODUCT.md §5). */}
              {r.matter_id && matterHrefBase && r.matterTitle ? (
                <Link
                  href={`${matterHrefBase}/${r.matter_id}`}
                  className="shrink-0 text-xs font-medium text-action hover:underline"
                >
                  Open matter
                </Link>
              ) : (
                canManage &&
                r.status === "needed" &&
                code !== "OTHER" && (
                  // Explicit, not automatic — see the note above the component.
                  <Link
                    href={`/admin/matters/new?transfer=${transferId}&service=${code}`}
                    className="shrink-0 text-xs font-medium text-action hover:underline"
                  >
                    Open as matter
                  </Link>
                )
              )}

              {mayPickStatus ? (
                // A native select, WEARING THE PILL. Zewn, 2026-08-27, looking
                // at the client's read-only view: "i really like this view of
                // the transfer services, please use this in partner and ccmember
                // aswell".
                //
                // Partner already had it — all three portals share this
                // component and only `canManage` differed. Admin is the one
                // surface that cannot simply adopt the pill, because staff are
                // the ones who SET the marker (§122); the dropdown is the
                // feature, not an oversight.
                //
                // So the control keeps its behaviour and borrows the pill's
                // appearance: same fill, radius, weight and size as
                // StatusPill's tones, so a staff member reads the same shape a
                // client does and can still change it in one click. No
                // click-to-reveal — this is the surface where changes actually
                // happen, and an extra click on every change is a poor trade
                // for a moment of calm.
                //
                // `appearance-none` drops the native arrow; `pr-7` plus the
                // chevron below keeps it obviously a control rather than a
                // label that mysteriously responds to clicks.
                <span className="relative shrink-0">
                  <select
                    value={r.status}
                    disabled={busy === r.id}
                    onChange={(e) => setStatus(r.id, e.target.value)}
                    aria-label="Service status"
                    className={`${statusSelectClass(r.status)} py-1 pl-3 pr-7 text-[12px]`}
                  >
                    {optionsFor(r.status).map((v) => (
                      <option
                        key={v}
                        value={v}
                        disabled={!statusOptions.includes(v)}
                        className="bg-surface font-medium text-ink"
                      >
                        {STATUS_LABEL[v]}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className={chevronClass(r.status)} aria-hidden />
                </span>
              ) : (
                <StatusPill tone={STATUS_TONE[r.status] ?? "neutral"}>
                  {STATUS_LABEL[r.status] ?? r.status}
                </StatusPill>
              )}
            </div>

            {/* §114, shown and not enforced. Deliberately advisory wording: it
                reports the municipal reality, it does not claim the portal is
                stopping anyone. */}
            {isCoo && outstanding.length > 0 && (
              <p className="mt-2 pl-6 text-xs text-ink-3">
                Municipal sequence: {outstanding.join(", ")} normally clear{" "}
                {outstanding.length === 1 ? "s" : ""} before change of ownership.
              </p>
            )}

            {r.third_party && (
              <p className="mt-1 pl-6 text-xs text-ink-3">Rendered by {r.third_party}</p>
            )}

            {/* PRC splits three ways (§5.9). The stage is not decoration: a
                pipeline is resolved by (service, council, stage), so a PRC line
                with no stage draws no phases at all — which is exactly the bug
                found on 08-27, where a seeded RCF with a NULL subtype showed no
                circles. Forcing the choice here is the fix for that whole class,
                rather than patching the data again. */}
            {code === "PRC" && !r.parent_id && (
              <div className="mt-2 pl-6 space-y-2">
                {canManage ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="text-xs text-ink-3" htmlFor={`stage-${r.id}`}>
                      Stage
                    </label>
                    <select
                      id={`stage-${r.id}`}
                      value={r.prc_subtype ?? ""}
                      disabled={busy === r.id}
                      onChange={(e) => setPrcField(r.id, "prcSubtype", e.target.value)}
                      className="rounded border border-line bg-surface px-2 py-1 text-xs text-ink"
                    >
                      <option value="">— Not chosen —</option>
                      {PRC_SUBTYPES.map((st) => (
                        <option key={st.code} value={st.code}>
                          {st.label}
                        </option>
                      ))}
                    </select>

                    {councilAsksRatesScope(municipality) && (
                      <>
                        <label className="text-xs text-ink-3" htmlFor={`scope-${r.id}`}>
                          Covers
                        </label>
                        <select
                          id={`scope-${r.id}`}
                          value={r.rates_scope ?? ""}
                          disabled={busy === r.id}
                          onChange={(e) => setPrcField(r.id, "ratesScope", e.target.value)}
                          className="rounded border border-line bg-surface px-2 py-1 text-xs text-ink"
                        >
                          <option value="">— Not chosen —</option>
                          {RATES_SCOPES.map((sc) => (
                            <option key={sc} value={sc}>
                              {RATES_SCOPE_LABELS[sc]}
                            </option>
                          ))}
                        </select>
                      </>
                    )}
                  </div>
                ) : (
                  r.prc_subtype && (
                    <p className="text-xs text-ink-3">
                      {prcStageLabel(r.prc_subtype)}
                      {r.rates_scope
                        ? ` · ${RATES_SCOPE_LABELS[r.rates_scope as RatesScope] ?? r.rates_scope}`
                        : ""}
                    </p>
                  )
                )}

                {/* Says what is missing and why it matters, rather than simply
                    looking empty. PRODUCT.md principle 5. */}
                {!r.prc_subtype && r.status === "needed" && (
                  <p className="text-xs text-required">
                    Rates clearance needs a stage — an application, figures or a
                    certificate. Until one is chosen this line has no pipeline.
                  </p>
                )}
              </div>
            )}

            {/* §110 — progress per service, for staff, attorneys and clients
                alike. It is the linked MATTER's progress; a service line has no
                percentage of its own. */}
            {r.progress && r.progress.state !== "none" && (
              <div className="mt-2 pl-6">
                {r.progress.total > 0 ? (
                  <div className="space-y-2">
                    {/* Circles above the bar (Zewn, 2026-08-27). They answer
                        different questions: the circles name the phases this
                        service actually has, the bar says how far through them
                        we are. Neither substitutes for the other on a process
                        where the shape is as unfamiliar as the position. */}
                    <ServiceSteps
                      steps={r.progress.steps}
                      phase={r.progress.phase}
                      done={r.progress.state === "complete"}
                    />
                    <PhaseProgress
                      phase={r.progress.phase}
                      total={r.progress.total}
                      label={r.progress.label}
                      done={r.progress.state === "complete"}
                    />
                  </div>
                ) : (
                  <p
                    className={`text-xs ${
                      r.progress.state === "complete" || r.progress.state === "declared"
                        ? "text-ok"
                        : "text-ink-3"
                    }`}
                  >
                    {r.progress.label}
                  </p>
                )}
              </div>
            )}

            {isOpen && (
              <div className="mt-2.5 space-y-1.5 pl-6">
                {kids.map((k) => (
                  <div key={k.id} className="flex items-center gap-3">
                    <span className="flex-1 truncate text-sm text-ink-2">{k.label}</span>
                    {mayPickStatus ? (
                      <>
                        <span className="relative shrink-0">
                          <select
                            value={k.status}
                            disabled={busy === k.id}
                            onChange={(e) => setStatus(k.id, e.target.value)}
                            aria-label="Sub-service status"
                            className={`${statusSelectClass(k.status)} py-0.5 pl-2.5 pr-6 text-[11px]`}
                          >
                            {optionsFor(k.status).map((v) => (
                              <option
                                key={v}
                                value={v}
                                disabled={!statusOptions.includes(v)}
                                className="bg-surface font-medium text-ink"
                              >
                                {STATUS_LABEL[v]}
                              </option>
                            ))}
                          </select>
                          <ChevronDown className={chevronClass(k.status)} aria-hidden />
                        </span>
                        <button
                          title="Remove"
                          disabled={busy === k.id}
                          onClick={async () => {
                            const ok = await call(
                              { url: `/api/transfer-services?id=${k.id}`, method: "DELETE" },
                              k.id
                            );
                            if (ok) toast.success("Removed.");
                          }}
                          className="rounded p-1 text-ink-3 transition-colors hover:bg-danger-tint hover:text-danger disabled:opacity-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </>
                    ) : (
                      <StatusPill tone={STATUS_TONE[k.status] ?? "neutral"}>
                        {STATUS_LABEL[k.status] ?? k.status}
                      </StatusPill>
                    )}
                  </div>
                ))}

                {!kids.length && !canManage && (
                  <p className="text-xs text-ink-3">Nothing listed under this service yet.</p>
                )}

                {canManage &&
                  (addingTo === r.id ? (
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <input
                        autoFocus
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") addSub(r.id, draft);
                          if (e.key === "Escape") {
                            setAddingTo(null);
                            setDraft("");
                          }
                        }}
                        placeholder="Sub-service name"
                        className="min-w-0 flex-1 rounded border border-line bg-surface px-2 py-1 text-sm text-ink"
                      />
                      <button
                        disabled={busy === r.id}
                        onClick={() => addSub(r.id, draft)}
                        className="rounded bg-action-fill px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-50"
                      >
                        Add
                      </button>
                      <button
                        onClick={() => {
                          setAddingTo(null);
                          setDraft("");
                        }}
                        className="text-xs text-ink-3 hover:text-ink"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <button
                        onClick={() => setAddingTo(r.id)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-action hover:underline"
                      >
                        <Plus className="h-3.5 w-3.5" /> Add sub-service
                      </button>
                      {/* The meeting named these. One click beats retyping
                          "Occupational certificate" on every transfer. */}
                      {suggestions.map((s) => (
                        <button
                          key={s}
                          disabled={busy === r.id}
                          onClick={() => addSub(r.id, s)}
                          className="rounded-full border border-line px-2 py-0.5 text-xs text-ink-3 transition-colors hover:border-action hover:text-action disabled:opacity-50"
                        >
                          + {s}
                        </button>
                      ))}
                    </div>
                  ))}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
