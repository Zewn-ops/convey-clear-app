import { CheckCircle2 } from "lucide-react";
import ServiceDots from "@/components/transfers/ServiceDots";
import type { TransferProgress } from "@/lib/transfer-service-progress";

/**
 * How much of a property transfer is settled, rolled up from its service lines.
 *
 * Zewn, 2026-08-27: *"a property transfer is only complete when each service is
 * marked as done or not applicable."* The derivation lives in
 * lib/transfer-service-progress.ts — this only draws it.
 *
 * WHY "SETTLED" AND NOT "COMPLETE" OR "DONE"
 *   A line counts once it is *resolved*, and "not applicable" resolves a line
 *   without anything being done. "5 of 7 services complete" would be a lie about
 *   the two nobody has to do. "Settled" covers both honestly — the question each
 *   line asks is "has this been decided and dealt with", not "has work happened".
 *
 * Deliberately quiet. It appears on list cards next to several other transfers,
 * so it has to read at a glance without competing with the reference and the
 * property — which are what someone is actually scanning for.
 */
export default function TransferProgressBar({
  progress,
  showLabel = true,
  showDots = false,
}: {
  progress: TransferProgress;
  /** Off on dense list rows where the count is already implied by context. */
  showLabel?: boolean;
  /**
   * One circle per service beside the count (Zewn, 2026-08-28). On by default
   * nowhere: the detail page already lists every service in full underneath, so
   * dots there would say the same thing twice. List cards turn it on.
   */
  showDots?: boolean;
}) {
  // Nothing to measure. Say nothing rather than draw an empty bar, which reads
  // as "no progress" when it means "no checklist".
  if (progress.total === 0) return null;

  const { percent, complete, label } = progress;

  return (
    <div className="min-w-0">
      {showLabel && (
        <div className="mb-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
          <span className="flex items-center gap-1.5">
            {complete && <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-ok" />}
            <span className={`text-xs font-medium ${complete ? "text-ok" : "text-ink-2"}`}>
              {label}
            </span>
          </span>
          {/* One dot per service, beside the count rather than under the bar:
              the count says how many, the dots say which. */}
          {showDots && <ServiceDots dots={progress.dots} />}
        </div>
      )}
      <div
        className="h-1.5 overflow-hidden rounded-full bg-line"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        {/* A zero-width div still paints its rounded ends as a dot, which reads
            as "something has started" on a transfer where nothing has. */}
        {percent > 0 && (
          <div
            className={`h-full rounded-full ${complete ? "bg-ok" : "bg-action"}`}
            style={{ width: `${percent}%` }}
          />
        )}
      </div>
    </div>
  );
}
