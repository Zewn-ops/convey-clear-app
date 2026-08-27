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
 * THREE STATES, NOT TWO. Settled is green, running is the action colour, and
 * everything else is a hollow ring. "Being worked" and "nobody has decided"
 * are opposite situations, and a list that showed both as "not done" would hide
 * the difference the checklist exists to make.
 */
export default function ServiceDots({ dots }: { dots: TransferServiceDot[] }) {
  if (dots.length === 0) return null;

  return (
    <ul className="flex flex-wrap items-center gap-1.5" aria-label="Services on this transfer">
      {dots.map((d, i) => {
        const state = d.settled ? "settled" : d.running ? "running" : "open";
        return (
          <li
            key={`${d.name}-${i}`}
            // Title on the element rather than a tooltip component: a list card
            // is not the place to introduce a hover surface, and the accessible
            // name below carries the same information without hover at all.
            title={`${d.name} — ${state === "settled" ? "settled" : state === "running" ? "in progress" : "outstanding"}`}
            className={
              "flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold " +
              (d.settled
                ? "bg-ok text-white"
                : d.running
                  ? "bg-action text-white"
                  : "border border-line bg-transparent")
            }
          >
            <span className="sr-only">
              {d.name} — {state === "settled" ? "settled" : state === "running" ? "in progress" : "outstanding"}
            </span>
            {d.settled && <Check className="h-2.5 w-2.5" strokeWidth={3.5} aria-hidden />}
          </li>
        );
      })}
    </ul>
  );
}
