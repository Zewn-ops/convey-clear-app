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
import FilterRail, { type Facet } from "@/components/ui/FilterRail";
import { parseListFilters, applyTextSearch, startOfMonthISO, periodFacet } from "@/lib/list-filters";

export const metadata = { title: "Property Transfers — ConveyClear Admin" };
export const dynamic = "force-dynamic";

function statusVariant(s: TransferStatus): "info" | "success" | "danger" | "warning" {
  return ({ open: "info", registered: "success", cancelled: "danger", on_hold: "warning" } as const)[s];
}

type TransferRow = PropertyTransfer & {
  business_partners?: { name: string | null } | null;
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
    supabase.from("business_partners").select("id, name").eq("active", true).order("name"),
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
    .select("*, business_partners!property_transfers_business_partner_id_fkey(name)")
    .order("created_at", { ascending: false });
  if (filters.type) query = query.eq("status", filters.type);
  if (muni) query = query.eq("municipality", muni);
  if (firmId) query = query.eq("business_partner_id", firmId);
  if (filters.scope === "month") query = query.gte("created_at", startOfMonthISO());
  // Columns verified against the live schema — there is no erf_number on
  // property_transfers; the erf lives inside property_description.
  query = applyTextSearch(query, filters.q, ["reference", "property_description"]);

  const { data } = await query;
  const transfers = (data as TransferRow[] | null) ?? [];
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
          <h1 className="text-2xl font-bold text-gray-900">Property Transfers</h1>
          <p className="text-sm text-gray-500 mt-1">
            {transfers.length} transfer{transfers.length === 1 ? "" : "s"} · one transaction, many matters
          </p>
        </div>
        <Link
          href="/admin/property-transfers/new"
          className="inline-flex items-center gap-2 rounded-lg bg-[#E8521A] px-4 py-2 text-sm font-medium text-white hover:bg-[#c94415]"
        >
          <Plus className="h-4 w-4" /> New transfer
        </Link>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row">
        <FilterRail facets={facets} searchPlaceholder="Search ref, erf, property…" />
        <div className="min-w-0 flex-1">
      <Card padding="none">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Reference</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide hidden lg:table-cell">Attorney firm</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">Council</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Matters</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide hidden lg:table-cell">Opened</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {transfers.map((t) => (
                <tr key={t.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3">
                    <Link href={`/admin/property-transfers/${t.id}`} className="font-medium text-gray-900 hover:text-[#E8521A] hover:underline">
                      {t.reference}
                    </Link>
                    {t.property_description && (
                      <p className="text-xs text-gray-500 mt-0.5">{t.property_description}</p>
                    )}
                  </td>
                  <td className="px-5 py-3 text-gray-500 hidden lg:table-cell">{t.business_partners?.name ?? "—"}</td>
                  <td className="px-5 py-3 text-gray-500 hidden md:table-cell">{municipalityLabel(t.municipality)}</td>
                  <td className="px-5 py-3 text-gray-600">{counts.get(t.id) ?? 0}</td>
                  <td className="px-5 py-3 text-gray-500 hidden lg:table-cell">{formatDate(t.created_at)}</td>
                  <td className="px-5 py-3">
                    <Badge label={TRANSFER_STATUS_LABELS[t.status]} variant={statusVariant(t.status)} />
                  </td>
                  <td className="px-5 py-3 text-right">
                    <Link href={`/admin/property-transfers/${t.id}`} className="text-[#E8521A] hover:underline text-xs font-medium">
                      Manage
                    </Link>
                  </td>
                </tr>
              ))}
              {transfers.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-gray-500">
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
        </div>
      </div>
    </div>
  );
}
