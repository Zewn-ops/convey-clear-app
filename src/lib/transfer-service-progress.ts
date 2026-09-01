import { getPipeline, phaseOrder, phaseSteps, phaseLabel } from "@/lib/pipelines";
import { serviceLabel } from "@/lib/councils/types";

/**
 * Progress for one line on a transfer's service checklist.
 *
 * Meeting 2026-08-24 §110: progress bars per service, visible to attorneys and
 * clients.
 *
 * 🔴 THE PROGRESS IS THE MATTER'S. A service line does not track its own
 * percentage. It links to the matter that realises it, and that matter already
 * owns phases, a pipeline and a status. Giving the line item its own progress
 * field would create two answers to "how far along is this" that drift apart the
 * first time someone advances one and not the other — and the matter is the one
 * staff actually work in, so it would be the checklist that goes stale.
 *
 * Derived on the SERVER and passed down as plain data, so the pipeline
 * definitions stay out of the client bundle.
 */

export type ProgressState =
  | "none"        // not_specified / not_applicable — nothing to show
  | "declared"    // already_done — someone did it, not through us
  | "unstarted"   // needed, but no matter opened yet
  | "hidden"      // a matter IS open, this viewer may not see it
  | "running"     // matter open, somewhere in its pipeline
  | "complete";   // matter won or archived

export interface ServiceProgress {
  state: ProgressState;
  /** 1-indexed phase, only when running or complete. */
  phase: number;
  total: number;
  label: string;
  /**
   * The phase names in order, for the stepper above the bar.
   *
   * Sent as plain strings rather than the Pipeline itself, for the same reason
   * the rest of this is derived here: the pipeline definitions must not reach
   * the client bundle. Empty whenever `total` is 0 — a service with no pipeline
   * yet has no steps to name, and the caller already falls back to a plain label
   * in that case.
   */
  steps: string[];
}

/** The linked matter, as embedded by the transfer pages. */
export interface LinkedMatterShape {
  id: string;
  title: string | null;
  current_phase: string | null;
  status: string | null;
  municipality: string | null;
  service_subtype: string | null;
  services?: { code: string | null } | null;
}

/**
 * Who is reading. Phases carry two names — `internalName` ("Operations") and
 * `clientName` ("Escalation in Progress") — and only staff should see the first.
 *
 * The matter pages have always made this distinction (PipelineProgress takes the
 * same parameter, and the partner portal passes "client"). The transfer service
 * lines did not, so the bar's label has been showing internal phase names to
 * attorneys and clients since §110 shipped. Naming the steps makes that visible
 * seven times over instead of once, so it is fixed here rather than inherited.
 */
export type ProgressAudience = "staff" | "client";

