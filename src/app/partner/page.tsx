import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";
import StatTile from "@/components/ui/StatTile";
import MatterCard from "@/components/matters/MatterCard";
import TransferCard from "@/components/transfers/TransferCard";
import EmptyState from "@/components/ui/EmptyState";
import { type Matter, type PropertyTransfer } from "@/types";
import {
  TRANSFER_PROGRESS_SELECT,
  transferProgressById,
  type TransferProgress,
} from "@/lib/transfer-service-progress";
import { ArrowRight, PlusCircle, Phone, Mail, MessageSquare, Briefcase, Building2 } from "lucide-react";
import { CONVEYCLEAR_PHONE, CONVEYCLEAR_EMAIL, telHref } from "@/lib/contact";

export const metadata = { title: "Partner Overview — ConveyClear" };

/**
 * §5.4 — Zewn, 2026-08-31: "i think it would be really nice to be able to switch
 * between prop trfs and matters on the overview page. so like a slider type
 * thing. the same as what you did for chat/activity feed in prop trf."
 *
 * The pattern he means is TransferFeed's Conversation / Activity pair, so the
 * control looks the same. It is two LINKS rather than React state, because this
 * is a server component and the choice then survives a refresh, a bookmark and a
 * shared URL for free — no client bundle, no storage.
 *
 * 🔴 THE TOGGLE MOVES THE WHOLE PAGE, NOT ONLY THE LIST. Matter counts sitting
 * above a list of transfers is a page that contradicts itself, and the tiles are
 * the first thing read. Both change together.
 *
 * ⚠️ THE DEFAULT IS NOW TRANSFERS, WHICH IS A CHANGE. This page opened on
 * matters and was headed "Your matters", while the Matters tab had been hidden
 * from the partner nav since 2026-08-26 — so its own stat tiles linked to a
 * place a partner had no way back to. PRODUCT.md has the transfer as the central
 * object and §110 makes it the primary view; the default now matches both.
 */
type View = "transfers" | "matters";

