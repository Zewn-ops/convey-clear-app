import type { ReactNode } from "react";

/**
 * A single fact with its label, sized to sit in a row of siblings.
 *
 * The reason this exists: on a slow process, elapsed time is the highest-value
 * thing on the card. "Open 82 workdays" converts anxiety into information, and
 * an attorney who can see it stops phoning to ask.
 */
export default function MetaChip({
  label,
  value,
  tone = "neutral",
  icon,
}: {
  label: string;
  value: ReactNode;
  /**
   * The two SOLID tones are for elapsed time that has gone wrong, and only
   * that. Zewn, 2026-09-18: "make the in stage bubbles full colour with white
   * text — red for the long overdue and orange for the shortly overdue."
   *
   * A tinted chip is a fact; a solid one is a flag. Reserving the solid pair
   * for the two overdue bands is what keeps them loud — a row where several
   * chips are filled has no emphasis left to spend.
   */
  tone?: "neutral" | "waiting" | "required" | "required-solid" | "danger-solid";
  icon?: ReactNode;
}) {
  // No ring: the chips sit on the card they describe, so an outline made each
  // one read as a separate object. They carry the card's own surface colour and
  // lift off it with a shadow instead, which groups them as one row of facts.
  //
  // That shadow is `shadow-chip`, NOT `shadow-sm`. A neutral chip is bg-surface
  // on a bg-surface card, so at 5% opacity there was no visible edge at all —
  // the chips read as loose text. See --cc-shadow-chip in tokens.css.
  const solid = tone === "required-solid" || tone === "danger-solid";
  const toned =
    tone === "danger-solid"
      ? "bg-danger-fill text-white shadow-none"
      : tone === "required-solid"
        ? "bg-required-fill text-white shadow-none"
        : tone === "waiting"
          ? "bg-waiting-tint text-waiting"
          : tone === "required"
            ? "bg-required-tint text-required"
            : "bg-surface text-ink-2";

  // The value is normally forced dark so it reads as the fact on a pale chip.
  // On a solid chip that would put near-black on a strong fill, so it inherits
  // instead. White on #c74d24 is 4.65:1; on #89241e it is 8.99:1.
  const valueClass = solid ? "font-semibold" : "font-semibold text-ink";

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-[13px] font-medium tabular-nums shadow-chip ${toned}`}
    >
      {icon}
      {label} <b className={valueClass}>{value}</b>
    </span>
  );
}
