import type { ReactNode } from "react";

export default function StatTile({
  value,
  label,
  tone = "neutral",
  href,
}: {
  value: ReactNode;
  label: string;
  tone?: "neutral" | "required" | "waiting" | "ok";
  href?: string;
}) {
  const toned = {
    neutral: "text-ink",
    required: "text-required",
    waiting: "text-waiting",
    ok: "text-ok",
  }[tone];

  const body = (
    <>
      <span className={`block text-[26px] font-semibold tracking-[-0.025em] tabular-nums ${toned}`}>
        {value}
      </span>
      <span className="block mt-0.5 block text-[10.5px] font-semibold uppercase tracking-[0.09em] text-ink-3">
        {label}
      </span>
    </>
  );

  const shell =
    "rounded-lg bg-surface px-4 py-4 text-center shadow-sm transition-shadow dark:ring-1 dark:ring-line duration-150 ease-out";

  // A tile that filters the list below it should look and behave like a
  // control. A tile that is only a number should not pretend to be one.
  return href ? (
    <a
      href={href}
      className={`${shell} block hover:shadow focus-visible:outline-none
                  focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2
                  focus-visible:ring-offset-canvas`}
    >
      {body}
    </a>
  ) : (
    <div className={shell}>{body}</div>
  );
}
