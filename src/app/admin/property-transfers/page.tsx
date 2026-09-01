import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import MetaChip from "@/components/ui/MetaChip";
import TransferProgressBar from "@/components/transfers/TransferProgressBar";
import {
  TRANSFER_PROGRESS_SELECT,
  transferProgressById,
  type TransferProgress,
} from "@/lib/transfer-service-progress";
import { Plus, Building2 } from "lucide-react";
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
import EmptyState from "@/components/ui/EmptyState";

export const metadata = { title: "Property Transfers — ConveyClear Admin" };
export const dynamic = "force-dynamic";

function statusVariant(s: TransferStatus): "info" | "success" | "danger" | "warning" | "gray" {
  return ({ draft: "warning", open: "info", registered: "success", cancelled: "danger", on_hold: "warning", archived: "gray" } as const)[s];
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
  // 084 — an ARCHIVED transfer is out of the working list unless it is asked
  // for by name. Archived means "should never have existed", so leaving it in
  // the default view would defeat the point of having the state at all.
  //
  // CANCELLED is deliberately NOT hidden. A dead transaction is a real thing
  // that staff still refer to, and a queue that quietly forgets sales that
  // fell through is how someone re-opens work that was already abandoned.
  if (filters.type) query = query.eq("status", filters.type);
  else query = query.neq("status", "archived");
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

  // Matter counts and settled-progress per transfer. Two queries for the whole
  // page rather than embedded aggregates per row.
  const counts = new Map<string, number>();
  let progressById = new Map<string, TransferProgress>();
  if (transfers.length) {
    const ids = transfers.map((t) => t.id);
    const [{ data: linked }, { data: svcRows }] = await Promise.all([
      supabase.from("matters").select("transfer_id").in("transfer_id", ids),
      supabase.from("transfer_services").select(TRANSFER_PROGRESS_SELECT).in("transfer_id", ids),
    ]);
    (linked ?? []).forEach((m) => {
      const tid = (m as { transfer_id: string | null }).transfer_id;
      if (tid) counts.set(tid, (counts.get(tid) ?? 0) + 1);
    });
    progressById = transferProgressById(svcRows, ids);
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
      {transfers.length > 0 ? (
        <ol className="space-y-4">
          {transfers.map((t, i) => (
            <li key={t.id}>
              <Link href={`/admin/property-transfers/${t.id}`} className="block">
                <Card className="transition-shadow duration-200 ease-out hover:shadow-lg">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="mt-0.5 font-mono text-[13px] tabular-nums text-ink-3">
                        {(filters.page - 1) * filters.perPage + i + 1}.
                      </span>
                      <div className="min-w-0">
                        <p className="text-[17px] font-semibold tracking-[-0.01em] text-ink">
                          {t.reference}
                        </p>
                        <p className="mt-0.5 text-[13px] text-ink-3">
                          {t.property_description || "No property description"}
                          {t.municipality ? ` · ${municipalityLabel(t.municipality)}` : ""}
                        </p>
                      </div>
                    </div>
                    <Badge label={TRANSFER_STATUS_LABELS[t.status]} variant={statusVariant(t.status)} />
                  </div>

                  <div className="mt-3.5 flex flex-wrap gap-2">
                    <MetaChip label="Firm" value={t.firms?.name ?? "—"} />
                    <MetaChip label="Matters" value={counts.get(t.id) ?? 0} />
                    <MetaChip label="Opened" value={formatDate(t.created_at)} />
                  </div>

                  {progressById.get(t.id) && (
                    <div className="mt-3.5">
                      <TransferProgressBar progress={progressById.get(t.id)!} showDots />
                    </div>
                  )}
                </Card>
              </Link>
            </li>
          ))}
        </ol>
      ) : (
        // §5.13 — the shared primitive, and an ACTION on the empty case.
        // PRODUCT.md principle 5: "Never dead-end. Every empty state explains
        // why it is empty and offers the action that fills it." This one
        // explained and then stopped, while the partner list next to it has
        // offered its action all along — the same page, two portals, two
        // answers.
        <EmptyState
          title={filtering ? "Nothing matches these filters" : "No property transfers yet"}
          icon={<Building2 className="h-6 w-6" />}
          action={
            filtering ? undefined : (
              <Link
                href="/admin/property-transfers/new"
                className="text-[12.5px] font-bold text-action hover:underline"
              >
                Create the first one
              </Link>
            )
          }
        >
          {filtering
            ? "Clear them to see the rest."
            : "Group the matters of a single transaction under one reference."}
        </EmptyState>
      )}

          <div className="mt-6">
            <Pagination page={filters.page} pageSize={filters.perPage} total={total} noun="transfers" />
          </div>
        </div>
      </div>
    </div>
  );
}
