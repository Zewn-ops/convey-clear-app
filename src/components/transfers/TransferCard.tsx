import Link from "next/link";
import StatusPill, { type StatusTone } from "@/components/ui/StatusPill";
import MetaChip from "@/components/ui/MetaChip";
import { formatDate, municipalityLabel } from "@/lib/utils";
import { workdaysSince } from "@/lib/elapsed";
import { TRANSFER_STATUS_LABELS, type PropertyTransfer, type TransferStatus } from "@/types";

/**
 * The property transfer card. Same shape as MatterCard so a firm reads one
 * visual language across both objects, with no phase bar: a transfer has no
 * pipeline of its own, it is the container its matters hang off.
 */

const STATUS_TONE: Record<string, StatusTone> = {
  open: "action",
  registered: "ok",
  cancelled: "danger",
  on_hold: "waiting",
};

const STALLED_WORKDAYS = 60;

export default function TransferCard({
  transfer: t,
  href,
  matterCount = 0,
}: {
  transfer: PropertyTransfer;
  href: string;
  matterCount?: number;
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
        <MetaChip
          label="Matters"
          value={matterCount}
          tone={matterCount === 0 ? "required" : "neutral"}
        />
        {t.municipality && <MetaChip label="Council" value={municipalityLabel(t.municipality)} />}
        {open !== null && live && (
          <MetaChip
            label="Open"
            value={`${open} workday${open === 1 ? "" : "s"}`}
            tone={stalled ? "waiting" : "neutral"}
          />
        )}
        {t.created_at && <MetaChip label="Opened" value={formatDate(t.created_at)} />}
      </div>
    </li>
  );
}
