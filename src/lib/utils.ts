import { type ClassValue, clsx } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return inputs.filter(Boolean).join(" ");
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

// Every date in this app is read by people working in one country, so it is
// formatted in one zone — explicitly.
//
// WHY THE ZONE IS PINNED
//   A bare toLocaleString formats in the RUNTIME's zone. Server Components
//   render on Vercel, which runs UTC; client components render on the reader's
//   machine, which is SAST. So one upload showed "13:01" on the approvals queue
//   and "15:01" in the notification about it — two hours apart, neither marked
//   as UTC. Everything server-rendered was two hours early: approvals, transfer
//   requests, enquiry threads, the partner transaction panel.
//
//   Pinning beats forcing these to render on the client: the time a document
//   arrived does not depend on where the reader is sitting, and a conveyancing
//   file is a record before it is a screen.
export const APP_TIME_ZONE = "Africa/Johannesburg";

/** "8 September 2026" — the long form, for a date standing on its own. */
export function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: APP_TIME_ZONE,
  });
}

/** "08 Sept 2026, 13:01" — a date that needs its time: lists, queues, threads. */
export function formatDateTime(dateString: string): string {
  return new Date(dateString).toLocaleString("en-ZA", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: APP_TIME_ZONE,
  });
}

/** "2026/09/08" — the compact form, where the date is a footnote to something else. */
export function formatDateNumeric(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-ZA", { timeZone: APP_TIME_ZONE });
}

/** "2026/09/08, 15:13:36" — the notification feeds, where seconds separate two entries. */
export function formatDateTimeNumeric(dateString: string): string {
  return new Date(dateString).toLocaleString("en-ZA", { timeZone: APP_TIME_ZONE });
}

/** "08 Sept 2026" — between the two, for captions and secondary lines. */
export function formatDateMedium(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: APP_TIME_ZONE,
  });
}

// Spell out a municipality code for display (note 2026-06-22 — no abbreviations
// in the matters subtext). Unknown codes pass through unchanged.
const MUNICIPALITY_NAMES: Record<string, string> = {
  COT: "City of Tshwane",
  COJ: "City of Johannesburg",
  COE: "City of Ekurhuleni",
};
export function municipalityLabel(code?: string | null): string {
  if (!code) return "—";
  return MUNICIPALITY_NAMES[code.toUpperCase()] ?? code;
}

export function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

/**
 * Rands, for display. Returns null when there is no figure, so a caller can
 * tell "not captured" from "zero" — DetailFields renders a missing value as an
 * em dash, and a price of R 0.00 would be a claim rather than a gap (077).
 *
 * en-ZA gives "R 1 250 000,00": a space as the thousands separator and a comma
 * as the decimal mark, which is what a South African conveyancer reads. Cents
 * are dropped, because property prices are quoted whole and two trailing zeroes
 * on every line is noise.
 */
export function formatRands(value?: number | string | null): string | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    maximumFractionDigits: 0,
  }).format(n);
}
