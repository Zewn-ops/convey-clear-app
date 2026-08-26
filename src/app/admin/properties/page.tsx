import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";
import { isStaffRole } from "@/types";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import MetaChip from "@/components/ui/MetaChip";
import { municipalityLabel } from "@/lib/utils";
import { Building, Plus } from "lucide-react";
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

export const metadata = { title: "Properties — ConveyClear Admin" };
export const dynamic = "force-dynamic";

// The property as an entity (056, Meeting 2 §44/§106). Transfers link TO a
// property; this is where the rates account, deed number and address live.
interface Row {
  id: string;
  label: string;
  erf_number: string | null;
  address: string | null;
  suburb: string | null;
  municipality: string | null;
  rates_account_no: string | null;
  active: boolean;
  clients?: { full_name: string | null; business_name: string | null } | null;
  property_transfers?: { id: string }[] | null;
}

// `type` is the shared list-filter param, reused here for active/inactive rather
// than inventing a fourth name for "the main status facet".
const STATE = { active: "Active", inactive: "Inactive" } as const;

export default async function PropertiesPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const session = await getSessionProfile();
  if (!session || !isStaffRole(session.profile?.role)) redirect("/auth/login");

  const supabase = await createClient();

  // Facet source from the database, so a council added later needs no code
  // change here — same rule as the matters and transfers lists.
  const { data: muniRows } = await supabase
    .from("municipalities")
    .select("code, name")
    .eq("active", true)
    .order("name");
  const municipalities = (muniRows as { code: string; name: string }[] | null) ?? [];

  const filters = parseListFilters(searchParams, Object.keys(STATE));
  const get = (k: string) => {
    const v = searchParams?.[k];
    return Array.isArray(v) ? v[0] : v;
  };
  // Only a value that matched a known list reaches the query.
  const muni = municipalities.some((m) => m.code === get("municipality")) ? get("municipality")! : "";

  let query = supabase
    .from("properties")
    .select(
      "id, label, erf_number, address, suburb, municipality, rates_account_no, active, clients(full_name, business_name), property_transfers(id)",
      { count: "exact" }
    )
    .order("created_at", { ascending: false });

  if (filters.type) query = query.eq("active", filters.type === "active");
  if (muni) query = query.eq("municipality", muni);
  if (filters.scope === "month") query = query.gte("created_at", startOfMonthISO());
  // The identifiers someone actually has to hand: label, erf, address, suburb,
  // rates account. Title deed number is deliberately absent — nobody searches by it.
  query = applyTextSearch(query, filters.q, [
    "label",
    "erf_number",
    "address",
    "suburb",
    "rates_account_no",
  ]);

  const { data, count } = await applyPaging(query, filters);
  const rows = (data as Row[] | null) ?? [];
  const total = count ?? 0;
  const filtering = Boolean(filters.q || filters.type || muni) || filters.scope !== "all";

  const facets: Facet[] = [
    {
      key: "type",
      label: "State",
      defaultValue: "",
      options: [
        { value: "", label: "Any state" },
        ...Object.entries(STATE).map(([value, label]) => ({ value, label: String(label) })),
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
    periodFacet() as Facet,
  ];

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[40px] font-semibold leading-[1.06] tracking-[-0.032em] text-ink">Properties</h1>
          {/* The TOTAL, not the page — `rows.length` caps at the page size. */}
          <p className="text-sm text-ink-3 mt-1">
            {total} propert{total === 1 ? "y" : "ies"} · rates account, deed number, address. Transfers link to it.
          </p>
        </div>
        <Link
          href="/admin/properties/new"
          className="inline-flex items-center gap-2 rounded-lg bg-action-fill px-4 py-2 text-sm font-medium text-white hover:opacity-90 shrink-0"
        >
          <Plus className="h-4 w-4" /> New property
        </Link>
      </div>

      {/* Filters render on the right, in the space the list was not using, but
          sit FIRST in the DOM so keyboard and screen-reader order still reaches
          them before the rows they filter. Same arrangement as matters. */}
      <div className="flex flex-col gap-6 lg:flex-row-reverse lg:items-start">
        <aside className="lg:sticky lg:top-4 lg:w-56 lg:shrink-0">
          <FilterBar orientation="vertical" facets={facets} searchPlaceholder="Search label, erf, address…" />
        </aside>
        <div className="min-w-0 flex-1">
          {rows.length > 0 ? (
            <ol className="space-y-4">
              {rows.map((p, i) => {
                const owner = p.clients?.business_name?.trim() || p.clients?.full_name?.trim() || null;
                const transferCount = p.property_transfers?.length ?? 0;
                return (
                  <li key={p.id}>
                    <Link href={`/admin/properties/${p.id}`} className="block">
                      <Card className="transition-shadow duration-200 ease-out hover:shadow-lg">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="flex min-w-0 items-start gap-3">
                            <span className="mt-0.5 font-mono text-[13px] tabular-nums text-ink-3">
                              {(filters.page - 1) * filters.perPage + i + 1}.
                            </span>
                            <div className="min-w-0">
                              <p className="text-[17px] font-semibold tracking-[-0.01em] text-ink">{p.label}</p>
                              <p className="mt-0.5 text-[13px] text-ink-3">
                                {[p.address, p.suburb, municipalityLabel(p.municipality)]
                                  .filter(Boolean)
                                  .join(" · ") || "No address captured"}
                              </p>
                            </div>
                          </div>
                          {/* Always shown, both states — the pill IS the status, so
                              rendering it only when inactive would leave staff
                              guessing whether a bare card means active or unset. */}
                          <Badge
                            label={p.active ? "Active" : "Inactive"}
                            variant={p.active ? "success" : "danger"}
                          />
                        </div>

                        <div className="mt-3.5 flex flex-wrap gap-2">
                          {p.erf_number && <MetaChip label="Erf" value={p.erf_number} />}
                          {p.rates_account_no && <MetaChip label="Rates" value={p.rates_account_no} />}
                          <MetaChip label="Transfers" value={transferCount} />
                          {owner && <MetaChip label="Owner" value={owner} />}
                        </div>
                      </Card>
                    </Link>
                  </li>
                );
              })}
            </ol>
          ) : (
            <Card className="py-12 text-center">
              <Building className="h-8 w-8 mx-auto text-ink-3" />
              <p className="mt-3 font-medium text-ink">
                {filtering ? "Nothing matches these filters" : "No properties yet"}
              </p>
              <p className="mt-1 text-sm text-ink-3 max-w-sm mx-auto">
                {filtering
                  ? "Clear them to see the rest."
                  : "Existing transfers were not converted automatically — their property description is free text, and splitting it would have invented duplicates. Create them as you go."}
              </p>
            </Card>
          )}

          <div className="mt-6">
            <Pagination page={filters.page} pageSize={filters.perPage} total={total} noun="properties" />
          </div>
        </div>
      </div>
    </div>
  );
}
