import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import { Plus } from "lucide-react";
import { formatDate, municipalityLabel } from "@/lib/utils";
import {
  isStaffRole,
  TRANSFER_STATUS_LABELS,
  type PropertyTransfer,
  type TransferStatus,
} from "@/types";
import FilterBar from "@/components/ui/FilterBar";
import { type Facet } from "@/components/ui/FilterRail";
import {
  parseListFilters,
  applyTextSearch,
  startOfMonthISO,
  periodFacet,
  applyPaging,
} from "@/lib/list-filters";
import Pagination from "@/components/ui/Pagination";

export const metadata = { title: "Property Transfers — ConveyClear Admin" };
export const dynamic = "force-dynamic";

function statusVariant(s: TransferStatus): "info" | "success" | "danger" | "warning" {
  return ({ open: "info", registered: "success", cancelled: "danger", on_hold: "warning" } as const)[s];
}

type TransferRow = PropertyTransfer & {
  firms?: { name: string | null } | null;
};

export default async function AdminTransfersPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const session = await getSessionProfile();
  if (!session || !isStaffRole(session.profile?.role)) redirect("/auth/login");

  const supabase = await createClient();

  // Facet sources from the database, so a council or firm added later needs no
  // code change here.
  const [{ data: muniRows }, { data: firmRows }] = await Promise.all([
    supabase.from("municipalities").select("code, name").eq("active", true).order("name"),
    supabase.from("firms").select("id, name").eq("active", true).order("name"),
  ]);
  const municipalities = (muniRows as { code: string; name: string }[] | null) ?? [];
  const firms = (firmRows as { id: string; name: string | null }[] | null) ?? [];

  const filters = parseListFilters(searchParams, Object.keys(TRANSFER_STATUS_LABELS));
  const get = (k: string) => {
    const v = searchParams?.[k];
    return Array.isArray(v) ? v[0] : v;
  };
  // Only values that matched a known list reach the query.
  const muni = municipalities.some((m) => m.code === get("municipality")) ? get("municipality")! : "";
  const firmId = firms.some((f) => f.id === get("firm")) ? get("firm")! : "";

  let query = supabase
    .from("property_transfers")
    .select("*, firms!property_transfers_business_partner_id_fkey(name)", { count: "exact" })
    .order("created_at", { ascending: false });
  if (filters.type) query = query.eq("status", filters.type);
  if (muni) query = query.eq("municipality", muni);
  if (firmId) query = query.eq("business_partner_id", firmId);
  if (filters.scope === "month") query = query.gte("created_at", startOfMonthISO());
  // Columns verified against the live schema — there is no erf_number on
  // property_transfers; the erf lives inside property_description.
  query = applyTextSearch(query, filters.q, ["reference", "property_description"]);

  const { data, count } = await applyPaging(query, filters);
  const transfers = (data as TransferRow[] | null) ?? [];
  const total = count ?? 0;
  const filtering = Boolean(filters.q || filters.type || muni || firmId) || filters.scope !== "all";

  const facets: Facet[] = [
    {
      key: "type",
      label: "Status",
      defaultValue: "",
      options: [
        { value: "", label: "Any status" },
        ...Object.entries(TRANSFER_STATUS_LABELS).map(([value, label]) => ({ value, label: String(label) })),
      ],
    },
    ...(municipalities.length
      ? [
          {
            key: "municipality",
            label: "Council",
            defaultValue: "",
            options: [
              { value: "", label: "Any council" },
              ...municipalities.map((m) => ({ value: m.code, label: m.name })),
            ],
          } as Facet,
        ]
      : []),
    ...(firms.length
      ? [
          {
            key: "firm",
            label: "Firm",
            defaultValue: "",
            options: [
              { value: "", label: "Any firm" },
              ...firms.map((f) => ({ value: f.id, label: f.name ?? "Unnamed firm" })),
            ],
          } as Facet,
        ]
      : []),
    periodFacet() as Facet,
  ];

  // Matter counts per transfer. One query for the whole page rather than an
  // embedded aggregate per row.
  const counts = new Map<string, number>();
  if (transfers.length) {
    const { data: linked } = await supabase
      .from("matters")
      .select("transfer_id")
      .in("transfer_id", transfers.map((t) => t.id));
    (linked ?? []).forEach((m) => {
      const tid = (m as { transfer_id: string | null }).transfer_id;
      if (tid) counts.set(tid, (counts.get(tid) ?? 0) + 1);
    });
  }

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[40px] font-semibold leading-[1.06] tracking-[-0.032em] text-ink">Property Transfers</h1>
          {/* The TOTAL, not the page — `transfers.length` caps at the page size. */}
          <p className="text-sm text-ink-3 mt-1">
            {total} transfer{total === 1 ? "" : "s"} · one transaction, many matters
          </p>
        </div>
        <Link
          href="/admin/property-transfers/new"
          className="inline-flex items-center gap-2 rounded-lg bg-action-fill px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> New transfer
        </Link>
      </div>

      {/* Filters render on the right, in the space the table was not
          using, but sit FIRST in the DOM so keyboard and screen-reader
          order still reaches them before the rows they filter. */}
      <div className="flex flex-col gap-6 lg:flex-row-reverse lg:items-start">
        <aside className="lg:sticky lg:top-4 lg:w-56 lg:shrink-0">
          <FilterBar orientation="vertical" facets={facets} searchPlaceholder="Search ref, erf, property…" />
        </aside>
        <div className="min-w-0 flex-1">
      <Card padding="none">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-raised">
                <th className="px-5 py-3 text-left text-xs font-semibold text-ink-3 uppercase tracking-wide">Reference</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-ink-3 uppercase tracking-wide hidden lg:table-cell">Attorney firm</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-ink-3 uppercase tracking-wide hidden md:table-cell">Council</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-ink-3 uppercase tracking-wide">Matters</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-ink-3 uppercase tracking-wide hidden lg:table-cell">Opened</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-ink-3 uppercase tracking-wide">Status</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {transfers.map((t) => (
                <tr key={t.id} className="hover:bg-raised transition-colors">
                  <td className="px-5 py-3">
                    <Link href={`/admin/property-transfers/${t.id}`} className="font-medium text-ink hover:text-action hover:underline">
                      {t.reference}
                    </Link>
                    {t.property_description && (
                      <p className="text-xs text-ink-3 mt-0.5">{t.property_description}</p>
                    )}
                  </td>
                  <td className="px-5 py-3 text-ink-3 hidden lg:table-cell">{t.firms?.name ?? "—"}</td>
                  <td className="px-5 py-3 text-ink-3 hidden md:table-cell">{municipalityLabel(t.municipality)}</td>
                  <td className="px-5 py-3 text-ink-2">{counts.get(t.id) ?? 0}</td>
                  <td className="px-5 py-3 text-ink-3 hidden lg:table-cell">{formatDate(t.created_at)}</td>
                  <td className="px-5 py-3">
                    <Badge label={TRANSFER_STATUS_LABELS[t.status]} variant={statusVariant(t.status)} />
                  </td>
                  <td className="px-5 py-3 text-right">
                    <Link href={`/admin/property-transfers/${t.id}`} className="text-action hover:underline text-xs font-medium">
                      Manage
                    </Link>
                  </td>
                </tr>
              ))}
              {transfers.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-ink-3">
                    {filtering
                      ? "No transfers match your filters — try clearing them."
                      : "No property transfers yet. Create one to group the matters of a single transaction."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

          <div className="mt-6">
            <Pagination page={filters.page} pageSize={filters.perPage} total={total} noun="transfers" />
          </div>
        </div>
      </div>
    </div>
  );
}
