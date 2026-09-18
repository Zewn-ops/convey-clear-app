import { Check, Plus } from "lucide-react";
import type { TransferServiceDot } from "@/lib/transfer-service-progress";

/**
 * One circle per CHOSEN service on a transfer, for LIST cards.
 *
 * Zewn, 2026-08-28: *"i want to see the progress circles on the overview pages
 * aswell, all 3 so the main overview page then the prop trfs list and matters
 * list pages."*
 *
 * WHY THESE ARE NOT THE SAME CIRCLES AS EVERYWHERE ELSE
 *   `ServiceSteps` draws one circle per PHASE of one pipeline. That works on the
 *   matters list, where a card is one matter with one pipeline. A transfer has
 *   no pipeline of its own — it has its services, each with their own — so the
 *   equivalent would be several steppers stacked on a list card, four cards
 *   deep. That is not a summary, it is the detail page with worse spacing.
 *
 *   So a transfer's circles are one per SERVICE, answering "how much of this
 *   transaction is settled" at the altitude a list actually works at. The
 *   stepper is still there on the detail page, where there is room for it.
 *
 * ── FOUR STATES (Zewn, 2026-09-11) ──────────────────────────────────────────
 *
 *   AMBER + "+"     chosen, but nobody has opened it as a matter yet
 *   amber filled    in progress — a matter is open and moving
 *   ORANGE + "!"    the attorney has to attend to it (Documents Outstanding)
 *   green + tick    done — settled, already done, or not applicable
 *
 * ── "+" MEANS ADD, "!" MEANS WRONG (2026-09-18) ────────────────────────────
 *
 * These two shared an exclamation mark until 2026-09-18, on the reasoning that
 * both mean "the ball is in the firm's court" and so belong to one alphabet.
 * That was half right and the wrong half mattered: they were then separated by
 * HUE ALONE at 16px — amber against required orange, which measure 1.81 against
 * each other — and adjacent in meaning is not the same as interchangeable.
 * "Add the details for a service you asked for" and "we are waiting on
 * documents before we can start" want different actions from the reader.
 *
 * The glyph now carries the difference, which is the one axis no colour choice
 * can buy: it survives greyscale, colour deficiency and a 16px circle. Marlene's
 * own words for this flow were "they click the plus button".
 *
 * His words: *"amber circle for service chosen, amber dot (filled in) for
 * service being dealt with / in progress, yellow with an exclimation mark if the
 * attorneys need to attend to it and green with a tick if it is done."*
 *
 * The alert state is the same fact that leads to a rejection, which is the
 * point: *"this is just to try and teach the attorneys to upload all the docs we
 * need in one go."* The circle warns before anyone has to reject.
 *
 * 🔴 THE GREY RING IS GONE, and that is half the change. It meant "nobody has
 * decided about this service", and since the same day an undecided line is not
 * on the circle list at all — only chosen services get a circle. A state that
 * can no longer occur is worse than no state: it is a shape a reader learns and
 * then never sees.
 *
 * 🔴 WHY THE ALERT IS `required` ORANGE AND NOT A YELLOW
 *   Amber (#ad6200) and a yellow are the same colour at 16px to anyone not
 *   comparing them side by side, and this state has to read as a different KIND
 *   of thing rather than a shade of the one beside it. `required` (#c74d24) is
 *   the token this design system already uses for a missing required document,
 *   which is exactly what the state means. The "!" carries it for anyone who
 *   cannot separate the two hues at all — the shape is the signal and the colour
 *   reinforces it, never the other way round.
 *
 * The alert ranks ABOVE in-progress: a stuck matter and a moving matter both
 * have an open matter, and only one of them is asking the reader for something.
 */
export default function ServiceDots({ dots }: { dots: TransferServiceDot[] }) {
  if (dots.length === 0) return null;

  return (
    <ul className="flex flex-wrap items-center gap-1.5" aria-label="Services on this transfer">
      {dots.map((d, i) => {
        const state = d.settled
          ? "settled"
          : d.attention
            ? "attention"
            : d.running
              ? "running"
              : "chosen";
        const wording = {
          settled: "settled",
          attention: "needs the firm's attention — documents outstanding",
          running: "in progress",
          chosen: "add service details — not opened as a matter yet",
        }[state];
        const tone = {
          settled: "bg-ok text-white",
          attention: "bg-required text-white",
          // 🔴 THE FILL TOKEN, NOT THE TEXT ONE. These read `bg-waiting` until
          // 2026-09-18, which was fine while --cc-waiting and --cc-waiting-fill
          // were the same value. The colour work that morning split them: the
          // text token went DARKER so it could clear 4.5:1 on white, and the
          // circles came along with it and turned brown. A circle is a fill;
          // it takes the fill token and dark ink on top.
          running: "bg-waiting-fill text-white",
          // 🔴 WAS A HOLLOW AMBER RING until 2026-09-15. Zewn: "we should have
          // it that there is a yellow circle with a ! inside once they choose a
          // service so they know they need to create the matter for that
          // service." A ring said "chosen" and stopped there; the service then
          // sat untouched because nothing asked anyone for the next thing.
          chosen: "bg-waiting-fill text-white",
        }[state];
        return (
          <li
            key={`${d.name}-${i}`}
            // Title on the element rather than a tooltip component: a list card
            // is not the place to introduce a hover surface, and the accessible
            // name below carries the same information without hover at all.
            title={`${d.name} — ${wording}`}
            className={
              "flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold leading-none " +
              tone
            }
          >
            <span className="sr-only">
              {d.name} — {wording}
            </span>
            {state === "settled" && <Check className="h-2.5 w-2.5" strokeWidth={3.5} aria-hidden />}
            {/* A glyph, not an icon: lucide's AlertCircle draws its own ring
                inside the circle, which at this size reads as a doughnut. */}
            {state === "attention" && <span aria-hidden>!</span>}
            {/* A PLUS, NOT A SECOND EXCLAMATION MARK (2026-09-18).
            
                Both states mean the ball is in the firm's court, so they shared
                a glyph and were separated by hue alone — amber against required
                orange, which measures 1.81 against each other. Adjacent in
                meaning is not the same as interchangeable: "add the details for
                a service you asked for" and "we are waiting on documents before
                we can work" want different actions.
            
                A plus says ADD at a glance and needs no colour to do it, which
                is the one axis a hue choice cannot buy. Marlene's own words for
                this flow were "they click the plus button".
            
                The "!" now means exactly one thing: something is wrong. */}
            {/* A drawn icon, not a "+" character. At 9px a text plus has
                hairline strokes and reads as a smudge inside a 16px circle —
                the tick beside it works precisely because it is an icon with a
                heavy stroke, so the plus gets the same treatment and a touch
                more size. */}
            {state === "chosen" && <Plus className="h-3 w-3" strokeWidth={4} aria-hidden />}
          </li>
        );
      })}
    </ul>
  );
}
