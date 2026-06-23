import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import { formatDate, municipalityLabel } from "@/lib/utils";
import {
  clientDisplayName,
  MATTER_STATUS_LABELS,
  type Matter,
  type MatterStatus,
} from "@/types";
import { getPipeline, phaseLabel, stageLabel, isStageClientVisible } from "@/lib/pipelines";
import { parseMatterFilters, applyMatterFilters, MATTER_PAGE_SIZE } from "@/lib/matters-query";
import MatterFilters from "@/components/matters/MatterFilters";
import MatterPagination from "@/components/matters/MatterPagination";
import { PlusCircle } from "lucide-react";

export const metadata = { title: "Matters — ConveyClear Partner" };

function statusVariant(s: string): "info" | "success" | "danger" | "warning" | "gray" {
  return ({ new: "warning", open: "info", won: "success", lost: "danger", archived: "gray", on_hold: "warning" } as const)[s] ?? "gray";
}

export default async function PartnerMatters({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const supabase = await createClient();
  const filters = parseMatterFilters(searchParams);
  const { data, count } = await applyMatterFilters(
    supabase
      .from("matters")
      .select("id, title, current_phase, current_stage, status, municipality, service_subtype, created_at, clients(full_name, business_name), services(code, name)", {
        count: "exact",
      }),
    filters
  );
  type PartnerMatterRow = Matter & {
    service_subtype?: string | null;
    services?: { code?: string | null; name?: string | null } | null;
  };
  const serviceLabel = (m: PartnerMatterRow) => [m.services?.name, m.service_subtype].filter(Boolean).join(": ");
  const matters = (data as PartnerMatterRow[] | null) ?? [];
  const total = count ?? 0;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Matters</h1>
          <p className="text-sm text-gray-500 mt-1">{total} matter{total === 1 ? "" : "s"}</p>
        </div>
        <Link
          href="/partner/refer"
          className="inline-flex items-center gap-2 rounded-lg bg-[#E8521A] px-4 py-2 text-sm font-medium text-white hover:bg-[#c94415] self-start"
        >
          <PlusCircle className="h-4 w-4" /> Refer a matter
        </Link>
      </div>

      <MatterFilters />

      <Card padding="none">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Matter</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">Municipality</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Phase</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">Stage</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {matters.map((m) => {
                const pl = getPipeline(m.services?.code, m.municipality, m.service_subtype);
                return (
                <tr key={m.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3 font-medium text-gray-900">
                    <Link href={`/partner/matters/${m.id}`} className="hover:text-[#E8521A] hover:underline">
                      {m.title || clientDisplayName(m.clients) || "—"}
                    </Link>
                    {serviceLabel(m) && <p className="text-xs font-normal text-gray-400 mt-0.5">{serviceLabel(m)}</p>}
                  </td>
                  <td className="px-5 py-3 text-gray-500 hidden md:table-cell">{municipalityLabel(m.municipality)}</td>
                  <td className="px-5 py-3 text-gray-600">
                    {m.current_phase ? (pl ? phaseLabel(pl, m.current_phase, true) : m.current_phase) : "—"}
                  </td>
                  <td className="px-5 py-3 text-gray-500 hidden md:table-cell">
                    {pl
                      ? (m.current_stage
                          ? (isStageClientVisible(pl, m.current_stage) ? stageLabel(pl, m.current_stage) : "In progress")
                          : "—")
                      : (m.current_stage || "—")}
                  </td>
                  <td className="px-5 py-3">{m.status && <Badge label={MATTER_STATUS_LABELS[m.status as MatterStatus]} variant={statusVariant(m.status)} />}</td>
                  <td className="px-5 py-3 text-right">
                    <Link href={`/partner/matters/${m.id}`} className="text-[#E8521A] hover:underline text-xs font-medium">View</Link>
                  </td>
                </tr>
                );
              })}
              {matters.length === 0 && (
                <tr><td colSpan={6} className="px-5 py-10 text-center text-gray-400">No matters match your filters</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <MatterPagination page={filters.page} pageSize={MATTER_PAGE_SIZE} total={total} />
    </div>
  );
}
