// Change-of-Ownership (COO) document matrix — Jukka demo notes 2026-06-16.
//
// COO is a FIXED legal pipeline, so the required-document rules live here in
// typed code (computed from party role + entity_type + municipality) rather than
// in services.config JSONB. The onboard form renders ONE shared section
// (matter-level docs collected once) + one section per party (buyer/seller).

export type CooEntity = "natural_person" | "business" | "trust";

export interface CooDocRule {
  docType: string;
  // optional = "not required" — collected if available, never blocks submission.
  optional?: boolean;
}

// Shared documents — collected ONCE per matter (matter_party_id = null).
export function cooSharedDocs(): CooDocRule[] {
  return [
    { docType: "transfer_letter" }, // TRF Confirmation Letter
    { docType: "deed_search" },
    { docType: "clearance_figures" }, // Clearance figures / existing account
    { docType: "proof_of_payment_figures", optional: true }, // POP for figures — not required
  ];
}

// Per-party documents — conditional on entity type + municipality.
//   • ID (certified) — always
//   • COR 14.3 — business entities · Letter of Authority — trusts
//   • Electrical COC — SELLER only, City of Tshwane (COT) only, optional
export function cooPartyDocs(
  role: string,
  entity: CooEntity,
  municipality: string | null
): CooDocRule[] {
  const out: CooDocRule[] = [{ docType: "id_certified" }];
  if (entity === "business") out.push({ docType: "cor_14_3" });
  else if (entity === "trust") out.push({ docType: "letter_of_authority" });
  if (role === "seller" && (municipality ?? "").toUpperCase() === "COT") {
    out.push({ docType: "coc_electrical", optional: true });
  }
  return out;
}

// Canonical labels for the COO document types (used for auto-renaming files —
// A6 — server/client side without pulling in the client-only DOC_META module).
export const COO_DOC_LABELS: Record<string, string> = {
  transfer_letter: "Transfer Confirmation Letter",
  deed_search: "Deed Search",
  clearance_figures: "Clearance Figures",
  proof_of_payment_figures: "Proof of Payment (Figures)",
  id_certified: "Certified ID",
  cor_14_3: "COR 14.3 Certificate",
  letter_of_authority: "Letter of Authority",
  coc_electrical: "Electrical COC",
};

// Auto-rename a COO upload → "<PARTY OR OWNER NAME>_<Doc Type Label>.<ext>"
// e.g. "QUANTRA (PTY) LTD_Transfer Confirmation Letter.pdf" (A6). Falls back to
// the original name if we can't build a sensible one.
export function cooDocFileName(ownerName: string, docType: string, originalName: string): string {
  const label = COO_DOC_LABELS[docType] ?? docType;
  const owner = (ownerName || "").trim();
  if (!owner) return originalName;
  const dot = originalName.lastIndexOf(".");
  const ext = dot > 0 ? originalName.slice(dot) : "";
  return `${owner}_${label}${ext}`;
}

// Party display order — seller first, then buyer (A3), then the rest.
const ROLE_ORDER: Record<string, number> = { seller: 0, buyer: 1, owner: 2, applicant: 3, other: 4 };
export function partyRoleOrder(role: string): number {
  return ROLE_ORDER[role] ?? 9;
}
