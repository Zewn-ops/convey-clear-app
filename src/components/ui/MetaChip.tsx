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
  const toned =
    tone === "waiting"
      ? "ring-waiting/25 bg-waiting-tint text-waiting"
      : tone === "required"
        ? "ring-required/25 bg-required-tint text-required"
        : "ring-line/70 bg-raised text-ink-2";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1.5 text-[12px] font-medium tabular-nums ring-1 ring-inset ${toned}`}
    >
      {icon}
      {label} <b className="font-semibold text-ink">{value}</b>
    </span>
  );
}
