import Link from "next/link";
import { Building2 } from "lucide-react";
import StatusPill, { type StatusTone } from "@/components/ui/StatusPill";
import MetaChip from "@/components/ui/MetaChip";
import PhaseProgress from "@/components/ui/PhaseProgress";
import ServiceSteps from "@/components/ui/ServiceSteps";
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
import { serviceDisplayName } from "@/lib/councils/types";

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
  /** The transaction this matter belongs to, where it belongs to one (029). */
  property_transfers?: { id?: string | null; reference?: string | null } | null;
};

export default function MatterCard({
  matter: m,
  href,
  unread = false,
  showStage = false,
  showStatus = true,
  transferHrefBase,
  index,
}: {
  matter: MatterCardRow;
  href: string;
  unread?: boolean;
  showStage?: boolean;
  /**
   * The status pill. Off for attorneys (2026-09-02).
   *
   * Zewn: "remove the stage and status for attorneys here." Both answer a
   * ConveyClear question rather than theirs — `matters.status` is the workflow
   * state of OUR file (new / open / won / lost), and a firm reading "Won" beside
   * their own instruction learns nothing about their transaction. The phase
   * stepper directly above says where the work actually is, which is what they
   * came for.
   */
  showStatus?: boolean;
  /**
   * Where a linked property transfer lives, e.g. "/partner/transfers". Pass it
   * and the card carries the transaction the matter sits under — Zewn, the same
   * day: "also add the linked property transfer somewhere." A matter title now
   * carries the transfer REFERENCE (2026-09-01), so without this the card shows
   * a code with nothing to click.
   */
  transferHrefBase?: string;
  /** 1-based position in the whole result set, continuing across pages. */
  index?: number;
}) {
  const pl = getPipeline(m.services?.code, m.municipality, m.service_subtype);
  const steps = pl ? phaseSteps(pl) : [];
  // 🔴 A NULL PHASE IS THE PRE-PHASE, not "no pipeline".
  //
  // phaseOrder returns -1 for a missing key, and the stepper below was hidden on
  // that. Matters created while their pipeline did not exist were written with
  // current_phase NULL — every EBP, COC, MAD and REF, and every PRC that had no
  // stage — so the moment those gained a pipeline (the default one, and the PRC
  // stage fix) the DETAIL page drew six phases and the LIST drew none. Found on
  // production 2026-09-01.
  //
  // Fixed here rather than by backfilling the column: a matter that has a
  // pipeline and no recorded phase IS at the start of it, and saying so in the
  // one place that reads it beats writing a value to every historic row.
  const idx = pl ? Math.max(phaseOrder(pl, m.current_phase), m.current_phase ? -1 : 0) : -1;

  const open = workdaysSince(m.created_at);
  const seen = relativeDays(m.updated_at);
  const transferRef = m.property_transfers?.reference?.trim() || null;
  const stalled = open !== null && open > STALLED_WORKDAYS;
  const tone = STATUS_TONE[m.status ?? ""] ?? "neutral";

  // serviceDisplayName, not services.name: the row's own name column still said
  // "Certificates" after the COC rename, so a matter card contradicted the
  // transfer page it was opened from. Third site of that leak (2026-09-02).
  const service = [serviceDisplayName(m.services?.code, m.services?.name), m.service_subtype]
    .filter(Boolean)
    .join(": ");
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
            {typeof index === "number" && (
              <span className="shrink-0 text-[13px] font-medium tabular-nums text-ink-3">
                {index}.
              </span>
            )}
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
        {showStatus && m.status && (
          <StatusPill tone={tone}>
            <span className="font-normal opacity-80">Status:</span>{" "}
            {MATTER_STATUS_LABELS[m.status as MatterStatus] ?? m.status}
          </StatusPill>
        )}
      </div>

      {/* Circles above the bar, matching the transfer's service lines (Zewn,
          2026-08-28). A matter has exactly ONE pipeline, so one stepper per card
          is the honest shape here — and everything it needs was already being
          computed for the bar.

          Client-facing phase names, as the bar already used: a card in the
          partner or client portal must never show our internal vocabulary. */}
      {pl && idx >= 0 && (
        <div className="mt-5 space-y-2">
          <ServiceSteps
            steps={steps.map((s) => phaseLabel(pl, s.key, true))}
            phase={idx + 1}
            done={idx === steps.length - 1}
          />
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
        {/* The transaction this matter sits under. Since 2026-09-01 the matter
            TITLE carries the transfer reference, so without a way through, the
            card shows a code and no way to follow it. */}
        {transferRef &&
          (transferHrefBase && m.property_transfers?.id ? (
            <Link
              href={`${transferHrefBase}/${m.property_transfers.id}`}
              className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action"
            >
              <MetaChip label="Transfer" value={transferRef} icon={<Building2 className="h-3.5 w-3.5" />} />
            </Link>
          ) : (
            <MetaChip label="Transfer" value={transferRef} icon={<Building2 className="h-3.5 w-3.5" />} />
          ))}
        {/* ONE time fact, not two. Zewn, 2026-09-02: "remove how many days its
            been open or remove the date opened … leave only one of them on the
            list pages." Elapsed time wins where there is one — it is a state of
            affairs, where a date is a lookup — and the date fills in only where
            there is not. Both stay on the matter page. */}
        {open === null && m.created_at && (
          <MetaChip label="Opened" value={formatDate(m.created_at)} />
        )}
      </div>
    </li>
  );
}
