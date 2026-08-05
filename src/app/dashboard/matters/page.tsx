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
  PHASE_LABELS,
  type Matter,
  type MatterPhase,
  type MatterStatus,
} from "@/types";
import { parseMatterFilters, applyMatterFilters, MATTER_PAGE_SIZE } from "@/lib/matters-query";
import MatterFilters from "@/components/matters/MatterFilters";
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
      "id, title, current_phase, status, priority, deadline, created_at, municipality, clients(id, entity_type, full_name, business_name)",
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
        <div className="space-y-3">
          {matters.map((m) => (
            <Link key={m.id} href={`/dashboard/matters/${m.id}`}>
              <Card className="hover:border-line/30 transition-colors">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-ink truncate">
                      {m.title || clientDisplayName(m.clients) || "Untitled matter"}
                    </p>
                    <p className="text-xs text-ink-3 mt-0.5">
                      {clientDisplayName(m.clients)}
                      {m.municipality ? ` · ${m.municipality}` : ""} · opened {formatDate(m.created_at)}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    {m.current_phase && (
                      <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-action-fill/10 text-action">
                        Phase {m.current_phase}: {PHASE_LABELS[m.current_phase as MatterPhase]}
                      </span>
                    )}
                    {m.status && (
                      <span className="text-xs text-ink-3">
                        {MATTER_STATUS_LABELS[m.status as MatterStatus]}
                      </span>
                    )}
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
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
