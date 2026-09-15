import { Check } from "lucide-react";
import type { AgeTone } from "@/lib/elapsed";

/**
 * Green → yellow → orange → red, as Jukka described it. These are the semantic
 * tokens, not raw colours, so the scale resolves correctly in dark mode without
 * a `dark:` variant at this call site.
 */
const AGE_TONE_CLASS: Record<AgeTone, string> = {
  fresh: "bg-ok",
  warn: "bg-waiting-fill",
  late: "bg-required-fill",
  overdue: "bg-danger-fill",
};

/**
 * The numbered phase circles for ONE service line on a property transfer.
 *
 * Zewn, 2026-08-27: the phase circles from the matter detail page, above the
 * per-service bar, under each service on the property-transfer page.
 *
 * WHY NOT PipelineProgress ITSELF — it is the right picture at the wrong size,
 * and in the wrong place:
 *
 *   1. It takes a `Pipeline` object. A transfer page renders seven service
 *      lines, so passing pipelines down would pull every pipeline definition
 *      into the client bundle — the one thing transfer-service-progress.ts
 *      exists to prevent. This takes the phase names as plain strings, already
 *      derived on the server.
 *   2. It also renders the current phase's STAGE list in a raised panel. Once
 *      per matter that is the detail you came for; seven times down a transfer
 *      page it buries the thing the page is actually for.
 *   3. Its circles are 36px with 11px labels beneath, sized to be the primary
 *      element on a page. Here the primary element is the service line.
 *
 * So: the same visual language — numbered circles, green check for done, filled
 * for current, connected by a rule — at a size that reads as a detail of the
 * line above it rather than competing with it.
 *
 * The bar stays. The circles say WHICH phases exist and which one we are in;
 * the bar says how far through. On a process measured in months, "phase 3 of 4"
 * and "these are the four" answer different questions.
 */
export default function ServiceSteps({
  steps,
  phase,
  done = false,
  ageTone = "fresh",
}: {
  /** Phase names in order. */
  steps: string[];
  /** 1-indexed current phase. */
  phase: number;
  done?: boolean;
  /**
   * How long this matter has sat where it is. Colours the connector RUNNING
   * INTO the current circle — the one segment that represents the wait nobody
   * has ended yet. Everything behind it stays green (distance travelled) and
   * everything ahead stays grey.
   *
   * Francois asked for this on 2026-09-15 so a firm can scroll a list and see
   * the stuck rows without reading any of them. Omit it and the connector is
   * green, which is what every screen did before.
   */
  ageTone?: AgeTone;
}) {
  if (steps.length === 0) return null;

  // A completed service is past its last phase, not sitting on it.
  const currentIdx = done ? steps.length : Math.max(1, phase) - 1;

  // The active connector is the only one that can be anything but green. A
  // finished service has no active wait, so it keeps the full green rail.
  const waitClass = done ? "bg-ok" : AGE_TONE_CLASS[ageTone];

  return (
    <ol className="flex items-start" aria-label={`Phase ${phase} of ${steps.length}`}>
      {steps.map((name, i) => {
        const isDone = i < currentIdx;
        const isActive = i === currentIdx;
        return (
          <li key={`${name}-${i}`} className="flex min-w-0 flex-1 flex-col items-center text-center">
            <div className="flex w-full items-center">
              {/* Connectors are half-width rules either side of the circle, so
                  the line meets the circle instead of running under it. The
                  first and last are invisible rather than absent — a missing
                  element would shift its circle out of alignment with the rest.

                  A filled connector behind the current phase is always green,
                  never blue: it ran out of a phase that is already COMPLETE, so
                  green reads as the distance travelled. Green behind you, blue
                  where you are, grey ahead.

                  The exception is the segment arriving AT the current circle
                  (i === currentIdx). That one is not distance travelled — it is
                  the wait in progress — so it carries the age colour, and turns
                  green again the moment the matter advances and it becomes
                  history like the rest. 3px rather than 1px: Jukka, 2026-09-15,
                  against the 8px phase bar directly beneath it. */}
              <span
                className={`h-[3px] flex-1 rounded-full ${
                  i === 0 ? "bg-transparent" : i <= currentIdx ? "bg-ok" : "bg-line"
                }`}
              />
              <span
                className={
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold " +
                  (isDone
                    ? "bg-ok text-white"
                    : isActive
                      ? "bg-action text-white"
                      : "bg-line text-ink-3")
                }
              >
                {isDone ? <Check className="h-3 w-3" strokeWidth={3} /> : i + 1}
              </span>
              {/* 🔴 THE WAIT IS THE SEGMENT LEAVING THE ACTIVE CIRCLE, NOT THE
                  ONE ARRIVING AT IT.
                  
                  It was the arriving one for four hours on 2026-09-15, and that
                  is invisible at phase 1 — the first cell's left connector is
                  transparent by design, because nothing precedes it. On
                  production that hid the colour on 26 of 32 matters, every one
                  of them sitting at New Instruction. It compiled, deployed and
                  did nothing.
                  
                  Leaving also reads better: green is the distance travelled,
                  and the coloured stub is the road not yet taken — how long we
                  have stood here before the next step. */}
              <span
                className={`h-[3px] flex-1 rounded-full ${
                  i === steps.length - 1
                    ? "bg-transparent"
                    : i === currentIdx
                      ? waitClass
                      : i < currentIdx
                        ? "bg-ok"
                        : "bg-line"
                }`}
              />
            </div>
            {/* Names wrap rather than truncate. A phase called "Council
                submission" clipped to "Council su…" costs the reader the word
                that distinguishes it from the phase before. */}
            <span
              className={
                "mt-1 px-1 text-[10px] leading-tight " +
                (isActive ? "font-semibold text-action" : isDone ? "text-ink-3" : "text-ink-3")
              }
            >
              {name}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