export function serviceProgress(
  status: string,
  matter: LinkedMatterShape | null | undefined,
  audience: ProgressAudience = "staff",
  /**
   * Whether the service line points at a matter AT ALL, independent of whether
   * this viewer may read it.
   *
   * 🔴 Without this, a party who cannot see the matter is told the work has not
   * STARTED. Found 2026-08-27 as the buyer on a transfer 13 workdays in: the
   * matter embed is RLS-filtered, so `matter` arrived null and every service
   * read "Not started" — while the seller, on the same transfer, saw phases and
   * bars. "Nobody has begun" and "you may not see this" are opposite messages,
   * and for a buyer waiting on the seller's rates clearance the wrong one is
   * actively misleading rather than merely unhelpful.
   */
  hasMatter = false
): ServiceProgress {
  const empty = { phase: 0, total: 0, label: "", steps: [] as string[] };

  if (status === "not_applicable" || status === "not_specified") {
    return { state: "none", ...empty };
  }

  // "Already done" is a claim about the world, not about our pipeline — the
  // certificate exists, someone else obtained it. A bar would imply we are
  // working on it.
  if (status === "already_done" && !matter) {
    return { state: "declared", ...empty, label: "Already done" };
  }

  // "Completed" (069) with no matter behind it: staff finished the work without
  // it ever becoming a matter in the portal. Same shape as `already_done` — a
  // finished statement, not a pipeline position — but a different sentence,
  // because the whole point of 069 is that these two are not the same claim.
  if (status === "completed" && !matter) {
    return { state: "declared", ...empty, label: "Completed" };
  }

  // A matter exists but this viewer cannot read it. Say so, rather than
  // reporting the transfer as not started — see `hasMatter` above.
  if (!matter && hasMatter) {
    return { state: "hidden", ...empty, label: "In progress — not visible to you" };
  }

  if (!matter) return { state: "unstarted", ...empty, label: "Not started" };

  const done = matter.status === "won" || matter.status === "archived";
  const pipeline = getPipeline(
    matter.services?.code,
    matter.municipality,
    matter.service_subtype
  );

  // No pipeline for this service yet (several are still skeleton configs). Say
  // it is running rather than inventing a denominator — a bar reading "phase 0
  // of 0" is worse than no bar.
  if (!pipeline) {
    return {
      state: done ? "complete" : "running",
      phase: 0,
      total: 0,
      label: done ? "Complete" : matter.current_phase ?? "In progress",
      steps: [],
    };
  }

  const forClient = audience === "client";
  const steps = phaseSteps(pipeline);
  const idx = phaseOrder(pipeline, matter.current_phase);

  return {
    state: done ? "complete" : "running",
    // phaseOrder is 0-indexed and returns -1 when the phase is unknown; the bar
    // wants a 1-indexed position, and an unknown phase is the start, not the end.
    phase: done ? steps.length : Math.max(1, idx + 1),
    total: steps.length,
    label: done ? "Complete" : phaseLabel(pipeline, matter.current_phase, forClient),
    steps: steps.map((s) => (forClient ? phaseLabel(pipeline, s.key, true) : s.label)),
  };
}

/** The columns the transfer pages must select for the above to work. */
export const LINKED_MATTER_SELECT =
  "matters(id, title, current_phase, status, municipality, service_subtype, services(code))";

// ---------------------------------------------------------------------------
// THE TRANSFER'S OWN PROGRESS — rolled up from its service lines.
// ---------------------------------------------------------------------------

/**
 * Zewn, 2026-08-27: *"the property transfers should also have a progress bar
 * ... and it should be linked to the services. a property transfer is only
 * complete when each service is marked as done or not applicable."*
 *
 * 🔴 THE TRANSFER HAS NO PROGRESS OF ITS OWN, exactly as a service line has none
 * of its own. This is the same rule one level up: a service line's progress is
 * its matter's, and a transfer's progress is its service lines'. Giving the
 * transfer a stored percentage would create a second answer to "how far along is
 * this" that drifts from the checklist the moment anyone changes a marker.
 *
 * WHAT COUNTS AS RESOLVED — his words are "marked as done or not applicable":
 *   · `not_applicable`  → resolved. Explicitly ruled out of this transaction.
 *   · `already_done`    → resolved. Someone did it, not necessarily through us.
 *   · `needed` + a matter that is won or archived → resolved. The work is done.
 *   · `needed` otherwise → OUTSTANDING. Either no matter yet, or one still running.
 *   · `not_specified`   → OUTSTANDING, and this is the load-bearing choice.
 *
 * ⚠️ WHY `not_specified` IS OUTSTANDING, AND WHAT IT COSTS
 *   His word is "marked", and `not_specified` is the absence of a mark — nobody
 *   has yet said whether this service is needed. A transfer with an open
 *   question on it is not finished.
 *
 *   The cost is real and worth knowing before this ships: 063's
 *   `instantiate_transfer_services` creates all seven lines as `not_specified`,
 *   so a BRAND-NEW transfer reads 0 of 7 rather than an encouraging blank, and a
 *   transfer only reaches 100% once staff have explicitly marked the irrelevant
 *   services `not_applicable`. That may be exactly the forcing function wanted —
 *   it makes "we never decided about the refund" visible instead of invisible —
 *   but it is a deliberate choice and reversible in one line if it annoys.
 *
 * SUB-SERVICES ARE NOT COUNTED. Only top-level lines (`parent_id === null`) go
 * into the denominator. A parent that happens to have four children would
 * otherwise weigh five times as much as one that has none, which would make the
 * bar a measure of how finely a transfer had been broken down rather than of how
 * much of it is finished.
 */
