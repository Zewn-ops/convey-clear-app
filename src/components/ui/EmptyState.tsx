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
    <div className="rounded-lg bg-raised px-6 py-10 ring-1 ring-inset ring-line text-center">
      {icon ? <div className="mb-2 flex justify-center text-ink-3">{icon}</div> : null}
      <p className="text-[17px] font-semibold tracking-[-0.015em] text-ink">{title}</p>
      {children ? (
        <p className="mx-auto mt-2 max-w-[42ch] text-[13.5px] font-medium text-ink-3">{children}</p>
      ) : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}
