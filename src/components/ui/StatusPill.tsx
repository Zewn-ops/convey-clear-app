import type { ReactNode } from "react";

/**
 * The portal's one status vocabulary. Every page reads from this list rather
 * than inventing its own colour, which is how 68 distinct colour classes got
 * into the codebase in the first place.
 *
 * "required" and "waiting" are the split the portal could not previously
 * express: required means the firm is the blocker, waiting means the council
 * is. They look different because they mean different things to whoever is
 * looking at them.
 */
export type StatusTone = "required" | "waiting" | "ok" | "action" | "danger" | "neutral";

const TONE: Record<StatusTone, string> = {
  // Label colours are solved per fill, not chosen. White on the orange and
  // amber fills is under 3:1 and fails; ink passes on both.
  required: "bg-required-fill text-[#1c2232]",
  waiting: "bg-waiting-fill text-[#1c2232]",
  ok: "bg-ok-fill text-[#1c2232]",
  action: "bg-action-fill text-white",
  danger: "bg-danger-fill text-white",
  neutral: "bg-raised text-ink-2 ring-1 ring-inset ring-line",
};

export default function StatusPill({
  tone = "neutral",
  icon,
  children,
  className = "",
}: {
  tone?: StatusTone;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1
                  text-[12px] font-semibold tracking-[0.01em] ${TONE[tone]} ${className}`}
    >
      {icon}
      {children}
    </span>
  );
}
