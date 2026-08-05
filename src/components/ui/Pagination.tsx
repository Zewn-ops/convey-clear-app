"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export const PAGE_SIZES = [25, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 25;

/** Clamp an arbitrary ?per= value to one we actually offer. */
export function parsePageSize(raw?: string | string[] | null): number {
  const v = Array.isArray(raw) ? raw[0] : raw;
  const n = parseInt(v ?? "", 10);
  return (PAGE_SIZES as readonly number[]).includes(n) ? n : DEFAULT_PAGE_SIZE;
}

/**
 * Numbered pagination with a rows-per-page control.
 *
 * Replaces Previous / "View more", which could only walk one page at a time and
 * never said how many pages there were. On a list someone works daily, "page 4
 * of 9" is orientation; "View more" is a treadmill.
 *
 * Page numbers are windowed with ellipses rather than listed in full: 40 page
 * buttons is its own kind of wall.
 */
export default function Pagination({
  page,
  pageSize,
  total,
  noun = "results",
}: {
  page: number;
  pageSize: number;
  total: number;
  noun?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  function go(p: number) {
    const params = new URLSearchParams(sp.toString());
    if (p <= 1) params.delete("page");
    else params.set("page", String(p));
    router.push(params.toString() ? `${pathname}?${params.toString()}` : pathname);
  }

  function setPerPage(n: number) {
    const params = new URLSearchParams(sp.toString());
    if (n === DEFAULT_PAGE_SIZE) params.delete("per");
    else params.set("per", String(n));
    // Row 200 of the old paging is not row 200 of the new one, so a size change
    // returns to page 1 rather than to a page that may no longer exist.
    params.delete("page");
    router.push(params.toString() ? `${pathname}?${params.toString()}` : pathname);
  }

  // Always first and last, always the current neighbours, ellipses for the rest.
  const pages: (number | "gap")[] = [];
  for (let p = 1; p <= pageCount; p++) {
    if (p === 1 || p === pageCount || Math.abs(p - page) <= 1) pages.push(p);
    else if (pages[pages.length - 1] !== "gap") pages.push("gap");
  }

  const numBtn =
    "min-w-[34px] rounded-lg px-2.5 py-1.5 text-sm tabular-nums transition-colors";
  const arrow =
    "inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-sm text-ink-2 transition-colors hover:bg-raised disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 text-sm text-ink-3">
      <span>
        {total === 0 ? `No ${noun}` : `${from}–${to} of ${total} ${noun}`}
      </span>

      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2">
          <span className="text-ink-3">Rows</span>
          <select
            value={pageSize}
            onChange={(e) => setPerPage(Number(e.target.value))}
            className="cursor-pointer rounded-lg bg-raised px-2 py-1.5 text-sm text-ink-2 focus:outline-none focus:ring-2 focus:ring-action"
          >
            {PAGE_SIZES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>

        {pageCount > 1 && (
          <nav aria-label="Pagination" className="flex items-center gap-1">
            <button type="button" onClick={() => go(page - 1)} disabled={page <= 1} className={arrow}>
              <ChevronLeft className="h-4 w-4" /> Prev
            </button>

            {pages.map((p, i) =>
              p === "gap" ? (
                <span key={`gap-${i}`} className="px-1 text-ink-3">
                  …
                </span>
              ) : (
                <button
                  key={p}
                  type="button"
                  onClick={() => go(p)}
                  aria-current={p === page ? "page" : undefined}
                  className={cn(
                    numBtn,
                    p === page
                      ? "bg-action-fill font-medium text-white"
                      : "text-ink-2 hover:bg-raised"
                  )}
                >
                  {p}
                </button>
              )
            )}

            <button
              type="button"
              onClick={() => go(page + 1)}
              disabled={page >= pageCount}
              className={arrow}
            >
              Next <ChevronRight className="h-4 w-4" />
            </button>
          </nav>
        )}
      </div>
    </div>
  );
}
