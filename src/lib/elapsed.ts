/**
 * Elapsed-time helpers.
 *
 * Councils are slow and the portal cannot speed them up. What it can do is say
 * how long something has been running, which turns "why is nothing happening"
 * into a number the firm can quote to their client. On a process measured in
 * months this is the single most useful thing on a card.
 */

/**
 * Working days between a date and now, weekends excluded.
 *
 * Deliberately NOT calendar days: conveyancing deadlines and council SLAs are
 * quoted in working days, so calendar days would not match what an attorney is
 * counting.
 *
 * Public holidays are NOT excluded. South Africa has twelve, plus Sunday-rule
 * carry-overs, and getting that wrong in a number a firm repeats to a client is
 * worse than being consistently weekend-only. Call it "workdays" and mean it.
 */
export function workdaysSince(from: string | Date | null | undefined, to: Date = new Date()): number | null {
  if (!from) return null;
  const start = from instanceof Date ? from : new Date(from);
  if (Number.isNaN(start.getTime())) return null;

  // Normalise both ends to midnight UTC so a matter opened at 23:00 does not
  // read as a day older than one opened at 01:00 the same day.
  const a = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  const b = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  if (b <= a) return 0;

  const DAY = 86_400_000;
  const totalDays = Math.round((b - a) / DAY);
  const fullWeeks = Math.floor(totalDays / 7);
  let days = fullWeeks * 5;

  // Walk the remainder rather than approximating it; the remainder is at most
  // six days, and an off-by-one here is visible on every card.
  let cursor = a + fullWeeks * 7 * DAY;
  while (cursor < b) {
    const dow = new Date(cursor).getUTCDay();
    if (dow !== 0 && dow !== 6) days += 1;
    cursor += DAY;
  }
  return days;
}

/** "3 days ago" / "5 weeks ago" — for a last-updated stamp, not a duration. */
export function relativeDays(from: string | Date | null | undefined, to: Date = new Date()): string | null {
  if (!from) return null;
  const start = from instanceof Date ? from : new Date(from);
  if (Number.isNaN(start.getTime())) return null;

  const days = Math.floor((to.getTime() - start.getTime()) / 86_400_000);
  if (days < 0) return null;
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 21) return `${days} days ago`;
  const weeks = Math.round(days / 7);
  if (weeks < 9) return `${weeks} weeks ago`;
  const months = Math.round(days / 30);
  return months < 24 ? `${months} months ago` : `${Math.round(days / 365)} years ago`;
}

/**
 * How a waiting period should read at a glance.
 *
 * Francois, 2026-09-15, on the connectors between the phase circles: green for
 * the first few days, yellow after a week or two, red past three weeks. Jukka
 * extended it — the line should move through orange on the way, and reset to
 * green the moment the matter advances, so a firm can scroll a list without
 * reading it and see only the rows that have stopped.
 *
 * Thresholds are in WORKDAYS, because the chip beside these circles already
 * says "Open 14 workdays" and two different day-counts on one card is worse
 * than either. The calendar intent maps cleanly: 5 workdays is about a week,
 * 10 about a fortnight, 15 about three weeks.
 *
 * `late` is deliberately not the last band. Jukka wants to distinguish "this is
 * taking longer than usual" from "this is past the 30 days we promised", and a
 * three-colour scale collapses those into one.
 */
export type AgeTone = "fresh" | "warn" | "late" | "overdue";

export const AGE_BANDS = { warn: 5, late: 10, overdue: 15 } as const;

export function ageTone(workdays: number | null | undefined): AgeTone {
  if (workdays === null || workdays === undefined) return "fresh";
  if (workdays > AGE_BANDS.overdue) return "overdue";
  if (workdays > AGE_BANDS.late) return "late";
  if (workdays > AGE_BANDS.warn) return "warn";
  return "fresh";
}
