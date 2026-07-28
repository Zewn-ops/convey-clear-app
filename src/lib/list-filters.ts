// Small shared helpers for the simpler list screens (clients, partner firms,
// property transfers). Matters keeps its own richer module (matters-query.ts)
// because it also owns pagination and the active/closed status grouping.
//
// The contract is the same everywhere: a filter sitting on its default is written
// as NO searchParam, so a clean URL is the default view and FilterRail's
// "active filters" count means what it says.

export type SP = Record<string, string | string[] | undefined>;

export interface ListFilters {
  q: string;
  /** Validated against the caller's allow-list; "" means no filter. */
  type: string;
  /** "all" (default) | "month" */
  scope: "all" | "month";
}

export function parseListFilters(sp: SP | undefined, allowedTypes: readonly string[] = []): ListFilters {
  const get = (k: string) => {
    const v = sp?.[k];
    return Array.isArray(v) ? v[0] : v;
  };
  const type = get("type");
  return {
    q: (get("q") ?? "").trim().slice(0, 100),
    // Never trust a searchParam that is about to reach a query — only values
    // that matched a known list get through.
    type: type && allowedTypes.includes(type) ? type : "",
    scope: get("scope") === "month" ? "month" : "all",
  };
}

export function startOfMonthISO(d = new Date()): string {
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
}

// PostgREST's .or() takes a raw expression string, so free text must have the
// syntax characters stripped before it is interpolated — a comma or paren would
// otherwise change the shape of the filter rather than be matched literally.
function sanitize(q: string): string {
  return q.replace(/[,()%*]/g, " ").trim();
}

/** Apply a case-insensitive OR search across the given columns. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyTextSearch(query: any, q: string, columns: readonly string[]): any {
  const s = sanitize(q);
  if (!s || !columns.length) return query;
  return query.or(columns.map((c) => `${c}.ilike.%${s}%`).join(","));
}

export function hasAnyFilter(f: ListFilters): boolean {
  return Boolean(f.q || f.type) || f.scope !== "all";
}

/** Period facet — identical on every list, so it is declared once. */
export function periodFacet() {
  return {
    key: "scope",
    label: "Period",
    defaultValue: "all",
    options: [
      { value: "all", label: "All time" },
      { value: "month", label: "This month" },
    ],
  };
}
