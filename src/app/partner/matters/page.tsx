import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";
import MatterCard from "@/components/matters/MatterCard";
import EmptyState from "@/components/ui/EmptyState";
import { type Matter } from "@/types";
import { parseMatterFilters, applyMatterFilters, MATTER_PAGE_SIZE } from "@/lib/matters-query";
import MatterFilters from "@/components/matters/MatterFilters";
import MatterPagination from "@/components/matters/MatterPagination";
import { PlusCircle, Briefcase } from "lucide-react";

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
      .select("id, title, current_phase, current_stage, status, municipality, service_subtype, created_at, updated_at, clients(full_name, business_name), services(code, name)", {
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

  // Per-row unread notification dots (cleared when the matter is opened).
  const meId = (await getSessionProfile())?.profile?.id ?? null;
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

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-[28px] font-extrabold tracking-[-0.025em] text-ink">Matters</h1>
          <p className="mt-1 text-sm text-ink-3">{total} matter{total === 1 ? "" : "s"}</p>
        </div>
        <Link
          href="/partner/refer"
          className="inline-flex items-center gap-2 self-start rounded bg-action-fill px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition-colors duration-150 ease-out hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
        >
          <PlusCircle className="h-4 w-4" /> Refer a matter
        </Link>
      </div>

      <MatterFilters />

      {matters.length === 0 ? (
        <EmptyState
          title="No matters match your filters"
          icon={<Briefcase className="h-6 w-6" />}
          action={
            <Link href="/partner/matters" className="text-[12.5px] font-bold text-action hover:underline">
              Clear filters
            </Link>
          }
        >
          Nothing here with the current selection. Widen the filters, or refer a new matter.
        </EmptyState>
      ) : (
        <ul className="space-y-4">
          {matters.map((m) => (
            <MatterCard
              key={m.id}
              matter={m}
              href={`/partner/matters/${m.id}`}
              unread={unread.has(m.id)}
              showStage
            />
          ))}
        </ul>
      )}

      <MatterPagination page={filters.page} pageSize={MATTER_PAGE_SIZE} total={total} />
    </div>
  );
}
