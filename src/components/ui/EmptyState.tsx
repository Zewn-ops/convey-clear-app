import type { ReactNode } from "react";

/**
 * Never dead-end. An empty state says why it is empty and offers the thing that
 * fills it. "No results" on its own is a dead end with punctuation.
 */
export default function EmptyState({
  title,
  children,
  action,
  icon,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-dashed border-line-strong bg-raised px-5 py-7 text-center">
      {icon ? <div className="mb-2 flex justify-center text-ink-3">{icon}</div> : null}
      <p className="text-[14.5px] font-bold text-ink">{title}</p>
      {children ? (
        <p className="mx-auto mt-1 max-w-[38ch] text-[12.5px] text-ink-3">{children}</p>
      ) : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}
