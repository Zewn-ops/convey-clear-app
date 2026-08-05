import { cn } from "@/lib/utils";

// Role colour-coding (Meeting 1, Tier 3 #13 — Jukka's mapping):
//   client   = green   — sections about the CLIENT: their details, consent, parties
//   firm     = purple  — sections about/shared with the PARTNER FIRM
//   service  = sky     — ConveyClear service work: pipeline, documents, transfers
//   internal = navy    — admin/ConveyClear-only: internal notes, POCs, firm refs
//
// An accented card REPLACES the base border classes rather than adding to them:
// cn() is a string join, not a tailwind-merge, so stacking a second border class
// on top of `border-line` loses the stylesheet-order fight (the vault border
// shipped grey exactly this way, 2026-07-16).
//
// ⚠️ The colour assignments per section are a PROPOSAL pending Jukka's
// confirmation of the mapping (incl. which shade marks a firm admin) — swap
// them here, in one place, when he answers.
export type CardAccent = "client" | "firm" | "service" | "internal";

// Accents are a tint plus a shadow now, not an outline. Borders are reserved
// for the cases where they carry meaning (form controls, table rules); a card
// is an object and lifts off the page instead of being drawn on it.
//
// ⚠️ Dark mode still keeps a hairline, and that is not an oversight: a shadow
// against #171b24 reads as mud rather than as elevation, so the surface steps
// lighter than the canvas and holds a 1px ring to find its edge. Removing that
// ring makes every card in dark mode edgeless.
const accentClasses: Record<CardAccent, string> = {
  client: "bg-emerald-500/[0.04] dark:ring-1 dark:ring-emerald-400/25",
  firm: "bg-violet-500/[0.04] dark:ring-1 dark:ring-violet-400/25",
  service: "bg-sky-500/[0.04] dark:ring-1 dark:ring-sky-400/25",
  internal: "dark:ring-1 dark:ring-line",
};

interface CardProps {
  children: React.ReactNode;
  className?: string;
  padding?: "none" | "sm" | "md" | "lg";
  accent?: CardAccent;
}

const paddingClasses = {
  none: "",
  sm: "p-4",
  md: "p-6",
  lg: "p-8",
};

export default function Card({
  children,
  className,
  padding = "md",
  accent,
}: CardProps) {
  return (
    <div
      className={cn(
        "rounded-lg bg-surface shadow",
        accent ? accentClasses[accent] : "dark:ring-1 dark:ring-line",
        paddingClasses[padding],
        className
      )}
    >
      {children}
    </div>
  );
}