/**
 * One dot on a transfer card: a single service line, reduced to the only thing a
 * card has room to say about it.
 *
 * `settled` and `running` are different states, not degrees of the same one — a
 * service with an open matter is being worked, a service still marked
 * "not specified" has not been decided about. Collapsing them would hide the
 * distinction the checklist exists to make.
 */
export interface TransferServiceDot {
  /** Service label, for the tooltip and the accessible name. */
  name: string;
  /** Marked done / already done / not applicable, or its matter is finished. */
  settled: boolean;
  /** Needed, with a matter open against it. */
  running: boolean;
  /**
   * Marked "needed" by anyone — with or without a matter yet.
   *
   * Zewn, 2026-09-01: "can we get yellow circles for the items that are marked
   * as needs to be done so we know whats in an active state of trying to
   * complete the service." Before this, a line somebody had deliberately marked
   * as needed but not yet opened a matter for drew the SAME hollow ring as a
   * line nobody had looked at — the two most different states on the checklist,
   * rendered identically.
   */
  needed: boolean;
}

export interface TransferProgress {
  /** Service lines that are marked done, already done, or not applicable. */
  resolved: number;
  /** Top-level service lines in total. */
  total: number;
  /** 0–100, floored. 0 when there is nothing to measure. */
  percent: number;
  /** Every line resolved — and at least one line exists. */
  complete: boolean;
  /** Short human summary, e.g. "3 of 7 services settled". */
  label: string;
  /**
   * One entry per top-level service, in checklist order.
   *
   * Zewn, 2026-08-28, wanted circles on the list pages. A transfer has no single
   * pipeline to draw a stepper from — it has seven services — so the circles
   * here are one PER SERVICE rather than per phase. Seven steppers on a list
   * card would be unreadable; seven dots answer "how much of this is settled"
   * at the altitude a list actually works at.
   */
  dots: TransferServiceDot[];
}

/**
 * The shape a service row needs for the roll-up.
 *
 * Two ways to say the work behind a `needed` line is finished, because the two
 * kinds of caller have different budgets:
 *   · detail pages already ran serviceProgress() per line — pass `progress`
 *   · LIST pages render many transfers at once and must not run the pipeline
 *     machinery per row — pass `matterStatus` straight from a light embed
 * Both agree by construction: serviceProgress() derives `complete` from exactly
 * the statuses MATTER_DONE lists.
 */
export interface TransferProgressRow {
  parent_id: string | null;
  status: string;
  matter_id?: string | null;
  progress?: ServiceProgress;
  matterStatus?: string | null;
  /** Service code or label, for the dot's name. */
  serviceCode?: string | null;
  label?: string | null;
  /** Checklist order (063). The dots are positional and must respect it. */
  position?: number | null;
}


/** A matter in one of these states has nothing further to run. */
const MATTER_DONE = new Set(["won", "archived"]);

/** Settled = decided and dealt with, by us or by someone else, or ruled out. */
function isSettled(r: TransferProgressRow): boolean {
  // `completed` (069) is the case that was missing entirely until now: work WE
  // finished. Staff previously had to record it as `already_done`, which reads
  // as "somebody else did it" and destroyed the only record of what the firm
  // actually delivered.
  if (r.status === "not_applicable" || r.status === "already_done" || r.status === "completed") {
    return true;
  }
  if (r.status !== "needed") return false;
  // `needed` counts only once the work behind it is actually finished. The
  // matter's own state is the authority — so a viewer who cannot see the matter
  // never counts it as done on a guess.
  return r.progress?.state === "complete" || MATTER_DONE.has(r.matterStatus ?? "");
}

