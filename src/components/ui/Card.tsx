import { cn } from "@/lib/utils";

// Role colour-coding (Meeting 1, Tier 3 #13 — Jukka's mapping):
//   client   = green   — sections about the CLIENT: their details, consent, parties
//   firm     = purple  — sections about/shared with the PARTNER FIRM
//   service  = sky     — ConveyClear service work: pipeline, documents, transfers
//   internal = navy    — admin/ConveyClear-only: internal notes, POCs, firm refs
//
// An accented card REPLACES the base border classes rather than adding to them:
// cn() is a string join, not a tailwind-merge, so stacking a second border class
// on top of `border-gray-200` loses the stylesheet-order fight (the vault border
// shipped grey exactly this way, 2026-07-16).
//
// ⚠️ The colour assignments per section are a PROPOSAL pending Jukka's
// confirmation of the mapping (incl. which shade marks a firm admin) — swap
// them here, in one place, when he answers.
export type CardAccent = "client" | "firm" | "service" | "internal";

const accentClasses: Record<CardAccent, string> = {
  client: "border-2 border-emerald-600/40",
  firm: "border-2 border-violet-600/40",
  service: "border-2 border-sky-600/40",
  internal: "border-2 border-[#1B2E6B]/40",
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
        "rounded-xl bg-white shadow-sm",
        accent ? accentClasses[accent] : "border border-gray-200",
        paddingClasses[padding],
        className
      )}
    >
      {children}
    </div>
  );
}
