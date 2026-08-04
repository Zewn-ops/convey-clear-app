import type { ReactNode } from "react";

/**
 * The portal's one table shell. Tables are for lists you scan — clients, firms,
 * council contacts — while matters and transfers get cards, where the anxiety is.
 *
 * Wide tables scroll inside their own container so the page body never scrolls
 * sideways on a phone.
 */

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-lg bg-surface shadow dark:ring-1 dark:ring-line">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">{children}</table>
      </div>
    </div>
  );
}

export function THead({ children }: { children: ReactNode }) {
  return (
    <thead>
      <tr className="border-b border-line">{children}</tr>
    </thead>
  );
}

export function TH({
  children,
  hideBelow,
  align = "left",
}: {
  children?: ReactNode;
  /** Drop the column below this breakpoint rather than letting the table squash. */
  hideBelow?: "md" | "lg";
  align?: "left" | "right";
}) {
  const hide = hideBelow === "md" ? "hidden md:table-cell" : hideBelow === "lg" ? "hidden lg:table-cell" : "";
  return (
    <th
      className={`px-5 py-3 text-${align} text-[10.5px] font-semibold uppercase tracking-[0.09em] text-ink-3 ${hide}`}
    >
      {children}
    </th>
  );
}

export function TBody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-line">{children}</tbody>;
}

export function TR({ children }: { children: ReactNode }) {
  return (
    <tr className="transition-colors duration-150 ease-out hover:bg-raised">{children}</tr>
  );
}

export function TD({
  children,
  hideBelow,
  strong,
  align = "left",
  colSpan,
}: {
  children?: ReactNode;
  hideBelow?: "md" | "lg";
  strong?: boolean;
  align?: "left" | "right";
  colSpan?: number;
}) {
  const hide = hideBelow === "md" ? "hidden md:table-cell" : hideBelow === "lg" ? "hidden lg:table-cell" : "";
  return (
    <td
      colSpan={colSpan}
      className={`px-5 py-4 text-${align} ${strong ? "font-semibold text-ink" : "font-medium text-ink-2"} ${hide}`}
    >
      {children}
    </td>
  );
}

/** Full-width row for an empty result, so a table never dead-ends on "none". */
export function TEmpty({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-5 py-10 text-center text-[13px] text-ink-3">
        {children}
      </td>
    </tr>
  );
}
