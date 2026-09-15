import type { MatterStatus } from "@/types";
import { COUNCIL_WAIT_STAGE_KEYS } from "@/lib/pipelines";
import { parsePageSize, DEFAULT_PAGE_SIZE } from "@/lib/pagination";

// Shared matters-list filtering + pagination. Used by the admin, partner, and
// client matters pages so all three behave identically. RLS already scopes rows
// per role — these are *additional* user-facing filters on top of that.
//
// Default view = ACTIVE matters, ALL TIME (page 1). The month filter is still
// available as a toggle, but it is NOT the default: a conveyancing matter runs for
// months, so scoping the default to the current calendar month meant the list
// emptied itself every 1st and staff quietly lost sight of live files. A matter
// opened in June that is still open is active work and belongs in the default view.

/** Kept as the default; the live value now travels on the filters as perPage. */
export const MATTER_PAGE_SIZE = DEFAULT_PAGE_SIZE;

export type MatterScope = "month" | "all";
/** "active" (default) and "all" are groups; every other value is one literal status. */
export type MatterStatusFilter = "active" | "all" | MatterStatus;

/**
 * Who the work is sitting with. The primary lever on the admin list.
 *
 * "ours"    — active, and NOT parked on a council-wait stage. The day's work.
 * "council" — submitted or escalated; the council owes us a response.
 * "all"     — everything the status filter allows.
 *
 * Split this way because staff running many matters do not need a longer list,
 * they need a shorter one: the exhausting part is re-deciding, on every row,
 * whether it is theirs to move. See DESIGN.md, "the orange/amber split".
 */
export type MatterQueue = "ours" | "council" | "all";

export interface MatterFilters {
  queue: MatterQueue;
  status: MatterStatusFilter;
  scope: MatterScope;
  q: string;
  municipality: string; // "" = any
  firm: string; // "" = any — matters.business_partner_id
  /**
   * Who at ConveyClear the matter is assigned to (matters.current_owner_id).
   * "" = everyone.
   *
   * Jukka, 2026-09-15, wanted staff RESTRICTED to their own matters. Zewn
   * disagreed and the meeting settled on a default, not a restriction: "if
   * Francois is missing one day and his client calls in, Franzu can't access
   * it". So this is a view, the rail can switch it off, and RLS is untouched —
   * every staff member can still reach every matter.
   */
  assignee: string; // "" = any — matters.current_owner_id
  /**
   * True when `assignee` is the viewer's own id because nobody chose it — the
   * default view rather than a deliberate filter. It widens the match to
   * include UNOWNED matters: on production today 6 of 32 have no owner, and a
   * strict "mine" default would drop them out of every staff member's list at
   * once, leaving work nobody is looking at. Same reasoning as the "ours" queue
   * deliberately keeping matters with no stage.
   *
   * Choosing yourself, or anyone else, from the rail is a real filter and
   * matches only that person's matters.
   */
  assigneeIsDefault: boolean;
  /**
   * 098 — the firm-review state. "" = no filter.
   *
   * Its own filter rather than a queue tab: the three queues answer "who owes
   * the next move on work we are DOING", and a matter awaiting review is not
   * work we are doing yet. Folding it into `ours` would have put unaccepted
   * matters into the same list as accepted ones, which is the distinction the
   * whole review state exists to draw.
   */
  review: string;
  priority: string; // "" = any
  phase: string; // "" = any
  page: number; // 1-indexed
  perPage: number;
}

// "Active" = not yet closed out. Closed = won/lost/archived. 'new' = awaiting
// staff review (H1) and counts as active.
const ACTIVE_STATUSES: MatterStatus[] = ["new", "open", "on_hold"];
const ALL_STATUSES: MatterStatus[] = ["new", "open", "on_hold", "won", "lost", "archived"];

type SP = Record<string, string | string[] | undefined>;

// Only ever interpolate values that matched a known-good list. Everything from
// searchParams is attacker-controlled text heading for a PostgREST filter.
function pick(v: string | undefined, allowed: readonly string[]): string {
  return v && allowed.includes(v) ? v : "";
}

