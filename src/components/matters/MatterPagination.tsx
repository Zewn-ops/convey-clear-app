"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";

// Prev / "View more" pagination + range readout for matters lists. Page lives
// in the URL (?page=N); page 1 = no param. Pairs with MatterFilters.
export default function MatterPagination({
  page,
  pageSize,
  total,
}: {
  page: number;
  pageSize: number;
  total: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const hasPrev = page > 1;
  const hasNext = page * pageSize < total;

  function go(p: number) {
    const params = new URLSearchParams(sp.toString());
    if (p <= 1) params.delete("page");
    else params.set("page", String(p));
    router.push(`${pathname}?${params.toString()}`);
  }

  const btn =
    "rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed";

  return (
    <div className="flex items-center justify-between text-sm text-gray-500">
      <span>{total === 0 ? "No matters" : `Showing ${from}–${to} of ${total}`}</span>
      <div className="flex gap-2">
        <button type="button" disabled={!hasPrev} onClick={() => go(page - 1)} className={btn}>
          Previous
        </button>
        <button type="button" disabled={!hasNext} onClick={() => go(page + 1)} className={btn}>
          View more
        </button>
      </div>
    </div>
  );
}