export function transferProgress(rows: TransferProgressRow[]): TransferProgress {
  // Sorted, not assumed sorted. The counts below do not care about order, but
  // `dots` is positional — the third dot must be the third service on every
  // card — and this function is called from list pages whose queries have no
  // ORDER BY of their own. Rows without a position keep their arrival order.
  const top = rows
    .filter((r) => r.parent_id === null)
    .slice()
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const total = top.length;

  const resolved = top.filter(isSettled).length;

  const dots: TransferServiceDot[] = top.map((r) => {
    const settled = isSettled(r);
    return {
      name: r.label?.trim() || serviceLabel(r.serviceCode),
      settled,
      // Work is under way: a matter exists and has not finished. A viewer who
      // cannot see the matter still gets this from matter_id, which is on the
      // service row itself rather than behind the RLS-filtered embed.
      running: !settled && r.status === "needed" && Boolean(r.matter_id),
      needed: !settled && r.status === "needed",
    };
  });

  // No lines at all: a transfer created before 063 instantiated them. Report
  // nothing rather than a triumphant 100%, which is what 0/0 would otherwise be.
  if (total === 0) {
    return {
      resolved: 0,
      total: 0,
      percent: 0,
      complete: false,
      label: "No services listed yet",
      dots: [],
    };
  }

  return {
    resolved,
    total,
    percent: Math.floor((resolved / total) * 100),
    complete: resolved === total,
    label:
      resolved === total
        ? "All services settled"
        : `${resolved} of ${total} services settled`,
    dots,
  };
}

/**
 * The select a LIST page needs to roll up progress for many transfers at once.
 * `matters(status)` is the whole matter read — the list never needs a pipeline,
 * only whether the work finished.
 */
export const TRANSFER_PROGRESS_SELECT =
  "transfer_id, parent_id, status, matter_id, service_code, label, position, matters(status)";

interface ProgressSelectRow {
  transfer_id: string;
  parent_id: string | null;
  status: string;
  matter_id: string | null;
  service_code: string | null;
  label: string | null;
  position: number | null;
  matters?: { status: string | null } | null;
}

/**
 * Roll up one query's worth of service rows into progress per transfer.
 *
 * Takes the rows rather than the client, so the caller owns the query and its
 * RLS context — and so a page that already has the rows does not fetch twice.
 * Transfers with no service lines are simply absent from the map; the component
 * renders nothing for them.
 */
export function transferProgressById(
  rows: unknown,
  transferIds: string[]
): Map<string, TransferProgress> {
  const byTransfer = new Map<string, TransferProgressRow[]>();
  for (const raw of (rows as ProgressSelectRow[] | null) ?? []) {
    const list = byTransfer.get(raw.transfer_id) ?? [];
    list.push({
      parent_id: raw.parent_id,
      status: raw.status,
      matter_id: raw.matter_id,
      matterStatus: raw.matters?.status ?? null,
      serviceCode: raw.service_code,
      label: raw.label,
      position: raw.position ?? 0,
    });
    byTransfer.set(raw.transfer_id, list);
  }

  const out = new Map<string, TransferProgress>();
  for (const id of transferIds) {
    const rowsFor = byTransfer.get(id);
    if (!rowsFor?.length) continue;
    // 🔴 SORT HERE, not in the caller. The dots are POSITIONAL — the third one
    // is Property Rates Clearance on every card, or they mean nothing — and a
    // bare PostgREST select returns rows in whatever order the planner likes.
    // Found live 2026-08-28: one transfer rendered its three in-flight services
    // as the LAST three dots, in reverse. The counts were right and the picture
    // was a lie.
    //
    // The detail pages order by `position` in their own query; a list must not
    // have to remember to. Sorting inside this helper means no caller can get
    // it wrong.
    rowsFor.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    out.set(id, transferProgress(rowsFor));
  }
  return out;
}
