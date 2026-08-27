import { Check } from "lucide-react";

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
}: {
  /** Phase names in order. */
  steps: string[];
  /** 1-indexed current phase. */
  phase: number;
  done?: boolean;
}) {
  if (steps.length === 0) return null;

  // A completed service is past its last phase, not sitting on it.
  const currentIdx = done ? steps.length : Math.max(1, phase) - 1;

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

                  A filled connector is always green, never blue: it can only
                  ever run out of, or into, a phase that is already COMPLETE, so
                  green reads as the distance travelled. Green behind you, blue
                  where you are, grey ahead. */}
              <span
                className={`h-px flex-1 ${i === 0 ? "bg-transparent" : i <= currentIdx ? "bg-ok" : "bg-line"}`}
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
              <span
                className={`h-px flex-1 ${i === steps.length - 1 ? "bg-transparent" : i < currentIdx ? "bg-ok" : "bg-line"}`}
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
