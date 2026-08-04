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
      <span className={`block text-[21px] font-extrabold tracking-[-0.02em] tabular-nums ${toned}`}>
        {value}
      </span>
      <span className="block text-[9.5px] font-bold uppercase tracking-[0.1em] text-ink-3">
        {label}
      </span>
    </>
  );

  const shell =
    "rounded border border-line bg-raised px-3 py-2.5 text-center transition-colors duration-150 ease-out";

  // A tile that filters the list below it should look and behave like a
  // control. A tile that is only a number should not pretend to be one.
  return href ? (
    <a
      href={href}
      className={`${shell} block hover:border-line-strong focus-visible:outline-none
                  focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2
                  focus-visible:ring-offset-canvas`}
    >
      {body}
    </a>
  ) : (
    <div className={shell}>{body}</div>
  );
}
