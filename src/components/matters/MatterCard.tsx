import Link from "next/link";
import { Building2 } from "lucide-react";
import StatusPill, { type StatusTone } from "@/components/ui/StatusPill";
import MetaChip from "@/components/ui/MetaChip";
import PhaseProgress from "@/components/ui/PhaseProgress";
import ServiceSteps from "@/components/ui/ServiceSteps";
import { formatDate, municipalityLabel } from "@/lib/utils";
import { workdaysSince, relativeDays, ageTone } from "@/lib/elapsed";
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
  /** When the matter last moved phase or stage (096). Optional: a caller that
   *  does not select it gets a green rail and no in-stage chip, which is the
   *  behaviour every screen had before the counter existed. */
  stage_changed_at?: string | null;
  clients?: { full_name?: string | null; business_name?: string | null } | null;
  services?: { code?: string | null; name?: string | null } | null;
  /** The transaction this matter belongs to, where it belongs to one (029).
   *  council_region rides along from 097 — the region is a fact about the
   *  PROPERTY, so it is stored once on the transfer rather than copied onto
   *  every matter under it, where the two would drift. */
  property_transfers?: {
    id?: string | null;
    reference?: string | null;
    council_region?: string | null;
  } | null;
  /** 098 — set only on matters a FIRM proposed. NULL on every staff-created one. */
  firm_review_state?: string | null;
  /**
   * When something last HAPPENED on this matter — the newest matter_activities
   * row, resolved by the list page.
   *
   * ⚠️ NOT updated_at. That column is bumped by any write, so a data migration
   * re-dates every row: after 092 and 096 the whole list read "Last update
   * today". A caller that does not supply this falls back to updated_at, which
   * is the old behaviour and still wrong in the same way — supply it.
   */
  last_activity_at?: string | null;
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
  const seen = relativeDays(m.last_activity_at ?? m.updated_at);
  // How long on the current phase/stage, and the colour that follows from it.
  // Falls back to the matter's own age: a matter that has never moved has been
  // waiting since it was created, which is the honest reading and the one that
  // makes an untouched matter go red rather than sit permanently green.
  const inStage = workdaysSince(m.stage_changed_at ?? m.created_at);
  const waitTone = ageTone(inStage);

  /**
   * A coloured edge down the side of the card for a matter the firm submitted.
   *
   * ConveyClear Services, bi-weekly meeting 2026-09-17: they wanted more
   * visibility on "not taken on" — the chip inside the card was not enough on a
   * long list, because a chip only reads once you are already looking at that
   * card. An edge is visible in peripheral vision while scrolling, which is the
   * whole job.
   *
   * Red for declined, yellow for awaiting our decision, as asked. Nothing for an
   * ordinary matter: an edge on every card is wallpaper, and then the two that
   * mean something stop meaning anything.
   *
   * A LEFT border rather than a ring: a ring closes the shape and reads as
   * selection, and these cards already use `dark:ring-1` for their own edge in
   * dark mode — a second ring would fight it.
   */
  const reviewEdge =
    m.firm_review_state === "rejected"
      ? "border-l-4 border-danger-fill"
      : m.firm_review_state === "pending"
        ? "border-l-4 border-waiting-fill"
        : "";
  const transferRef = m.property_transfers?.reference?.trim() || null;
  const stalled = open !== null && open > STALLED_WORKDAYS;
  const tone = STATUS_TONE[m.status ?? ""] ?? "neutral";

  // serviceDisplayName, not services.name: the row's own name column still said
  // "Certificates" after the COC rename, so a matter card contradicted the
  // transfer page it was opened from. Third site of that leak (2026-09-02).
  const service = [serviceDisplayName(m.services?.code, m.services?.name), m.service_subtype]
    .filter(Boolean)
    .join(": ");
  // Jukka, 2026-09-15: "if you scroll down we'll need to be able to see the
  // council — so in that case, councils are the council City of Tshwane, and
  // then region." Region follows the council it qualifies, and is silently
  // absent until someone sets one.
  const council = m.municipality
    ? [municipalityLabel(m.municipality), m.property_transfers?.council_region?.trim() || null]
        .filter(Boolean)
        .join(" · ")
    : null;
  const subtitle = [service, council].filter(Boolean).join(" · ");

  // A stage the client is not meant to see collapses to "In progress" rather
  // than leaking an internal step name.
  const stage =
    showStage && pl && m.current_stage
      ? isStageClientVisible(pl, m.current_stage)
        ? stageLabel(pl, m.current_stage)
        : "In progress"
      : null;

  return (
    <li
      className={
        "rounded-lg bg-surface p-6 shadow transition-shadow duration-200 ease-out hover:shadow-lg dark:ring-1 dark:ring-line sm:p-7 " +
        reviewEdge
      }
    >
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

      {/* A matter the firm proposed and ConveyClear has not answered. Said on
          the card rather than only on the detail page: the whole risk of a
          draft state is that someone reads a list and assumes work is under
          way. A rejected one keeps its chip too, so it does not simply look
          like an ordinary matter that never moves. */}
      {m.firm_review_state === "pending" && (
        <p className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-waiting-tint px-2 py-1 text-[11px] font-semibold text-waiting">
          Awaiting ConveyClear review
        </p>
      )}
      {m.firm_review_state === "rejected" && (
        <p className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-danger-tint px-2 py-1 text-[11px] font-semibold text-danger">
          Not taken on
        </p>
      )}

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
            ageTone={waitTone}
          />
          <PhaseProgress
            phase={idx + 1}
            total={steps.length}
            /* The phase the stepper is POINTING AT, not the stored column. A
               matter written before its pipeline existed carries current_phase
               NULL, and phaseLabel renders that as an em dash — so the card read
               "Phase 1 of 6 · —" while the circle above it correctly showed the
               pre-phase highlighted. Seven matters on production read that way
               on 2026-09-15. idx already resolves NULL to the pre-phase (see
               above); taking the label from the same place keeps the two halves
               of one sentence in agreement. */
            label={phaseLabel(pl, steps[idx]?.key ?? m.current_phase, true)}
            done={idx === steps.length - 1}
          />
        </div>
      )}

      <div className="mt-5 flex flex-wrap gap-2">
        {open !== null && (
          <MetaChip
            label="Open"
            value={`${open} workday${open === 1 ? "" : "s"}`}
            /* When the matter has never moved, this IS the wait — the "In stage"
               chip below is suppressed as a duplicate number — so it has to
               carry the colour or a stale matter reads as neutral forever. On a
               matter that HAS moved, the two numbers mean different things and
               only the stage one is a wait, so this falls back to how long it
               has been open and the 60-workday stall rule. */
            tone={
              inStage === open
                ? waitTone === "fresh"
                  ? "neutral"
                  : waitTone === "warn"
                    ? "waiting"
                    : "required"
                : stalled
                  ? "waiting"
                  : "neutral"
            }
          />
        )}
        {stage && <MetaChip label="Stage" value={stage} />}
        {/* The second counter Marlene and Francois asked for: not how old the
            matter is, but how long it has sat where it is. Toned with the same
            scale as the connector above, so the chip and the line agree.
            Suppressed when it would only repeat the "Open" chip — on a matter
            that has never moved the two numbers are the same number, and two
            chips saying 14 workdays reads as a bug. */}
        {inStage !== null && inStage !== open && (
          <MetaChip
            label="In stage"
            value={`${inStage} workday${inStage === 1 ? "" : "s"}`}
            tone={waitTone === "fresh" ? "neutral" : waitTone === "warn" ? "waiting" : "required"}
          />
        )}
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
