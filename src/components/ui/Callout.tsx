import type { ReactNode } from "react";

/**
 * The one next action on an object, in the user's words rather than the
 * system's. One per card: two primary actions is no primary action.
 *
 * Panels are a background tint plus a coloured label. A thick coloured
 * border-left is banned portal-wide (DESIGN.md) - the tint carries the
 * category, and it survives dark mode where a 4px rule reads muddy.
 */
export default function Callout({
  tone,
  label,
  children,
  action,
}: {
  tone: "required" | "waiting" | "action" | "ok";
  label: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  const toned = {
    required: "bg-required-tint ring-required/20",
    waiting: "bg-waiting-tint ring-waiting/20",
    action: "bg-action-tint ring-action/20",
    ok: "bg-ok-tint ring-ok/20",
  }[tone];

  const labelTone = {
    required: "text-required",
    waiting: "text-waiting",
    action: "text-action",
    ok: "text-ok",
  }[tone];

  return (
    <div className={`rounded-lg px-4 py-3.5 ring-1 ring-inset ${toned}`}>
      <p className={`text-[10.5px] font-semibold uppercase tracking-[0.1em] ${labelTone}`}>
        {label}
      </p>
      <div className="mt-1.5 text-[13.5px] font-medium text-ink-2">{children}</div>
      {action ? <div className="mt-2.5">{action}</div> : null}
    </div>
  );
}
