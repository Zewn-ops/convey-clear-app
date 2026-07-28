import type { MatterStatus } from "@/types";

// Shared matters-list filtering + pagination. Used by the admin, partner, and
// client matters pages so all three behave identically. RLS already scopes rows
// per role — these are *additional* user-facing filters on top of that.
//
// Default view = ACTIVE matters, ALL TIME (page 1). The month filter is still
// available as a toggle, but it is NOT the default: a conveyancing matter runs for
// months, so scoping the default to the current calendar month meant the list
// emptied itself every 1st and staff quietly lost sight of live files. A matter
// opened in June that is still open is active work and belongs in the default view.

export const MATTER_PAGE_SIZE = 25;

export type MatterScope = "month" | "all";
/** "active" (default) and "all" are groups; every other value is one literal status. */
export type MatterStatusFilter = "active" | "all" | MatterStatus;

export interface MatterFilters {
  status: MatterStatusFilter;
  scope: MatterScope;
  q: string;
  municipality: string; // "" = any
  priority: string; // "" = any
  phase: string; // "" = any
  page: number; // 1-indexed
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

export function parseMatterFilters(sp: SP | undefined, municipalityCodes: readonly string[] = []): MatterFilters {
  const get = (k: string) => {
    const v = sp?.[k];
    return Array.isArray(v) ? v[0] : v;
  };
  const rawStatus = get("status");
  const status: MatterStatusFilter =
    rawStatus === "all" || (rawStatus && (ALL_STATUSES as string[]).includes(rawStatus))
      ? (rawStatus as MatterStatusFilter)
      : "active";
  return {
    status,
    // Opt IN to the month view; all-time is the default (see the note above).
    scope: get("scope") === "month" ? "month" : "all",
    q: (get("q") ?? "").trim().slice(0, 100),
    municipality: pick(get("municipality"), municipalityCodes),
    priority: pick(get("priority"), ["priority", "standard", "emerging", "complex", "urgent", "whale"]),
    phase: (get("phase") ?? "").trim().slice(0, 60),
    page: Math.max(1, parseInt(get("page") ?? "1", 10) || 1),
  };
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
  if (f.priority) q = q.eq("priority", f.priority);
  if (f.phase) q = q.eq("current_phase", f.phase);
  const s = sanitize(f.q);
  // firm_name / firm_abbrev are a trigger-maintained denorm cache (migration
  // 029) — the firm lives in an embedded table PostgREST can't .or() across.
  if (s)
    q = q.or(
      `title.ilike.%${s}%,municipality.ilike.%${s}%,partner_file_ref.ilike.%${s}%,firm_name.ilike.%${s}%,firm_abbrev.ilike.%${s}%`
    );
  const from = (f.page - 1) * MATTER_PAGE_SIZE;
  return q.order("created_at", { ascending: false }).range(from, from + MATTER_PAGE_SIZE - 1);
}
