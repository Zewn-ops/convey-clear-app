"use client";

import { useRouter } from "next/navigation";

// Makes the whole clients-list row open the client, not just the "View" link.
// The name stays a real <a> inside it, so cmd/middle-click still opens a new tab
// and screen readers still announce a link — an onClick-only row gives up both.
export default function ClientRow({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  const router = useRouter();

  return (
    <tr
      onClick={(e) => {
        // Don't hijack a click that was already on a link/button inside the row.
        if ((e.target as HTMLElement).closest("a,button")) return;
        router.push(href);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          router.push(href);
        }
      }}
      tabIndex={0}
      className="cursor-pointer transition-colors hover:bg-raised focus:bg-raised focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-action"
    >
      {children}
    </tr>
  );
}
