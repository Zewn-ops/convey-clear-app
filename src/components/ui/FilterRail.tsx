"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState } from "react";
import { Search, X, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

// Generic left-hand facet rail for list pages (matters, transfers, clients,
// firms, council POCs). Filter state lives in the URL searchParams so the server
// component re-queries — same contract the matters list already used, just
// generalised and moved out of a top bar.
//
// Facets render as link-style option lists, not <select>s. On a list screen the
// point is seeing which filters are ON without opening anything; a row of closed
// dropdowns hides that. The trade-off is vertical space, which the rail has.
//
// ⚠️ A facet's DEFAULT value must map to NO param, and every consumer's
// parse<X>Filters() must agree with the `defaultValue` declared here. When those
// two drifted on the matters list, the control read "This month" while the query
// returned all time. Declare the default once, in the spec, and pass the same
// constant to both sides.

export interface FacetOption {
  value: string;
  label: string;
  /** Optional count shown right-aligned. Omit when counting would cost a query. */
  count?: number;
}

export interface Facet {
  /** searchParam key. */
  key: string;
  label: string;
  options: FacetOption[];
  /** The value meaning "no filter" — written as an absent param, never as a value. */
  defaultValue: string;
}

export default function FilterRail({
  facets,
  searchKey = "q",
  searchPlaceholder = "Search…",
  className,
}: {
  facets: Facet[];
  searchKey?: string;
  searchPlaceholder?: string;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [q, setQ] = useState(sp.get(searchKey) ?? "");
  const [openOnMobile, setOpenOnMobile] = useState(false);

  const current = (f: Facet) => sp.get(f.key) ?? f.defaultValue;

  // Count only the facets actually narrowing the list, so the badge matches what
  // "Clear all" would undo. A facet sitting on its default is not a filter.
  const activeCount =
    facets.filter((f) => current(f) !== f.defaultValue).length + (sp.get(searchKey) ? 1 : 0);

  function update(next: Record<string, string | undefined>) {
    const params = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(next)) {
      if (!v) params.delete(k);
      else params.set(k, v);
    }
    params.delete("page"); // any filter change resets pagination
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  function clearAll() {
    setQ("");
    router.push(pathname);
  }

  return (
    <div className={cn("lg:w-56 lg:shrink-0", className)}>
      {/* Mobile: the rail would push the list off the first screen, so it collapses. */}
      <button
        type="button"
        onClick={() => setOpenOnMobile((v) => !v)}
        className="lg:hidden mb-3 inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-sm font-medium text-ink-2"
        aria-expanded={openOnMobile}
      >
        <SlidersHorizontal className="h-4 w-4" />
        Filters
        {activeCount > 0 && (
          <span className="rounded-full bg-[#E8521A] px-1.5 py-0.5 text-[11px] font-semibold text-white">
            {activeCount}
          </span>
        )}
      </button>

      <div className={cn("space-y-5", openOnMobile ? "block" : "hidden lg:block")}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            update({ [searchKey]: q.trim() || undefined });
          }}
          className="relative"
        >
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            className="w-full rounded-lg border border-line py-1.5 pl-8 pr-3 text-sm text-ink placeholder:text-ink-3 focus:outline-none focus:ring-2 focus:ring-[#1B2E6B]"
          />
        </form>

        {activeCount > 0 && (
          <button
            type="button"
            onClick={clearAll}
            className="inline-flex items-center gap-1 text-xs font-medium text-[#E8521A] hover:underline"
          >
            <X className="h-3 w-3" /> Clear all filters ({activeCount})
          </button>
        )}

        {facets.map((f) => {
          const active = current(f);
          return (
            <div key={f.key}>
              <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-3">
                {f.label}
              </h3>
              <ul className="space-y-0.5">
                {f.options.map((o) => {
                  const isActive = o.value === active;
                  return (
                    <li key={o.value}>
                      <button
                        type="button"
                        aria-pressed={isActive}
                        onClick={() =>
                          update({ [f.key]: o.value === f.defaultValue ? undefined : o.value })
                        }
                        className={cn(
                          "flex w-full items-center justify-between rounded-md px-2 py-1 text-left text-sm transition-colors",
                          isActive
                            ? "bg-[#1B2E6B]/10 font-medium text-[#1B2E6B]"
                            : "text-ink-2 hover:bg-raised"
                        )}
                      >
                        <span className="truncate">{o.label}</span>
                        {typeof o.count === "number" && (
                          <span className="ml-2 shrink-0 text-xs text-ink-3">{o.count}</span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
