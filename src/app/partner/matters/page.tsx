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
      // property_transfers is embedded so the card can name the transaction the
      // matter belongs to (2026-09-02). RLS scopes the embed the same way it
      // scopes the transfer itself, so one the firm cannot see comes back null
      // and the chip simply does not render.
      .select("id, title, current_phase, current_stage, status, municipality, service_subtype, created_at, updated_at, stage_changed_at, firm_review_state, firm_review_note, clients(full_name, business_name), services(code, name), property_transfers(id, reference, council_region)", {
        count: "exact",
      }),
    filters
  );
  type PartnerMatterRow = Matter & {
    service_subtype?: string | null;
    services?: { code?: string | null; name?: string | null } | null;
    property_transfers?: { id?: string | null; reference?: string | null } | null;
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

  // "Last update" is the last thing that HAPPENED, not the last column write.
  // matters.updated_at is bumped by any write, so a data migration re-dates the
  // whole table — after 092 and 096 every row read "today". See the longer note
  // on the admin list. RLS scopes these rows, so a firm only ever sees activity
  // on matters it can already read.
  const lastActivity = new Map<string, string>();
  if (matters.length) {
    const { data: acts } = await supabase
      .from("matter_activities")
      .select("matter_id, created_at")
      .in("matter_id", matters.map((m) => m.id))
      .order("created_at", { ascending: false });
    for (const a of (acts ?? []) as { matter_id: string; created_at: string }[]) {
      if (!lastActivity.has(a.matter_id)) lastActivity.set(a.matter_id, a.created_at);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div className="page-header flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-[40px] font-semibold leading-[1.06] tracking-[-0.032em] text-ink">Matters</h1>
          <p className="mt-2.5 text-[15px] font-medium text-ink-3">{total} matter{total === 1 ? "" : "s"}</p>
        </div>
        <Link
          href="/partner/transfers/new"
          className="inline-flex items-center gap-2 self-start rounded bg-action-fill px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition-colors duration-150 ease-out hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
        >
          <PlusCircle className="h-4 w-4" /> Request a property transfer
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
          Nothing here with the current selection. Widen the filters, or request a property transfer.
        </EmptyState>
      ) : (
        <ul className="space-y-4">
          {matters.map((m) => (
            <MatterCard
              key={m.id}
              matter={{ ...m, last_activity_at: lastActivity.get(m.id) ?? null }}
              href={`/partner/matters/${m.id}`}
              unread={unread.has(m.id)}
              // No stage and no status for a firm (2026-09-02). Both report OUR
              // file's workflow state; the phase stepper above says where the
              // work is, which is the question they opened the page with.
              showStatus={false}
              transferHrefBase="/partner/transfers"
            />
          ))}
        </ul>
      )}

      <MatterPagination page={filters.page} pageSize={MATTER_PAGE_SIZE} total={total} />
    </div>
  );
}
