import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import Card from "@/components/ui/Card";
import { Plus, Briefcase } from "lucide-react";
import {
  isStaffRole,
  MATTER_STATUS_LABELS,
  PRIORITY_LABELS,
  type Matter,
  type MatterPriority,
  type MatterStatus,
} from "@/types";
import { phaseLabel, getPipeline } from "@/lib/pipelines";
import {
  parseMatterFilters,
  applyMatterFilters,
  MATTER_PAGE_SIZE,
  type MatterQueue,
} from "@/lib/matters-query";
import MatterPagination from "@/components/matters/MatterPagination";
import MatterCard, { type MatterCardRow } from "@/components/matters/MatterCard";
import QueueTabs from "@/components/matters/QueueTabs";
import FilterBar from "@/components/ui/FilterBar";
import type { Facet } from "@/components/ui/FilterRail";

export const metadata = { title: "Matters — ConveyClear Admin" };

type MatterRow = Matter &
  MatterCardRow & {
    service_subtype?: string | null;
    firms?: { name: string | null } | null;
    services?: { code: string | null; name: string | null } | null;
  };

const LIST_SELECT =
  "id, title, current_phase, current_stage, status, priority, deadline, municipality, service_subtype, created_at, updated_at, business_partner_id, clients(full_name, business_name, first_name, last_name), firms(name), services(code, name)";

export default async function AdminMattersPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const session = await getSessionProfile();
  if (!session || !isStaffRole(session.profile?.role)) redirect("/auth/login");

  const supabase = await createClient();

  // Facet sources come from the DB, not a hardcoded list, so a council or firm
  // added later shows up as a filter without a code change. Phases are read from
  // the rows themselves because the phase vocabulary is per-pipeline (service ×
  // municipality) and there is no single global list to enumerate.
  const [{ data: muniRows }, { data: firmRows }, { data: phaseRows }] = await Promise.all([
    supabase.from("municipalities").select("code, name").eq("active", true).order("name"),
    supabase.from("firms").select("id, name").order("name"),
    supabase.from("matters").select("current_phase").not("current_phase", "is", null),
  ]);
  const municipalities = (muniRows as { code: string; name: string }[] | null) ?? [];
  const firms = (firmRows as { id: string; name: string | null }[] | null) ?? [];
  const phases = Array.from(
    new Set(((phaseRows as { current_phase: string | null }[] | null) ?? []).map((r) => r.current_phase!).filter(Boolean))
  ).sort();

  // Staff land on their own work, not on everything. See QueueTabs.
  const filters = parseMatterFilters(
    searchParams,
    municipalities.map((m) => m.code),
    firms.map((f) => f.id),
    "ours"
  );

  // Counts for the three tabs, each carrying the *other* active filters so the
  // numbers describe the list you would actually land on. head:true means no
  // rows travel — three counts cost less than one page of data.
  const countFor = (queue: MatterQueue) =>
    applyMatterFilters(supabase.from("matters").select("id", { count: "exact", head: true }), {
      ...filters,
      queue,
      page: 1,
    });

  const [{ data, count }, oursCount, councilCount, allCount] = await Promise.all([
    applyMatterFilters(supabase.from("matters").select(LIST_SELECT, { count: "exact" }), filters),
    countFor("ours"),
    countFor("council"),
    countFor("all"),
  ]);

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
    (notes ?? []).forEach(
      (n) => (n as { matter_id: string | null }).matter_id && unread.add((n as { matter_id: string }).matter_id)
    );
  }

  const hasActiveFilters =
    filters.status !== "active" ||
    filters.scope !== "all" ||
    Boolean(filters.q || filters.municipality || filters.firm || filters.priority || filters.phase);

  // A facet with nothing to choose between is noise — drop it rather than render
  // a control with one option (which is what a fresh database would show).
  const facets: Facet[] = [
    // Shown from the first firm onward, not the second: with one firm the
    // control still separates that firm's matters from those with no firm at
    // all, which is a real distinction on a staff list.
    ...(firms.length > 0
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
            options: [
              { value: "", label: "Any phase" },
              // Phase keys are pipeline slugs; show the human name. The three
              // pipelines share one phase vocabulary, so any of them resolves it.
              ...phases.map((p) => ({ value: p, label: phaseLabel(getPipeline("COO", "COT"), p) })),
            ],
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
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[40px] font-semibold leading-[1.06] tracking-[-0.032em] text-ink">Matters</h1>
          <p className="text-sm text-ink-3 mt-1">
            {total} {total === 1 ? "matter" : "matters"} in this view
          </p>
        </div>
        <Link
          href="/admin/matters/new"
          className="inline-flex items-center gap-2 rounded-lg bg-action-fill px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> New matter
        </Link>
      </div>

      {/* Sticky because this is a scanning surface: on a long list the queue
          counts and the active filters are the context that stops you losing
          your place, and re-scrolling to the top to change a filter is the
          small repeated cost that makes a tool tiring.

          The page title deliberately scrolls away — pinning it would spend a
          third of the sticky height on a word you already know. */}
      <div className="sticky top-0 z-20 space-y-3 border-b border-line bg-canvas py-3">
        <QueueTabs
          active={filters.queue}
          counts={{
            ours: oursCount.count ?? 0,
            council: councilCount.count ?? 0,
            all: allCount.count ?? 0,
          }}
        />
        <FilterBar facets={facets} searchPlaceholder="Search title, ref, firm…" />
      </div>

      {matters.length > 0 ? (
        <div className="space-y-4">
          {matters.map((m) => (
            <MatterCard key={m.id} matter={m} href={`/admin/matters/${m.id}`} unread={unread.has(m.id)} showStage />
          ))}
        </div>
      ) : (
        // "No matches" and "nothing exists yet" are different problems needing
        // different next actions — saying "no matches" to someone with an empty
        // database sends them hunting for a filter they never set.
        <Card className="py-12 text-center">
          <Briefcase className="mx-auto mb-3 h-10 w-10 text-ink-3" />
          {hasActiveFilters ? (
            <>
              <p className="font-medium text-ink">Nothing matches these filters</p>
              <p className="mt-1 text-sm text-ink-3">Clear them to see the rest of this queue.</p>
            </>
          ) : filters.queue === "ours" ? (
            <>
              <p className="font-medium text-ink">Nothing waiting on us</p>
              <p className="mt-1 text-sm text-ink-3">
                Every active matter is with the council. Check{" "}
                <span className="font-medium text-ink-2">With council</span> above.
              </p>
            </>
          ) : filters.queue === "council" ? (
            <>
              <p className="font-medium text-ink">Nothing sitting with the council</p>
              <p className="mt-1 text-sm text-ink-3">Matters appear here once submitted or escalated.</p>
            </>
          ) : (
            <>
              <p className="font-medium text-ink">No matters yet</p>
              <Link
                href="/admin/matters/new"
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-action-fill px-4 py-2 text-sm font-medium text-white hover:opacity-90"
              >
                <Plus className="h-4 w-4" /> New matter
              </Link>
            </>
          )}
        </Card>
      )}

      <MatterPagination page={filters.page} pageSize={MATTER_PAGE_SIZE} total={total} />
    </div>
  );
}
