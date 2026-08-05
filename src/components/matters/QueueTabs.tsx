"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { MatterQueue } from "@/lib/matters-query";

/**
 * Who the work is sitting with. The primary lever on the admin matters list.
 *
 * This is a view, not a filter: it sits above the filter bar, is never hidden
 * behind a dropdown, and survives "Clear filters". Staff running two hundred
 * matters do not need a shorter row, they need a shorter list — the exhausting
 * part is re-deciding on every row whether it is theirs to move.
 *
 * Counts are rendered because a tab that might be empty is a tab you have to
 * click to find out about.
 */
const TABS: { key: MatterQueue; label: string; hint: string }[] = [
  { key: "ours", label: "Needs us", hint: "We have the next move" },
  { key: "council", label: "With council", hint: "Submitted or escalated, awaiting a council response" },
  { key: "all", label: "All", hint: "Every matter the filters allow" },
];

export default function QueueTabs({
  active,
  counts,
}: {
  active: MatterQueue;
  counts: Partial<Record<MatterQueue, number>>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  function select(key: MatterQueue) {
    const next = new URLSearchParams(sp.toString());
    next.set("queue", key);
    next.delete("page");
    router.push(`${pathname}?${next.toString()}`, { scroll: false });
  }

  return (
    <div role="tablist" aria-label="Matter queue" className="flex flex-wrap gap-1">
      {TABS.map((t) => {
        const on = t.key === active;
        const count = counts[t.key];
        return (
          <button
            key={t.key}
            role="tab"
            aria-selected={on}
            title={t.hint}
            onClick={() => select(t.key)}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
              on
                ? "bg-action-fill text-white font-medium"
                : "text-ink-2 hover:bg-raised"
            )}
          >
            {t.label}
            {typeof count === "number" && (
              <span
                className={cn(
                  "rounded px-1.5 py-0.5 text-xs tabular-nums",
                  on ? "bg-white/20 text-white" : "bg-raised text-ink-3"
                )}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
