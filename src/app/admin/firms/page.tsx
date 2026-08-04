import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import { Plus } from "lucide-react";
import {
  isStaffRole,
  isAdminRole,
  PARTNER_TYPE_LABELS,
  type Firm,
} from "@/types";
import FilterRail, { type Facet } from "@/components/ui/FilterRail";
import { parseListFilters, applyTextSearch } from "@/lib/list-filters";

export const metadata = { title: "Partner Firms — ConveyClear Admin" };
export const dynamic = "force-dynamic";

// Count rows per firm from a plain id list. One query per related table for the
// whole page, rather than an embedded aggregate on every row.
function tally(rows: { business_partner_id: string | null }[] | null): Map<string, number> {
  const counts = new Map<string, number>();
  (rows ?? []).forEach((r) => {
    if (r.business_partner_id) {
      counts.set(r.business_partner_id, (counts.get(r.business_partner_id) ?? 0) + 1);
    }
  });
  return counts;
}

export default async function AdminFirmsPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const session = await getSessionProfile();
  if (!session || !isStaffRole(session.profile?.role)) redirect("/auth/login");
  const canWrite = isAdminRole(session.profile?.role);

  const filters = parseListFilters(searchParams, Object.keys(PARTNER_TYPE_LABELS));
  const rawStatus = Array.isArray(searchParams?.status) ? searchParams.status[0] : searchParams?.status;
  const status = rawStatus === "inactive" || rawStatus === "all" ? rawStatus : "active";

  const supabase = await createClient();
  let query = supabase
    .from("firms")
    .select("*")
    .order("active", { ascending: false })
    .order("name");
  // Default to active firms only. An inactive firm is off-boarded, not deleted —
  // it stays for the matters that reference it, and showing it by default made
  // the list read as though ConveyClear had more live partners than it does.
  if (status === "active") query = query.eq("active", true);
  else if (status === "inactive") query = query.eq("active", false);
  if (filters.type) query = query.eq("partner_type", filters.type);
  // The column is `abbreviation`, not `abbrev` — verified against the live schema.
  query = applyTextSearch(query, filters.q, ["name", "abbreviation", "primary_email"]);

  const { data } = await query;
  const firms = (data as Firm[] | null) ?? [];
  const filtering = Boolean(filters.q || filters.type) || status !== "active";

  const facets: Facet[] = [
    {
      key: "status",
      label: "Status",
      defaultValue: "active",
      options: [
        { value: "active", label: "Active" },
        { value: "inactive", label: "Inactive" },
        { value: "all", label: "All firms" },
      ],
    },
    {
      key: "type",
      label: "Firm type",
      defaultValue: "",
      options: [
        { value: "", label: "Any type" },
        ...Object.entries(PARTNER_TYPE_LABELS).map(([value, label]) => ({ value, label: String(label) })),
      ],
    },
  ];

  const ids = firms.map((f) => f.id);
  const [userRows, matterRows] = ids.length
    ? await Promise.all([
        supabase.from("users").select("business_partner_id").in("business_partner_id", ids),
        supabase.from("matters").select("business_partner_id").in("business_partner_id", ids),
      ])
    : [{ data: null }, { data: null }];

  const userCounts = tally(userRows.data as { business_partner_id: string | null }[] | null);
  const matterCounts = tally(matterRows.data as { business_partner_id: string | null }[] | null);

  const activeCount = firms.filter((f) => f.active).length;

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Partner Firms</h1>
          {/* Counts describe the rows actually shown. The list is filtered to
              active firms by default, so reporting a global tally here would
              disagree with what is on screen. */}
          <p className="text-sm text-gray-500 mt-1">
            {firms.length} firm{firms.length === 1 ? "" : "s"}
            {status === "all" && firms.length !== activeCount && ` · ${firms.length - activeCount} inactive`}
            {status === "inactive" && " · inactive only"}
          </p>
        </div>
        {canWrite && (
          <Link
            href="/admin/firms/new"
            className="inline-flex items-center gap-2 rounded-lg bg-[#E8521A] px-4 py-2 text-sm font-medium text-white hover:bg-[#c94415]"
          >
            <Plus className="h-4 w-4" /> New firm
          </Link>
        )}
      </div>

      <div className="flex flex-col gap-6 lg:flex-row">
        <FilterRail facets={facets} searchPlaceholder="Search firm, code, email…" />
        <div className="min-w-0 flex-1">
      <Card padding="none">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Firm</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Code</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">Type</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide hidden lg:table-cell">Email</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Users</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Matters</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {firms.map((f) => (
                <tr key={f.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3">
                    <Link href={`/admin/firms/${f.id}`} className="font-medium text-gray-900 hover:text-[#E8521A] hover:underline">
                      {f.name}
                    </Link>
                    {!f.active && <Badge label="Inactive" variant="gray" className="ml-2" />}
                  </td>
                  <td className="px-5 py-3">
                    {f.abbreviation ? (
                      <span className="font-mono text-xs text-gray-700">{f.abbreviation}</span>
                    ) : (
                      <span className="text-xs text-amber-600" title="No short code set">Not set</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-gray-500 hidden md:table-cell">
                    {PARTNER_TYPE_LABELS[f.partner_type] ?? f.partner_type}
                  </td>
                  <td className="px-5 py-3 text-gray-500 hidden lg:table-cell">{f.primary_email ?? "—"}</td>
                  <td className="px-5 py-3 text-gray-600">{userCounts.get(f.id) ?? 0}</td>
                  <td className="px-5 py-3 text-gray-600">{matterCounts.get(f.id) ?? 0}</td>
                  <td className="px-5 py-3 text-right">
                    <Link href={`/admin/firms/${f.id}`} className="text-[#E8521A] hover:underline text-xs font-medium">
                      {canWrite ? "Manage" : "View"}
                    </Link>
                  </td>
                </tr>
              ))}
              {firms.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-gray-400">
                    {filtering
                      ? "No firms match your filters — try clearing them."
                      : "No partner firms yet. Create one, then add its partner users under Users & Access."}
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