export default async function PartnerOverview({
  searchParams,
}: {
  searchParams?: Promise<{ view?: string }>;
}) {
  const params = await searchParams;
  const view: View = params?.view === "matters" ? "matters" : "transfers";
  const showingTransfers = view === "transfers";

  const supabase = await createClient();

  // RLS scopes every one of these to the partner's firm automatically.
  const [
    { count: totalMatters },
    { count: activeMatters },
    { count: mattersOnHold },
    { count: clientCount },
    { count: totalTransfers },
    { count: openTransfers },
    { count: transfersOnHold },
  ] = await Promise.all([
    supabase.from("matters").select("id", { count: "exact", head: true }),
    supabase.from("matters").select("id", { count: "exact", head: true }).eq("status", "open"),
    supabase.from("matters").select("id", { count: "exact", head: true }).eq("status", "on_hold"),
    supabase.from("clients").select("id", { count: "exact", head: true }),
    supabase.from("property_transfers").select("id", { count: "exact", head: true }),
    supabase.from("property_transfers").select("id", { count: "exact", head: true }).eq("status", "open"),
    supabase.from("property_transfers").select("id", { count: "exact", head: true }).eq("status", "on_hold"),
  ]);

  type PartnerMatterRow = Matter & {
    municipality?: string | null;
    service_subtype?: string | null;
    services?: { code?: string | null; name?: string | null } | null;
    property_transfers?: { id?: string | null; reference?: string | null } | null;
  };

  let matters: PartnerMatterRow[] = [];
  let transfers: PropertyTransfer[] = [];
  let progressById = new Map<string, TransferProgress>();

  // Only the side being shown is fetched. The counts above are cheap
  // head-requests; the rows are not, and paying for both halves on every visit
  // to render one of them is the waste the toggle exists to avoid.
  if (showingTransfers) {
    const { data } = await supabase
      .from("property_transfers")
      .select("*")
      .in("status", ["open", "on_hold"])
      .order("created_at", { ascending: false })
      .limit(6);
    transfers = (data as PropertyTransfer[] | null) ?? [];

    if (transfers.length) {
      const tIds = transfers.map((t) => t.id);
      // One query for the whole list, not one per card — the same shape the
      // transfers page uses, so a card reads identically in both places. The
      // matter-count query went with the chip it fed (2026-09-02).
      const { data: svcRows } = await supabase
        .from("transfer_services")
        .select(TRANSFER_PROGRESS_SELECT)
        .in("transfer_id", tIds);
      progressById = transferProgressById(svcRows, tIds);
    }
  } else {
    const { data } = await supabase
      .from("matters")
      .select(
        "id, title, current_phase, status, municipality, service_subtype, created_at, updated_at, clients(full_name, business_name), services(code, name), property_transfers(id, reference)"
      )
      .in("status", ["open", "on_hold"])
      .order("created_at", { ascending: false })
      .limit(6);
    matters = (data as PartnerMatterRow[] | null) ?? [];
  }

  // Per-row unread dots, matters only: a notification carries a matter_id and
  // there is no transfer equivalent to key on.
  const ids = matters.map((m) => m.id);
  const meId = (await getSessionProfile())?.profile?.id ?? null;
  const unread = new Set<string>();

  if (ids.length && meId) {
    const { data: notes } = await supabase
      .from("notifications")
      .select("matter_id")
      .eq("user_id", meId)
      .is("read_at", null)
      .in("matter_id", ids);
    (notes ?? []).forEach((n) => {
      const id = (n as { matter_id: string | null }).matter_id;
      if (id) unread.add(id);
    });
  }

  const actionLink =
    "inline-flex items-center gap-2 rounded border border-line px-3.5 py-2 text-sm font-medium text-ink-2 transition-colors duration-150 ease-out hover:bg-raised hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 focus-visible:ring-offset-canvas";

  // Deliberately larger than a chip. Zewn, 2026-09-02: "make the selection
  // between prop trfs and matters a bit bigger so it draws more attention." It
  // is the control that changes the whole page — tiles, heading and list — and
  // at 12px in a grey tray it read as a filter someone had already set.
  const tab = (active: boolean) =>
    "rounded-lg px-4 py-2 text-[14px] font-semibold transition-colors " +
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action " +
    (active
      ? "bg-surface text-ink shadow"
      : "text-ink-3 hover:bg-surface/60 hover:text-ink-2");

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div className="page-header flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-[40px] font-semibold leading-[1.06] tracking-[-0.032em] text-ink">
              {showingTransfers ? "Your property transfers" : "Your matters"}
            </h1>
            <p className="mt-2.5 text-[15px] font-medium text-ink-3">
              {showingTransfers
                ? "Every matter of one transaction, together."
                : "Matters ConveyClear is handling for your clients."}
            </p>
          </div>

          {/* The same control as TransferFeed's Conversation / Activity pair —
              links, not state, so the choice survives a refresh and a shared
              URL without a line of client JavaScript. */}
          <div
            className="flex items-center gap-1 rounded-xl bg-raised p-1 ring-1 ring-inset ring-line"
            role="tablist"
            aria-label="Show transfers or matters"
          >
            <Link
              href="/partner"
              role="tab"
              aria-selected={showingTransfers}
              className={tab(showingTransfers)}
            >
              Property transfers
            </Link>
            <Link
              href="/partner?view=matters"
              role="tab"
              aria-selected={!showingTransfers}
              className={tab(!showingTransfers)}
            >
              Matters
            </Link>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <a href={`mailto:${CONVEYCLEAR_EMAIL}`} className={actionLink}>
            <Mail className="h-4 w-4" /> Email ConveyClear
          </a>
          <a href={telHref(CONVEYCLEAR_PHONE)} className={actionLink}>
            <Phone className="h-4 w-4" /> Call &middot; {CONVEYCLEAR_PHONE}
          </a>
          <Link href="/partner/enquiries" className={actionLink}>
            <MessageSquare className="h-4 w-4" /> New enquiry
          </Link>
          <Link
            href="/partner/transfers/new"
            className="inline-flex items-center gap-2 rounded bg-action-fill px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition-colors duration-150 ease-out hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
          >
            <PlusCircle className="h-4 w-4" /> Request a property transfer
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {showingTransfers ? (
          <>
            <StatTile value={totalTransfers ?? 0} label="Total" href="/partner/transfers" />
            <StatTile value={openTransfers ?? 0} label="Open" tone="ok" href="/partner/transfers?type=open" />
            <StatTile value={transfersOnHold ?? 0} label="On hold" tone="waiting" href="/partner/transfers?type=on_hold" />
            <StatTile value={clientCount ?? 0} label="Clients" href="/partner/clients" />
          </>
        ) : (
          <>
            <StatTile value={totalMatters ?? 0} label="Total" href="/partner/matters" />
            <StatTile value={activeMatters ?? 0} label="Active" tone="ok" href="/partner/matters?status=open" />
            <StatTile value={mattersOnHold ?? 0} label="On hold" tone="waiting" href="/partner/matters?status=on_hold" />
            <StatTile value={clientCount ?? 0} label="Clients" href="/partner/clients" />
          </>
        )}
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[19px] font-semibold tracking-[-0.015em] text-ink">
            {showingTransfers ? "Active transfers" : "Active matters"}
          </h2>
          <Link
            href={showingTransfers ? "/partner/transfers" : "/partner/matters"}
            className="flex items-center gap-1 text-sm font-medium text-action hover:underline"
          >
            View all <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {showingTransfers ? (
          transfers.length === 0 ? (
            <EmptyState
              title="No active transfers"
              icon={<Building2 className="h-6 w-6" />}
              action={
                <Link href="/partner/transfers/new" className="text-[12.5px] font-bold text-action hover:underline">
                  Request your first property transfer
                </Link>
              }
            >
              Ask ConveyClear to open a transfer and it appears here, with every
              service under it and how far each has got.
            </EmptyState>
          ) : (
            <ul className="space-y-4">
              {transfers.map((t) => (
                <TransferCard
                  key={t.id}
                  transfer={t}
                  href={`/partner/transfers/${t.id}`}
                  progress={progressById.get(t.id)}
                />
              ))}
            </ul>
          )
        ) : matters.length === 0 ? (
          <EmptyState
            title="No active matters"
            icon={<Briefcase className="h-6 w-6" />}
            action={
              <Link href="/partner/transfers/new" className="text-[12.5px] font-bold text-action hover:underline">
                Request your first property transfer
              </Link>
            }
          >
            Once you request a property transfer, its matters appear here with their phase, how long
            they have been running, and whatever is holding them up.
          </EmptyState>
        ) : (
          <ul className="space-y-4">
            {matters.map((m) => (
              <MatterCard
                key={m.id}
                matter={m}
                href={`/partner/matters/${m.id}`}
                unread={unread.has(m.id)}
                // A firm reads the phase, not our workflow status (2026-09-02).
                showStatus={false}
                transferHrefBase="/partner/transfers"
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
