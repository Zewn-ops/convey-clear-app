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
    required: "bg-required-tint border-required/25",
    waiting: "bg-waiting-tint border-waiting/25",
    action: "bg-action-tint border-action/25",
    ok: "bg-ok-tint border-ok/25",
  }[tone];

  const labelTone = {
    required: "text-required",
    waiting: "text-waiting",
    action: "text-action",
    ok: "text-ok",
  }[tone];

  return (
    <div className={`rounded border px-3.5 py-3 ${toned}`}>
      <p className={`text-[10px] font-bold uppercase tracking-[0.11em] ${labelTone}`}>
        {label}
      </p>
      <div className="mt-1 text-[13px] text-ink-2">{children}</div>
      {action ? <div className="mt-2.5">{action}</div> : null}
    </div>
  );
}
