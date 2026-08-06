import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import { formatDate } from "@/lib/utils";
import { isStaffRole, clientDisplayName, type Client } from "@/types";
import ClientRow from "@/components/clients/ClientRow";
import NewClientButton from "@/components/clients/NewClientButton";
import FilterBar from "@/components/ui/FilterBar";
import { type Facet } from "@/components/ui/FilterRail";
import { parseListFilters, applyTextSearch, startOfMonthISO, applyPaging } from "@/lib/list-filters";
import Pagination from "@/components/ui/Pagination";

export const metadata = { title: "Clients — ConveyClear Admin" };
export const dynamic = "force-dynamic";

const entityLabels: Record<string, string> = {
  natural_person: "Individual",
  business: "Business",
  trust: "Trust",
};

const entityVariants: Record<string, "info" | "default" | "gray"> = {
  natural_person: "info",
  business: "default",
  trust: "gray",
};

export default async function AdminClientsPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const session = await getSessionProfile();
  if (!session || !isStaffRole(session.profile?.role)) redirect("/auth/login");

  const filters = parseListFilters(searchParams, Object.keys(entityLabels));

  const supabase = await createClient();
  let query = supabase
    .from("clients")
    .select(
      "id, entity_type, full_name, business_name, primary_email, primary_cell, created_at",
      { count: "exact" }
    )
    .order("created_at", { ascending: false });
  if (filters.type) query = query.eq("entity_type", filters.type);
  if (filters.scope === "month") query = query.gte("created_at", startOfMonthISO());
  query = applyTextSearch(query, filters.q, [
    "full_name",
    "business_name",
    "primary_email",
    "primary_cell",
  ]);

  const { data, count } = await applyPaging(query, filters);
  const clients = (data as Client[] | null) ?? [];
  const total = count ?? 0;
  const filtering = Boolean(filters.q || filters.type) || filters.scope !== "all";

  const facets: Facet[] = [
    {
      key: "type",
      label: "Client type",
      defaultValue: "",
      options: [
        { value: "", label: "Any type" },
        ...Object.entries(entityLabels).map(([value, label]) => ({ value, label })),
      ],
    },
    {
      key: "scope",
      label: "Period",
      defaultValue: "all",
      options: [
        { value: "all", label: "All time" },
        { value: "month", label: "This month" },
      ],
    },
  ];

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-[40px] font-semibold leading-[1.06] tracking-[-0.032em] text-ink">Clients</h1>
          {/* The TOTAL, not the page: `clients.length` caps at the page size, so
              it would report "25 registered clients" forever once there were more. */}
          <p className="text-sm text-ink-3 mt-1">{total} registered client{total === 1 ? "" : "s"}</p>
        </div>
        <NewClientButton />
      </div>

      {/* Filters render on the right, in the space the table was not
          using, but sit FIRST in the DOM so keyboard and screen-reader
          order still reaches them before the rows they filter. */}
      <div className="flex flex-col gap-6 lg:flex-row-reverse lg:items-start">
        <aside className="lg:sticky lg:top-4 lg:w-56 lg:shrink-0">
          <FilterBar orientation="vertical" facets={facets} searchPlaceholder="Search name, email, cell…" />
        </aside>
        <div className="min-w-0 flex-1">
      <Card padding="none" className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-raised">
                <th className="px-5 py-3 text-left text-xs font-semibold text-ink-3 uppercase tracking-wide">Client</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-ink-3 uppercase tracking-wide hidden md:table-cell">Type</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-ink-3 uppercase tracking-wide hidden md:table-cell">Email</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-ink-3 uppercase tracking-wide hidden md:table-cell">Cell</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-ink-3 uppercase tracking-wide">Added</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {clients.map((client) => (
                <ClientRow key={client.id} href={`/admin/clients/${client.id}`}>
                  <td className="px-5 py-3">
                    <Link
                      href={`/admin/clients/${client.id}`}
                      className="font-medium text-ink hover:text-action hover:underline"
                    >
                      {clientDisplayName(client)}
                    </Link>
                  </td>
                  <td className="px-5 py-3 hidden md:table-cell">
                    <Badge
                      label={entityLabels[client.entity_type] ?? client.entity_type}
                      variant={entityVariants[client.entity_type] ?? "gray"}
                    />
                  </td>
                  <td className="px-5 py-3 text-ink-3 hidden md:table-cell">{client.primary_email ?? "—"}</td>
                  <td className="px-5 py-3 text-ink-3 hidden md:table-cell">{client.primary_cell ?? "—"}</td>
                  <td className="px-5 py-3 text-ink-3">{formatDate(client.created_at)}</td>
                  <td className="px-5 py-3 text-right">
                    <Link href={`/admin/clients/${client.id}`} className="text-action hover:underline text-xs font-medium">
                      View
                    </Link>
                  </td>
                </ClientRow>
              ))}
              {clients.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-ink-3">
                    {filtering ? "No clients match your filters — try clearing them." : "No clients yet"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

          <div className="mt-6">
            <Pagination page={filters.page} pageSize={filters.perPage} total={total} noun="clients" />
          </div>
        </div>
      </div>
    </div>
  );
}
