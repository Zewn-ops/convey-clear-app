import { Check } from "lucide-react";
import type { TransferServiceDot } from "@/lib/transfer-service-progress";

/**
 * One circle per service on a transfer, for LIST cards.
 *
 * Zewn, 2026-08-28: *"i want to see the progress circles on the overview pages
 * aswell, all 3 so the main overview page then the prop trfs list and matters
 * list pages."*
 *
 * WHY THESE ARE NOT THE SAME CIRCLES AS EVERYWHERE ELSE
 *   `ServiceSteps` draws one circle per PHASE of one pipeline. That works on the
 *   matters list, where a card is one matter with one pipeline. A transfer has
 *   no pipeline of its own — it has seven services, each with their own — so the
 *   equivalent would be seven steppers stacked on a list card, four cards deep.
 *   That is not a summary, it is the detail page with worse spacing.
 *
 *   So a transfer's circles are one per SERVICE: seven dots answering "how much
 *   of this transaction is settled", at the altitude a list actually works at.
 *   The stepper is still there on the detail page, where there is room for it.
 *
 * FOUR STATES, NOT TWO.
 *
 *   green check   settled — done, already done, or not applicable
 *   yellow solid  needed, and a matter is open against it
 *   yellow ring   needed, no matter yet — somebody has said this must happen
 *   grey ring     nobody has decided about this service
 *
 * The two yellows are Zewn's, 2026-09-01: "can we get yellow circles for the
 * items that are marked as needs to be done so we know whats in an active state
 * of trying to complete the service." A marked-but-not-started line used to draw
 * the same hollow grey ring as a line nobody had looked at, which are the two
 * most different states on the checklist. Yellow now means "this transaction
 * needs this", and the fill says whether the work has actually begun.
 */
export default function ServiceDots({ dots }: { dots: TransferServiceDot[] }) {
  if (dots.length === 0) return null;

  return (
    <ul className="flex flex-wrap items-center gap-1.5" aria-label="Services on this transfer">
      {dots.map((d, i) => {
        const state = d.settled ? "settled" : d.running ? "running" : d.needed ? "needed" : "open";
        const wording =
          state === "settled"
            ? "settled"
            : state === "running"
              ? "in progress"
              : state === "needed"
                ? "needed — not started"
                : "not specified";
        return (
          <li
            key={`${d.name}-${i}`}
            // Title on the element rather than a tooltip component: a list card
            // is not the place to introduce a hover surface, and the accessible
            // name below carries the same information without hover at all.
            title={`${d.name} — ${wording}`}
            className={
              "flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold " +
              (d.settled
                ? "bg-ok text-white"
                : d.running
                  ? "bg-waiting text-white"
                  : d.needed
                    ? "border-2 border-waiting bg-transparent"
                    : "border border-line bg-transparent")
            }
          >
            <span className="sr-only">
              {d.name} — {wording}
            </span>
            {d.settled && <Check className="h-2.5 w-2.5" strokeWidth={3.5} aria-hidden />}
          </li>
        );
      })}
    </ul>
  );
}
