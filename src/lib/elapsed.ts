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
