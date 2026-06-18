"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState } from "react";
import { Search } from "lucide-react";

// Filter bar for matters lists. Writes filter state into the URL searchParams
// (server component re-queries). Default values (active / this month) map to NO
// param, so a clean URL = the default view. Any change resets pagination.
export default function MatterFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [q, setQ] = useState(sp.get("q") ?? "");

  const status = sp.get("status") === "all" ? "all" : "active";
  const scope = sp.get("scope") === "all" ? "all" : "month";

  function update(next: Record<string, string | undefined>) {
    const params = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(next)) {
      if (!v) params.delete(k);
      else params.set(k, v);
    }
    params.delete("page"); // any filter change resets pagination
    router.push(`${pathname}?${params.toString()}`);
  }

  const selCls =
    "rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-[#1B2E6B]";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          update({ q: q.trim() || undefined });
        }}
        className="relative flex-1 min-w-[180px]"
      >
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search matters…"
          className="w-full rounded-lg border border-gray-300 pl-8 pr-3 py-1.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1B2E6B]"
        />
      </form>
      <select
        value={status}
        onChange={(e) => update({ status: e.target.value === "all" ? "all" : undefined })}
        className={selCls}
        aria-label="Status filter"
      >
        <option value="active">Active</option>
        <option value="all">All statuses</option>
      </select>
      <select
        value={scope}
        onChange={(e) => update({ scope: e.target.value === "all" ? "all" : undefined })}
        className={selCls}
        aria-label="Period filter"
      >
        <option value="month">This month</option>
        <option value="all">All time</option>
      </select>
    </div>
  );
}
