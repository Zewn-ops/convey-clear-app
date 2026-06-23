import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import { Plus } from "lucide-react";
import { formatDate, municipalityLabel } from "@/lib/utils";
import {
  isStaffRole,
  clientDisplayName,
  composeFullName,
  MATTER_STATUS_LABELS,
  PRIORITY_LABELS,
  type Matter,
  type MatterPriority,
  type MatterStatus,
} from "@/types";
import { getPipeline, phaseLabel, stageLabel } from "@/lib/pipelines";
import { parseMatterFilters, applyMatterFilters, MATTER_PAGE_SIZE } from "@/lib/matters-query";

// Row party (subset embedded on the list query).
type ListParty = { role: string; entity_type: string; first_name: string | null; last_name: string | null; business_name: string | null };
function partyDisplay(p?: ListParty | null): string {
  if (!p) return "";
  return (p.entity_type === "natural_person" ? composeFullName(p.first_name, p.last_name) : p.business_name) || "";
}
type MatterRow = Matter & {
  service_subtype?: string | null;
  business_partners?: { name: string | null } | null;
  services?: { code: string | null } | null;
  matter_parties?: ListParty[] | null;
};
import MatterFilters from "@/components/matters/MatterFilters";
import MatterPagination from "@/components/matters/MatterPagination";

export const metadata = { title: "All Matters — ConveyClear Admin" };

function statusVariant(status: string): "info" | "success" | "danger" | "warning" | "gray" {
  const map: Record<string, "info" | "success" | "danger" | "warning" | "gray"> = {
    new: "warning", open: "info", won: "success", lost: "danger", archived: "gray", on_hold: "warning",
  };
  return map[status] ?? "gray";
}

function priorityVariant(priority: string): "default" | "danger" | "warning" | "info" | "gray" {
  const map: Record<string, "default" | "danger" | "warning" | "info" | "gray"> = {
    whale: "default", urgent: "danger", priority: "warning", complex: "info", standard: "gray", emerging: "info",
  };
  return map[priority] ?? "gray";
}

export default async function AdminMattersPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const session = await getSessionProfile();
  if (!session || !isStaffRole(session.profile?.role)) redirect("/auth/login");

  const supabase = await createClient();
  const filters = parseMatterFilters(searchParams);
  const { data, count } = await applyMatterFilters(
    supabase
      .from("matters")
      .select(
        "id, title, current_phase, current_stage, status, priority, deadline, municipality, service_subtype, created_at, clients(full_name, business_name, first_name, last_name), business_partners(name), services(code), matter_parties(role, entity_type, first_name, last_name, business_name)",
        { count: "exact" }
      ),
    filters
  );

  const matters = (data as MatterRow[] | null) ?? [];
  const total = count ?? 0;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">All Matters</h1>
          <p className="text-sm text-gray-500 mt-1">{total} matter{total === 1 ? "" : "s"}</p>
        </div>
        <Link
          href="/admin/matters/new"
          className="inline-flex items-center gap-2 rounded-lg bg-[#E8521A] px-4 py-2 text-sm font-medium text-white hover:bg-[#c94415]"
        >
          <Plus className="h-4 w-4" /> New matter
        </Link>
      </div>

      <MatterFilters />

      <Card padding="none">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Matter</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide hidden lg:table-cell">Firm</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Phase</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">Stage</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">Priority</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide hidden lg:table-cell">Deadline</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {matters.map((m) => {
                const seller = partyDisplay(m.matter_parties?.find((p) => p.role === "seller"));
                const buyer = partyDisplay(m.matter_parties?.find((p) => p.role === "buyer"));
                const pipeline = getPipeline(m.services?.code, m.municipality, m.service_subtype);
                return (
                <tr key={m.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3">
                    <Link href={`/admin/matters/${m.id}`} className="font-medium text-gray-900 hover:text-[#E8521A] hover:underline">
                      {m.title || clientDisplayName(m.clients) || "Untitled"}
                    </Link>
                    <div className="text-xs text-gray-400 mt-0.5 space-y-0.5">
                      {seller && <p>Seller: {seller}</p>}
                      {buyer && <p>Buyer: {buyer}</p>}
                      {!seller && !buyer && m.clients && <p>Client: {clientDisplayName(m.clients)}</p>}
                      {m.municipality && <p>Council: {municipalityLabel(m.municipality)}</p>}
                    </div>
                  </td>
                  <td className="px-5 py-3 text-gray-500 hidden lg:table-cell">{m.business_partners?.name ?? "—"}</td>
                  <td className="px-5 py-3">
                    {m.current_phase ? (
                      <span className="text-xs font-medium px-2 py-1 rounded-full bg-[#1B2E6B]/10 text-[#1B2E6B] whitespace-nowrap">
                        {pipeline ? phaseLabel(pipeline, m.current_phase) : m.current_phase}
                      </span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-gray-500 hidden md:table-cell max-w-[140px] truncate">
                    {pipeline ? (m.current_stage ? stageLabel(pipeline, m.current_stage) : "—") : (m.current_stage || "—")}
                  </td>
                  <td className="px-5 py-3 hidden md:table-cell">
                    {m.priority && (
                      <Badge
                        label={PRIORITY_LABELS[m.priority as MatterPriority]}
                        variant={priorityVariant(m.priority)}
                      />
                    )}
                  </td>
                  <td className="px-5 py-3 text-gray-500 hidden lg:table-cell">
                    {m.deadline ? formatDate(m.deadline) : "—"}
                  </td>
                  <td className="px-5 py-3">
                    {m.status && (
                      <Badge
                        label={MATTER_STATUS_LABELS[m.status as MatterStatus]}
                        variant={statusVariant(m.status)}
                      />
                    )}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <Link href={`/admin/matters/${m.id}`} className="text-[#E8521A] hover:underline text-xs font-medium">
                      Manage
                    </Link>
                  </td>
                </tr>
                );
              })}
              {matters.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-10 text-center text-gray-400">No matters match your filters</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <MatterPagination page={filters.page} pageSize={MATTER_PAGE_SIZE} total={total} />
    </div>
  );
}
