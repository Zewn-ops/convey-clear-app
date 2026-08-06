import Link from "next/link";
import { redirect } from "next/navigation";
import Card from "@/components/ui/Card";
import { createClient } from "@/lib/supabase/server";
import { getEntityContext } from "@/lib/entity";
import { getSessionProfile } from "@/lib/auth";
import { formatDate } from "@/lib/utils";
import {
  clientDisplayName,
  MATTER_STATUS_LABELS,
  type Matter,
  type MatterStatus,
} from "@/types";
import { matterPhaseLabel } from "@/lib/phase-label";
import { parseMatterFilters, applyMatterFilters, MATTER_PAGE_SIZE } from "@/lib/matters-query";
import MatterFilters from "@/components/matters/MatterFilters";
import MatterCard, { type MatterCardRow } from "@/components/matters/MatterCard";
import MatterPagination from "@/components/matters/MatterPagination";
import { Briefcase } from "lucide-react";

export const metadata = { title: "Matters — ConveyClear" };

export default async function MattersPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const session = await getSessionProfile();
  if (!session) redirect("/auth/login");

  const supabase = await createClient();
  const filters = parseMatterFilters(searchParams);
  const { activeId } = await getEntityContext();

  let base = supabase
    .from("matters")
    .select(
      "id, title, current_phase, current_stage, status, priority, deadline, created_at, updated_at, municipality, service_subtype, clients(id, entity_type, full_name, business_name), services(code, name)",
      { count: "exact" }
    );

  // Narrow to the selected entity. RLS already limits this to entities the user
  // is a member of, so this is a view preference and not the boundary: dropping
  // it would show the union of their own entities, never anyone else's.
  if (activeId) base = base.eq("client_id", activeId);

  const { data, count } = await applyMatterFilters(base, filters);
  const matters = (data as Matter[] | null) ?? [];
  const total = count ?? 0;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-[40px] font-semibold leading-[1.06] tracking-[-0.032em] text-action">Matters</h1>
        <p className="text-sm text-ink-3 mt-1">{total} matter{total === 1 ? "" : "s"}</p>
      </div>

      <MatterFilters />

      {matters.length > 0 ? (
        <ol className="space-y-4">
          {matters.map((m, i) => (
            <MatterCard
              key={m.id}
              matter={m as MatterCardRow}
              href={`/dashboard/matters/${m.id}`}
              // showStage stays OFF for clients: the internal stage vocabulary is
              // ConveyClear's working language, and MatterCard already filters it
              // through isStageClientVisible. The phase progress bar is the part
              // a client actually needs — how far along, out of how many.
              index={(filters.page - 1) * filters.perPage + i + 1}
            />
          ))}
        </ol>
      ) : (
        <Card className="text-center py-12">
          <Briefcase className="h-10 w-10 text-ink-3 mx-auto mb-3" />
          <p className="text-ink-3 text-sm">No matters match your filters</p>
        </Card>
      )}

      <MatterPagination page={filters.page} pageSize={MATTER_PAGE_SIZE} total={total} />
    </div>
  );
}
