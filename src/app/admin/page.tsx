import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import Card from "@/components/ui/Card";
import { isStaffRole, type PropertyTransfer } from "@/types";
import TransferCard from "@/components/transfers/TransferCard";
import {
  TRANSFER_PROGRESS_SELECT,
  transferProgressById,
  type TransferProgress,
} from "@/lib/transfer-service-progress";
import { ArrowRight, Building2, Inbox, FileCheck2 } from "lucide-react";

export const metadata = { title: "Admin Overview — ConveyClear" };
export const dynamic = "force-dynamic";

// Meeting 2026-08-24 (§110): "a dashboard where the property transfer serves as
// the primary view for attorneys and clients". This page used to lead with
// matters. A matter is one service inside a transaction; the transaction is the
// thing anyone actually asks about, so the transfer leads and matters are
// reachable rather than front and centre.
export default async function AdminPage() {
  const session = await getSessionProfile();
  if (!session || !isStaffRole(session.profile?.role)) redirect("/auth/login");

  const supabase = await createClient();

  const [
    { data: staleData },
    { count: openCount },
    { count: pendingRequests },
    { count: pendingDocs },
    { data: linkedRows },
  ] = await Promise.all([
    // Oldest first: the question is which transaction has gone quiet, not which
    // is newest. nullsFirst because a transfer never touched since creation is
    // the most neglected of all, not the least.
    supabase
      .from("property_transfers")
      .select("*")
      .eq("status", "open")
      .order("updated_at", { ascending: true, nullsFirst: true })
      .limit(6),
    supabase.from("property_transfers").select("id", { count: "exact", head: true }).eq("status", "open"),
    supabase.from("transfer_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("documents").select("id", { count: "exact", head: true }).is("approved_at", null),
    // Matter counts for the cards below, in one query rather than per row.
    supabase.from("matters").select("transfer_id").not("transfer_id", "is", null),
  ]);

  const stale = (staleData as PropertyTransfer[] | null) ?? [];
  const counts = new Map<string, number>();
  ((linkedRows as { transfer_id: string | null }[] | null) ?? []).forEach((m) => {
    if (m.transfer_id) counts.set(m.transfer_id, (counts.get(m.transfer_id) ?? 0) + 1);
  });

  // Settled-progress for the stalled transfers shown below. One query for the
  // section, and only when there is something to show it against.
  let progressById = new Map<string, TransferProgress>();
  if (stale.length) {
    const ids = stale.map((t) => t.id);
    const { data: svcRows } = await supabase
      .from("transfer_services")
      .select(TRANSFER_PROGRESS_SELECT)
      .in("transfer_id", ids);
    progressById = transferProgressById(svcRows, ids);
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div>
        <h1 className="text-[40px] font-semibold leading-[1.06] tracking-[-0.032em] text-ink">Today</h1>
        <p className="mt-1 text-sm text-ink-3">
          {openCount ?? 0} open transfer{openCount === 1 ? "" : "s"} ·{" "}
          {pendingRequests ?? 0} request{pendingRequests === 1 ? "" : "s"} waiting on us
        </p>
      </div>

      {/* Three routes into work, each a live count and a destination. Not stat
          tiles: every one of these is a link to the list it describes.

          The hover used to warm the border. With the border gone the tile LIFTS
          instead — the affordance has to move somewhere, not just be deleted.
          Dark mode has no usable shadow, so there the ring warms as before. */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Link
          href="/admin/property-transfers?type=open"
          className="group rounded-xl bg-surface p-5 shadow transition-shadow duration-200 ease-out hover:shadow-lg dark:ring-1 dark:ring-line dark:hover:ring-action/40"
        >
          <Building2 className="h-5 w-5 text-action" />
          <p className="mt-3 text-[26px] font-semibold tabular-nums tracking-[-0.025em] text-ink">{openCount ?? 0}</p>
          <p className="mt-0.5 text-sm text-ink-2">Open transfers</p>
          <p className="mt-2 inline-flex items-center gap-1 text-xs text-ink-3 group-hover:text-action">
            Open list <ArrowRight className="h-3 w-3" />
          </p>
        </Link>

        <Link
          href="/admin/transfer-requests"
          className="group rounded-xl bg-surface p-5 shadow transition-shadow duration-200 ease-out hover:shadow-lg dark:ring-1 dark:ring-line dark:hover:ring-action/40"
        >
          <Inbox className="h-5 w-5 text-ink-3" />
          <p className="mt-3 text-[26px] font-semibold tabular-nums tracking-[-0.025em] text-ink">
            {pendingRequests ?? 0}
          </p>
          <p className="mt-0.5 text-sm text-ink-2">Requests to review</p>
          <p className="mt-2 inline-flex items-center gap-1 text-xs text-ink-3 group-hover:text-action">
            Open queue <ArrowRight className="h-3 w-3" />
          </p>
        </Link>

        <Link
          href="/admin/approvals"
          className="group rounded-xl bg-surface p-5 shadow transition-shadow duration-200 ease-out hover:shadow-lg dark:ring-1 dark:ring-line dark:hover:ring-action/40"
        >
          <FileCheck2 className="h-5 w-5 text-ink-3" />
          <p className="mt-3 text-[26px] font-semibold tabular-nums tracking-[-0.025em] text-ink">{pendingDocs ?? 0}</p>
          <p className="mt-0.5 text-sm text-ink-2">Documents to review</p>
          <p className="mt-2 inline-flex items-center gap-1 text-xs text-ink-3 group-hover:text-action">
            Open approvals <ArrowRight className="h-3 w-3" />
          </p>
        </Link>
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[19px] font-semibold tracking-[-0.015em] text-ink">Transfers without movement</h2>
          <Link href="/admin/property-transfers" className="text-sm text-action hover:underline">
            View all
          </Link>
        </div>

        {/* Matters have not gone away — they are one service inside a transfer, and
            plenty of them (standalone clearances, disputes) never sit under one at
            all. Zewn, 2026-08-26: put this under the heading rather than at the
            foot, where it read as a footnote to the page instead of an
            alternative way into the same work. */}
        <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-3">
          <span>Working a single service?</span>
          <Link href="/admin/matters?queue=ours" className="text-action hover:underline">
            Matters needing us
          </Link>
          <Link href="/admin/matters?queue=council" className="text-action hover:underline">
            With the council
          </Link>
        </div>

        {stale.length > 0 ? (
          <ul className="space-y-4">
            {stale.map((t) => (
              <TransferCard
                key={t.id}
                transfer={t}
                href={`/admin/property-transfers/${t.id}`}
                matterCount={counts.get(t.id) ?? 0}
                progress={progressById.get(t.id)}
              />
            ))}
          </ul>
        ) : (
          <Card className="py-12 text-center">
            <p className="font-medium text-ink">No open transfers</p>
            <p className="mt-1 text-sm text-ink-3">
              Everything is registered or on hold.{" "}
              <Link href="/admin/matters?queue=ours" className="text-action hover:underline">
                See the matter queue
              </Link>
              .
            </p>
          </Card>
        )}
      </div>

    </div>
  );
}
