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
  tone?: "neutral" | "waiting" | "required";
  icon?: ReactNode;
}) {
  // No ring: the chips sit on the card they describe, so an outline made each
  // one read as a separate object. They carry the card's own surface colour and
  // lift off it with a shadow instead, which groups them as one row of facts.
  //
  // That shadow is `shadow-chip`, NOT `shadow-sm`. A neutral chip is bg-surface
  // on a bg-surface card, so at 5% opacity there was no visible edge at all —
  // the chips read as loose text. See --cc-shadow-chip in tokens.css.
  const toned =
    tone === "waiting"
      ? "bg-waiting-tint text-waiting"
      : tone === "required"
        ? "bg-required-tint text-required"
        : "bg-surface text-ink-2";

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-[13px] font-medium tabular-nums shadow-chip ${toned}`}
    >
      {icon}
      {label} <b className="font-semibold text-ink">{value}</b>
    </span>
  );
}
