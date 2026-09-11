import Link from "next/link";
import StatusPill from "@/components/ui/StatusPill";
import MetaChip from "@/components/ui/MetaChip";
import { formatDate, formatRands, municipalityLabel } from "@/lib/utils";
import { workdaysSince } from "@/lib/elapsed";
import { type PropertyTransfer } from "@/types";
import TransferProgressBar from "@/components/transfers/TransferProgressBar";
import type { TransferProgress } from "@/lib/transfer-service-progress";
import { transferChip, type TransferReview } from "@/lib/transfer-review-state";

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

// The status→tone map moved to lib/transfer-review-state.ts, where the chip is
// decided once for cards and detail pages alike.

const STALLED_WORKDAYS = 60;

export default function TransferCard({
  transfer: t,
  href,
  matterCount,
  progress,
  review,
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
  /**
   * What this transfer's REQUEST decided, when that is not "approved".
   *
   * Only a draft has one. Omitted where the caller has not fetched it, and the
   * chip then reads the transfer's own status as before.
   */
  review?: TransferReview | null;
}) {
  const open = workdaysSince(t.created_at);
  // A registered transfer is finished, so its age is history rather than a
  // warning. Only live ones can be stalled.
  const live = t.status === "open" || t.status === "on_hold";
  const stalled = live && open !== null && open > STALLED_WORKDAYS;
  const chip = transferChip(t.status, review);

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
        <StatusPill tone={chip.tone}>{chip.label}</StatusPill>
      </div>

      {/* The reason, on the card itself. Zewn: "dont remove or hide the prop
          trf" — so it stays in the list, and a red chip with no explanation
          would send the reader hunting through a second page for the one
          sentence that says what to do next. */}
      {review?.reason && (
        <p className="mt-3 text-[13px] text-required">
          {review.state === "rejected" ? "Rejected: " : "We asked for: "}
          {review.reason}
        </p>
      )}

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
