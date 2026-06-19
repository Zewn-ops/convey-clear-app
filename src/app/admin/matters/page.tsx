import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import { Plus } from "lucide-react";
import { formatDate } from "@/lib/utils";
import {
  isStaffRole,
  clientDisplayName,
  MATTER_STATUS_LABELS,
  PHASE_LABELS,
  PRIORITY_LABELS,
  type Matter,
  type MatterPhase,
  type MatterPriority,
  type MatterStatus,
} from "@/types";
import { parseMatterFilters, applyMatterFilters, MATTER_PAGE_SIZE } from "@/lib/matters-query";
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
        "id, title, current_phase, current_stage, status, priority, deadline, municipality, created_at, clients(full_name, business_name)",
        { count: "exact" }
      ),
    filters
  );

  const matters = (data as Matter[] | null) ?? [];
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
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Client / Matter</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Phase</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">Stage</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">Priority</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide hidden lg:table-cell">Deadline</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {matters.map((m) => (
                <tr key={m.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3">
                    <p className="font-medium text-gray-900">{m.title || clientDisplayName(m.clients) || "Untitled"}</p>
                    {m.clients && m.title && (
                      <p className="text-xs text-gray-400 mt-0.5">{clientDisplayName(m.clients)}</p>
                    )}
                    {m.municipality && (
                      <p className="text-xs text-gray-400 mt-0.5">{m.municipality}</p>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    {m.current_phase ? (
                      <span className="text-xs font-medium px-2 py-1 rounded-full bg-[#1B2E6B]/10 text-[#1B2E6B] whitespace-nowrap">
                        Phase {m.current_phase}
                      </span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-gray-500 hidden md:table-cell max-w-[140px] truncate">
                    {m.current_stage || "—"}
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
              ))}
              {matters.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-gray-400">No matters match your filters</td>
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
