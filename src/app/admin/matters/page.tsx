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
  firms?: { name: string | null } | null;
  services?: { code: string | null } | null;
  matter_parties?: ListParty[] | null;
};
import MatterPagination from "@/components/matters/MatterPagination";
import FilterRail, { type Facet } from "@/components/ui/FilterRail";

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

  // Facet sources come from the DB, not a hardcoded list, so a council added in
  // `municipalities` shows up as a filter without a code change. Phases are read
  // from the rows themselves because the phase vocabulary is per-pipeline
  // (service × municipality) — there is no single global list to enumerate.
  const [{ data: muniRows }, { data: phaseRows }] = await Promise.all([
    supabase.from("municipalities").select("code, name").eq("active", true).order("name"),
    supabase.from("matters").select("current_phase").not("current_phase", "is", null),
  ]);
  const municipalities = (muniRows as { code: string; name: string }[] | null) ?? [];
  const phases = Array.from(
    new Set(((phaseRows as { current_phase: string | null }[] | null) ?? []).map((r) => r.current_phase!).filter(Boolean))
  ).sort();

  const filters = parseMatterFilters(searchParams, municipalities.map((m) => m.code));
  const { data, count } = await applyMatterFilters(
    supabase
      .from("matters")
      .select(
        "id, title, current_phase, current_stage, status, priority, deadline, municipality, service_subtype, created_at, clients(full_name, business_name, first_name, last_name), firms(name), services(code), matter_parties(role, entity_type, first_name, last_name, business_name)",
        { count: "exact" }
      ),
    filters
  );

  const matters = (data as MatterRow[] | null) ?? [];
  const total = count ?? 0;

  // Per-row unread notification dots (cleared when the matter is opened).
  const meId = session.profile?.id ?? null;
  const unread = new Set<string>();
  if (meId && matters.length) {
    const { data: notes } = await supabase
      .from("notifications")
      .select("matter_id")
      .eq("user_id", meId)
      .is("read_at", null)
      .in("matter_id", matters.map((m) => m.id));
    (notes ?? []).forEach((n) => (n as { matter_id: string | null }).matter_id && unread.add((n as { matter_id: string }).matter_id));
  }

  const hasActiveFilters =
    filters.status !== "active" ||
    filters.scope !== "all" ||
    Boolean(filters.q || filters.municipality || filters.priority || filters.phase);

  // A facet with nothing to choose between is noise — drop it rather than render
  // an empty heading (which is what a fresh database would otherwise show).
  const facets: Facet[] = [
    {
      key: "status",
      label: "Status",
      defaultValue: "active",
      options: [
        { value: "active", label: "Active" },
        ...(Object.keys(MATTER_STATUS_LABELS) as MatterStatus[]).map((s) => ({
          value: s,
          label: MATTER_STATUS_LABELS[s],
        })),
        { value: "all", label: "All statuses" },
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
    {
      key: "priority",
      label: "Priority",
      defaultValue: "",
      options: [
        { value: "", label: "Any priority" },
        ...(Object.keys(PRIORITY_LABELS) as MatterPriority[]).map((p) => ({
          value: p,
          label: PRIORITY_LABELS[p],
        })),
      ],
    },
    ...(phases.length
      ? [
          {
            key: "phase",
            label: "Phase",
            defaultValue: "",
            options: [{ value: "", label: "Any phase" }, ...phases.map((p) => ({ value: p, label: p }))],
          } as Facet,
        ]
      : []),
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
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-[40px] font-semibold leading-[1.06] tracking-[-0.032em] text-ink">All Matters</h1>
          <p className="text-sm text-ink-3 mt-1">{total} matter{total === 1 ? "" : "s"}</p>
        </div>
        <Link
          href="/admin/matters/new"
          className="inline-flex items-center gap-2 rounded-lg bg-action-fill px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> New matter
        </Link>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row">
        <FilterRail facets={facets} searchPlaceholder="Search title, ref, firm…" />

        <div className="min-w-0 flex-1 space-y-6">
        <Card padding="none">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-raised">
                <th className="px-5 py-3 text-left text-xs font-semibold text-ink-3 uppercase tracking-wide">Matter</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-ink-3 uppercase tracking-wide hidden lg:table-cell">Firm</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-ink-3 uppercase tracking-wide">Phase</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-ink-3 uppercase tracking-wide hidden md:table-cell">Stage</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-ink-3 uppercase tracking-wide hidden md:table-cell">Priority</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-ink-3 uppercase tracking-wide hidden lg:table-cell">Deadline</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-ink-3 uppercase tracking-wide">Status</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {matters.map((m) => {
                const seller = partyDisplay(m.matter_parties?.find((p) => p.role === "seller"));
                const buyer = partyDisplay(m.matter_parties?.find((p) => p.role === "buyer"));
                const pipeline = getPipeline(m.services?.code, m.municipality, m.service_subtype);
                return (
                <tr key={m.id} className="hover:bg-raised transition-colors">
                  <td className="px-5 py-3">
                    <span className="flex items-center gap-2">
                      {unread.has(m.id) && <span className="h-2 w-2 rounded-full bg-action-fill shrink-0" title="New activity" />}
                      <Link href={`/admin/matters/${m.id}`} className="font-medium text-ink hover:text-action hover:underline">
                        {m.title || clientDisplayName(m.clients) || "Untitled"}
                      </Link>
                    </span>
                    <div className="text-xs text-ink-3 mt-0.5 space-y-0.5">
                      {seller && <p>Seller: {seller}</p>}
                      {buyer && <p>Buyer: {buyer}</p>}
                      {!seller && !buyer && m.clients && <p>Client: {clientDisplayName(m.clients)}</p>}
                      {m.municipality && <p>Council: {municipalityLabel(m.municipality)}</p>}
                    </div>
                  </td>
                  <td className="px-5 py-3 text-ink-3 hidden lg:table-cell">{m.firms?.name ?? "—"}</td>
                  <td className="px-5 py-3">
                    {m.current_phase ? (
                      <span className="text-xs font-medium px-2 py-1 rounded-full bg-action-fill/10 text-action whitespace-nowrap">
                        {pipeline ? phaseLabel(pipeline, m.current_phase) : m.current_phase}
                      </span>
                    ) : (
                      <span className="text-ink-3">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-ink-3 hidden md:table-cell max-w-[140px] truncate">
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
                  <td className="px-5 py-3 text-ink-3 hidden lg:table-cell">
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
                    <Link href={`/admin/matters/${m.id}`} className="text-action hover:underline text-xs font-medium">
                      Manage
                    </Link>
                  </td>
                </tr>
                );
              })}
              {matters.length === 0 && (
                <tr>
                  {/* "No matches" and "nothing exists yet" are different problems
                      and need different next actions — saying "no matches" to
                      someone with an empty database sends them hunting for a
                      filter they never set. */}
                  <td colSpan={8} className="px-5 py-10 text-center text-ink-3">
                    {hasActiveFilters ? (
                      <>No matters match your filters — try clearing them.</>
                    ) : (
                      <>No matters yet. Create the first one with <span className="font-medium text-ink-3">New matter</span>.</>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        </Card>

          <MatterPagination page={filters.page} pageSize={MATTER_PAGE_SIZE} total={total} />
        </div>
      </div>
    </div>
  );
}
