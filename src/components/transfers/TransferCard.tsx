import Link from "next/link";
import StatusPill, { type StatusTone } from "@/components/ui/StatusPill";
import MetaChip from "@/components/ui/MetaChip";
import { formatDate, formatRands, municipalityLabel } from "@/lib/utils";
import { workdaysSince } from "@/lib/elapsed";
import { TRANSFER_STATUS_LABELS, type PropertyTransfer, type TransferStatus } from "@/types";
import TransferProgressBar from "@/components/transfers/TransferProgressBar";
import type { TransferProgress } from "@/lib/transfer-service-progress";

/**
 * The property transfer card. Same shape as MatterCard so a firm reads one
 * visual language across both objects.
 *
 * It carries no PHASE bar, because a transfer has no pipeline of its own — it is
 * the container its matters hang off. What it does carry, as of 2026-08-27, is a
 * SETTLED bar rolled up from its service lines: not "how far through a pipeline"
 * but "how much of this transaction has been decided and dealt with". Different
 * question, honestly answerable at this level.
 */

const STATUS_TONE: Record<string, StatusTone> = {
  // Amber, not the default grey: "Draft — awaiting approval" is a transfer
  // waiting on somebody, and a neutral pill read as a finished state on a card
  // that is anything but. Zewn, 2026-09-02: "make the bubble yellow to indicate
  // it more visually".
  draft: "waiting",
  open: "action",
  registered: "ok",
  cancelled: "danger",
  on_hold: "waiting",
  archived: "neutral",
};

const STALLED_WORKDAYS = 60;

export default function TransferCard({
  transfer: t,
  href,
  matterCount,
  progress,
}: {
  transfer: PropertyTransfer;
  href: string;
  /**
   * How many matters hang off this transfer. OMIT IT to drop the chip entirely.
   *
   * Zewn, 2026-09-02, looking at the attorney's list: "remove the matters block
   * here for attorneys as the services indicators are enough". A firm reads the
   * transaction through its seven service lines, and "Matters 0" beside a
   * settled bar was a second, worse answer to the same question — worse because
   * a transfer can be well underway with no matter yet, so the chip read as a
   * warning about nothing. Staff keep it: matters are the unit they work in.
   */
  matterCount?: number | null;
  /**
   * Rolled up from the transfer's service lines. Omitted where a caller has not
   * fetched it — the bar then does not render at all, rather than drawing an
   * empty one that would read as "nothing has happened".
   */
  progress?: TransferProgress;
}) {
  const open = workdaysSince(t.created_at);
  // A registered transfer is finished, so its age is history rather than a
  // warning. Only live ones can be stalled.
  const live = t.status === "open" || t.status === "on_hold";
  const stalled = live && open !== null && open > STALLED_WORKDAYS;

  return (
    <li className="rounded-lg bg-surface p-6 shadow transition-shadow duration-200 ease-out hover:shadow-lg dark:ring-1 dark:ring-line sm:p-7">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <Link
            href={href}
            className="block truncate text-[17px] font-semibold tracking-[-0.018em] text-ink hover:text-action hover:underline"
          >
            {t.reference}
          </Link>
          {t.property_description && (
            <p className="mt-1.5 text-[13px] font-medium text-ink-3">{t.property_description}</p>
          )}
        </div>
        <StatusPill tone={STATUS_TONE[t.status] ?? "neutral"}>
          {TRANSFER_STATUS_LABELS[t.status as TransferStatus] ?? t.status}
        </StatusPill>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {typeof matterCount === "number" && (
          <MetaChip
            label="Matters"
            value={matterCount}
            tone={matterCount === 0 ? "required" : "neutral"}
          />
        )}
        {t.municipality && <MetaChip label="Council" value={municipalityLabel(t.municipality)} />}
        {/* 077 — one number, visible to everyone. Zewn, 2026-09-02: "add the
            sell price on the prop trfs somewhere … or show sell price: unknown
            if its not entered." ALWAYS drawn, because a missing price is a fact
            about the transaction and not a reason to say nothing: a card that
            hides the field cannot be read as "nobody has told us yet". */}
        <MetaChip
          label="Sell price"
          value={formatRands(t.purchase_price) ?? "Unknown"}
          tone={t.purchase_price == null ? "waiting" : "neutral"}
        />
        {/* ONE time fact per card, not two. Zewn, 2026-09-02: "remove how many
            days its been open or remove the date opened from the details in the
            cards … leave only one of them on the list pages." Elapsed time is
            the one that survives: "Open 82 workdays" is a state of affairs, and
            an opening date is a lookup. Both are on the detail page.

            A card that is NOT live has no elapsed time to report, so it falls
            back to the date — otherwise a registered transfer would carry no
            time information at all. */}
        {open !== null && live ? (
          <MetaChip
            label="Open"
            value={`${open} workday${open === 1 ? "" : "s"}`}
            tone={stalled ? "waiting" : "neutral"}
          />
        ) : (
          t.created_at && <MetaChip label="Opened" value={formatDate(t.created_at)} />
        )}
      </div>

      {/* Below the chips, not among them: the chips are facts about the
          transfer, this is the answer to "where is it". */}
      {progress && (
        <div className="mt-5">
          <TransferProgressBar progress={progress} showDots />
        </div>
      )}
    </li>
  );
}
