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

export function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function formatDateTime(dateString: string): string {
  return new Date(dateString).toLocaleString("en-ZA", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
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
