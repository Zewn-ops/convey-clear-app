import Link from "next/link";
import StatusPill, { type StatusTone } from "@/components/ui/StatusPill";
import MetaChip from "@/components/ui/MetaChip";
import PhaseProgress from "@/components/ui/PhaseProgress";
import { formatDate, municipalityLabel } from "@/lib/utils";
import { workdaysSince, relativeDays } from "@/lib/elapsed";
import {
  getPipeline,
  phaseLabel,
  phaseOrder,
  phaseSteps,
  stageLabel,
  isStageClientVisible,
} from "@/lib/pipelines";
import { clientDisplayName, MATTER_STATUS_LABELS, type MatterStatus } from "@/types";

/**
 * The matter card. One definition, used by the partner overview and the matters
 * list, so the two cannot drift apart the way the old table markup did.
 *
 * Spacing is locked in DESIGN.md: the gap BETWEEN cards is larger than the gaps
 * inside one, so a card reads as a single object rather than as evenly spaced
 * rows.
 */

const STATUS_TONE: Record<string, StatusTone> = {
  new: "waiting",
  open: "action",
  on_hold: "waiting",
  won: "ok",
  lost: "danger",
  archived: "neutral",
};

// A matter beyond this many workdays gets an amber chip. Councils are slow, but
// past roughly three months something is usually actually stuck.
const STALLED_WORKDAYS = 60;

export type MatterCardRow = {
  id: string;
  title?: string | null;
  status?: string | null;
  current_phase?: string | null;
  current_stage?: string | null;
  municipality?: string | null;
  service_subtype?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  clients?: { full_name?: string | null; business_name?: string | null } | null;
  services?: { code?: string | null; name?: string | null } | null;
};

export default function MatterCard({
  matter: m,
  href,
  unread = false,
  showStage = false,
}: {
  matter: MatterCardRow;
  href: string;
  unread?: boolean;
  showStage?: boolean;
}) {
  const pl = getPipeline(m.services?.code, m.municipality, m.service_subtype);
  const steps = pl ? phaseSteps(pl) : [];
  const idx = pl ? phaseOrder(pl, m.current_phase) : -1;

  const open = workdaysSince(m.created_at);
  const seen = relativeDays(m.updated_at);
  const stalled = open !== null && open > STALLED_WORKDAYS;
  const tone = STATUS_TONE[m.status ?? ""] ?? "neutral";

  const service = [m.services?.name, m.service_subtype].filter(Boolean).join(": ");
  const subtitle = [service, m.municipality ? municipalityLabel(m.municipality) : null]
    .filter(Boolean)
    .join(" · ");

  // A stage the client is not meant to see collapses to "In progress" rather
  // than leaking an internal step name.
  const stage =
    showStage && pl && m.current_stage
      ? isStageClientVisible(pl, m.current_stage)
        ? stageLabel(pl, m.current_stage)
        : "In progress"
      : null;

  return (
    <li className="rounded-lg bg-surface p-6 shadow transition-shadow duration-200 ease-out hover:shadow-lg dark:ring-1 dark:ring-line sm:p-7">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <Link
            href={href}
            className="flex items-center gap-2 text-[17px] font-semibold tracking-[-0.018em] text-ink hover:text-action hover:underline"
          >
            {unread && (
              <span
                className="h-2 w-2 shrink-0 rounded-full bg-required-fill"
                title="New activity"
              />
            )}
            <span className="truncate">
              {m.title || clientDisplayName(m.clients) || "Untitled matter"}
            </span>
          </Link>
          {subtitle && <p className="mt-1.5 text-[13px] font-medium text-ink-3">{subtitle}</p>}
        </div>
        {/* "Status:" is carried because the word alone is ambiguous on a card
            that also badges parties and document states — "New" could be a new
            matter or a new document until the label says which. */}
        {m.status && (
          <StatusPill tone={tone}>
            <span className="font-normal opacity-80">Status:</span>{" "}
            {MATTER_STATUS_LABELS[m.status as MatterStatus] ?? m.status}
          </StatusPill>
        )}
      </div>

      {pl && idx >= 0 && (
        <div className="mt-5">
          <PhaseProgress
            phase={idx + 1}
            total={steps.length}
            label={phaseLabel(pl, m.current_phase, true)}
            done={idx === steps.length - 1}
          />
        </div>
      )}

      <div className="mt-5 flex flex-wrap gap-2">
        {open !== null && (
          <MetaChip
            label="Open"
            value={`${open} workday${open === 1 ? "" : "s"}`}
            tone={stalled ? "waiting" : "neutral"}
          />
        )}
        {stage && <MetaChip label="Stage" value={stage} />}
        {seen && <MetaChip label="Last update" value={seen} />}
        {m.created_at && <MetaChip label="Opened" value={formatDate(m.created_at)} />}
      </div>
    </li>
  );
}