export function parseMatterFilters(
  sp: SP | undefined,
  municipalityCodes: readonly string[] = [],
  firmIds: readonly string[] = [],
  defaultQueue: MatterQueue = "all",
  /**
   * Staff user ids the assignee facet may filter by, and the id to default to.
   *
   * ⚠️ The default MUST map to an absent param, per the contract in
   * FilterRail — the facet declares defaultValue:"" and this resolves an absent
   * param to defaultAssignee. "all" is the explicit opt-out and is the only
   * spelling that clears the filter. Drift between these two is exactly what
   * made the rail read "This month" while the query returned all time.
   */
  assigneeIds: readonly string[] = [],
  defaultAssignee = ""
): MatterFilters {
  const get = (k: string) => {
    const v = sp?.[k];
    return Array.isArray(v) ? v[0] : v;
  };
  const rawQueue = get("queue");
  const queue: MatterQueue =
    rawQueue === "ours" || rawQueue === "council" || rawQueue === "all"
      ? rawQueue
      : defaultQueue;
  const rawStatus = get("status");
  const status: MatterStatusFilter =
    rawStatus === "all" || (rawStatus && (ALL_STATUSES as string[]).includes(rawStatus))
      ? (rawStatus as MatterStatusFilter)
      : "active";
  return {
    queue,
    status,
    // Opt IN to the month view; all-time is the default (see the note above).
    scope: get("scope") === "month" ? "month" : "all",
    q: (get("q") ?? "").trim().slice(0, 100),
    municipality: pick(get("municipality"), municipalityCodes),
    assignee: resolveAssignee(get("assignee"), assigneeIds, defaultAssignee),
    review: pick(get("review"), ["pending", "approved", "rejected"]),
    assigneeIsDefault: get("assignee") === undefined && Boolean(defaultAssignee),
    firm: pick(get("firm"), firmIds),
    priority: pick(get("priority"), ["priority", "standard", "emerging", "complex", "urgent", "whale"]),
    phase: (get("phase") ?? "").trim().slice(0, 60),
    page: Math.max(1, parseInt(get("page") ?? "1", 10) || 1),
    perPage: parsePageSize(get("per")),
  };
}

/** Absent → the viewer's own id. "all" → no filter. Anything else must be a
 *  known staff id or it is ignored, the same way every other facet value is. */
function resolveAssignee(
  raw: string | undefined,
  allowed: readonly string[],
  fallback: string
): string {
  if (raw === undefined) return fallback;
  if (raw === "all") return "";
  return pick(raw, allowed) || fallback;
}

export function startOfMonthISO(d = new Date()): string {
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
}

// Strip PostgREST or-filter syntax chars from free text before interpolation.
function sanitize(q: string): string {
  return q.replace(/[,()%*]/g, " ").trim();
}

// Apply filters + ordering + range to a supabase matters query builder.
// Typed loosely (`any`) because the PostgREST builder generics don't survive
// being passed around; callers keep their own .select() typing on the result.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyMatterFilters(query: any, f: MatterFilters): any {
  let q = query;
  if (f.status === "active") q = q.in("status", ACTIVE_STATUSES);
  else if (f.status !== "all") q = q.eq("status", f.status);
  if (f.scope === "month") q = q.gte("created_at", startOfMonthISO());
  // These three arrive pre-validated against a fixed list by parseMatterFilters,
  // except `phase`, which is free text — .eq() parameterises it, so it is only
  // ever compared, never interpolated into an .or() expression.
  if (f.municipality) q = q.eq("municipality", f.municipality);
  if (f.firm) q = q.eq("business_partner_id", f.firm);
  if (f.assignee)
    q = f.assigneeIsDefault
      ? q.or(`current_owner_id.eq.${f.assignee},current_owner_id.is.null`)
      : q.eq("current_owner_id", f.assignee);
  if (f.priority) q = q.eq("priority", f.priority);
  if (f.review) q = q.eq("firm_review_state", f.review);
  if (f.phase) q = q.eq("current_phase", f.phase);
  // The queue split. "ours" deliberately includes matters with NO stage set —
  // an uncategorised matter is unstarted work, not work someone else owes us,
  // and it must never fall out of the default view.
  if (f.queue === "council") q = q.in("current_stage", COUNCIL_WAIT_STAGE_KEYS);
  else if (f.queue === "ours")
    q = q.or(
      `current_stage.is.null,current_stage.not.in.(${COUNCIL_WAIT_STAGE_KEYS.join(",")})`
    );
  const s = sanitize(f.q);
  // firm_name / firm_abbrev are a trigger-maintained denorm cache (migration
  // 029) — the firm lives in an embedded table PostgREST can't .or() across.
  if (s)
    q = q.or(
      `title.ilike.%${s}%,municipality.ilike.%${s}%,partner_file_ref.ilike.%${s}%,firm_name.ilike.%${s}%,firm_abbrev.ilike.%${s}%`
    );
  const size = f.perPage || MATTER_PAGE_SIZE;
  const from = (f.page - 1) * size;
  return q.order("created_at", { ascending: false }).range(from, from + size - 1);
}
