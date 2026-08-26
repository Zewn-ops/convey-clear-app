"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState } from "react";
import { Search, X } from "lucide-react";
import FacetSelect from "@/components/ui/FacetSelect";
import { cn } from "@/lib/utils";
import type { Facet } from "@/components/ui/FilterRail";

/**
 * Horizontal filter bar for list pages.
 *
 * Replaces FilterRail's always-open option lists on the admin matters list. That
 * rail rendered every facet as a full list of links, which made five facets a
 * permanent wall down the left of the screen — the "dense grey grid" PRODUCT.md
 * names as the thing attorneys already hate.
 *
 * The rail's defence of open lists was that "a row of closed dropdowns hides
 * which filters are ON". True of a dropdown labelled with its field name, so
 * these are labelled with their VALUE: an unset control reads "Council", a set
 * one reads "Council: Tshwane" and carries the action colour. Compact and
 * legible at the same time, which the wall was not.
 *
 * A native <select> is deliberate. It is the affordance every user already
 * knows, it is keyboard and screen-reader correct for free, and on mobile it
 * opens the platform picker. Reinventing it would be flavour, not craft.
 */
export default function FilterBar({
  facets,
  searchKey = "q",
  searchPlaceholder = "Search…",
  orientation = "horizontal",
  className,
}: {
  facets: Facet[];
  searchKey?: string;
  searchPlaceholder?: string;
  /**
   * "vertical" stacks the controls for a side rail. Same controls, same set
   * state, full width instead of wrapped — a rail that wraps mid-row reads as
   * a mistake rather than as a column.
   */
  orientation?: "horizontal" | "vertical";
  className?: string;
}) {
  const vertical = orientation === "vertical";
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [q, setQ] = useState(sp.get(searchKey) ?? "");
  // One open at a time: six expanded facets would outrun the sticky rail.
  const [openKey, setOpenKey] = useState<string | null>(null);

  const current = (f: Facet) => sp.get(f.key) ?? f.defaultValue;
  const isSet = (f: Facet) => current(f) !== f.defaultValue;
  const activeCount = facets.filter(isSet).length + (sp.get(searchKey) ? 1 : 0);

  // Any filter change resets to page 1 — staying on page 4 of a list that just
  // became six rows long is how a filter appears to return nothing.
  function apply(next: URLSearchParams) {
    next.delete("page");
    const s = next.toString();
    router.push(s ? `${pathname}?${s}` : pathname, { scroll: false });
  }

  function setFacet(f: Facet, value: string) {
    const next = new URLSearchParams(sp.toString());
    if (value === f.defaultValue) next.delete(f.key);
    else next.set(f.key, value);
    apply(next);
  }

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    const next = new URLSearchParams(sp.toString());
    if (q.trim()) next.set(searchKey, q.trim());
    else next.delete(searchKey);
    apply(next);
  }

  function clearAll() {
    const next = new URLSearchParams();
    const queue = sp.get("queue");
    if (queue) next.set("queue", queue); // the queue is a view, not a filter
    apply(next);
  }

  return (
    <div
      className={cn(
        vertical ? "flex flex-col gap-2" : "flex flex-wrap items-center gap-2",
        className
      )}
    >
      <form
        onSubmit={submitSearch}
        className={cn("relative min-w-0", vertical ? "w-full" : "flex-1 sm:max-w-xs")}
      >
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={searchPlaceholder}
          aria-label={searchPlaceholder}
          className="w-full rounded-lg bg-raised py-2 pl-9 pr-3 text-sm text-ink placeholder:text-ink-3 focus:outline-none focus:ring-2 focus:ring-action"
        />
      </form>

      {facets.map((f) => (
        <FacetSelect
          key={f.key}
          facet={f}
          value={current(f)}
          open={openKey === f.key}
          onToggle={() => setOpenKey(openKey === f.key ? null : f.key)}
          onSelect={(v) => {
            setFacet(f, v);
            setOpenKey(null);
          }}
        />
      ))}

      {activeCount > 0 && (
        <button
          type="button"
          onClick={clearAll}
          // Zewn, 2026-08-26: "make the clear button in blue text so its
          // noticeable". It was grey — the same weight as the inactive facet
          // labels around it, so the one control that undoes a dead-end filter
          // read as decoration. It only renders when something IS filtered, so
          // giving it the action colour costs nothing in the resting state.
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-medium text-action transition-colors hover:underline",
            vertical && "self-start"
          )}
        >
          <X className="h-3.5 w-3.5" />
          Clear {activeCount}
        </button>
      )}
    </div>
  );
}
