import type { MatterStatus } from "@/types";

// Shared matters-list filtering + pagination. Used by the admin, partner, and
// client matters pages so all three behave identically. RLS already scopes rows
// per role — these are *additional* user-facing filters on top of that.
//
// Default view = ACTIVE matters from the CURRENT MONTH (status active + scope
// month), page 1. "View more" widens via the status/period toggles + Next page.

export const MATTER_PAGE_SIZE = 25;

export type MatterScope = "month" | "all";
export type MatterStatusFilter = "active" | "all";

export interface MatterFilters {
  status: MatterStatusFilter;
  scope: MatterScope;
  q: string;
  page: number; // 1-indexed
}

// "Active" = not yet closed out. Closed = won/lost/archived. 'new' = awaiting
// staff review (H1) and counts as active.
const ACTIVE_STATUSES: MatterStatus[] = ["new", "open", "on_hold"];

type SP = Record<string, string | string[] | undefined>;

export function parseMatterFilters(sp: SP | undefined): MatterFilters {
  const get = (k: string) => {
    const v = sp?.[k];
    return Array.isArray(v) ? v[0] : v;
  };
  return {
    status: get("status") === "all" ? "all" : "active",
    scope: get("scope") === "all" ? "all" : "month",
    q: (get("q") ?? "").trim().slice(0, 100),
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
  if (f.scope === "month") q = q.gte("created_at", startOfMonthISO());
  const s = sanitize(f.q);
  if (s) q = q.or(`title.ilike.%${s}%,municipality.ilike.%${s}%,partner_file_ref.ilike.%${s}%`);
  const from = (f.page - 1) * MATTER_PAGE_SIZE;
  return q.order("created_at", { ascending: false }).range(from, from + MATTER_PAGE_SIZE - 1);
}
