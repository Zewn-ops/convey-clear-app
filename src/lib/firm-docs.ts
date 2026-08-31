/**
 * Documents that belong to the FIRM, not to a matter, client or transfer.
 *
 * Both City of Tshwane and City of Ekurhuleni ask a conveyancing firm for the
 * same short list, once, rather than per transaction (handwritten notes
 * 2026-08-31). That is what makes them autofill sources: an attorney should
 * never re-supply the firm's fidelity fund certificate on an RCA when it is
 * already on the firm record.
 *
 * Storage is `firm_documents` + the `firm-documents` bucket (073), which copy
 * the client vault's shape (025) deliberately rather than inventing a fourth
 * document pattern.
 */

export interface FirmDocType {
  code: string;
  label: string;
  /** Which councils name it, for the "why is this here" line in the UI. */
  askedBy: string[];
  hint?: string;
}

export const FIRM_DOC_TYPES: FirmDocType[] = [
  {
    code: "bank_confirmation_letter",
    label: "Bank Confirmation Letter",
    askedBy: ["COT", "COE"],
    hint: "Confirms the firm's trust account. Both councils ask for it by name.",
  },
  {
    code: "fidelity_fund_certificate",
    label: "Fidelity Fund Certificate",
    askedBy: ["COT", "COE"],
    hint: "An expired FFC stops the firm lodging with a council.",
  },
  {
    code: "poa_attorneys",
    label: "Power of Attorney (attorneys)",
    askedBy: ["COT", "COE"],
    hint: "The firm's mandate to act. Distinct from the address PoA below.",
  },
  {
    code: "poa_address",
    label: "Power of Attorney (address)",
    askedBy: ["COE"],
    hint: "City of Ekurhuleni lists this separately from the attorneys' PoA.",
  },
  {
    code: "sla",
    label: "Service Level Agreement",
    askedBy: ["COT"],
    hint: 'Written on the COT sheet as "MORE!! — SLA".',
  },
  {
    code: "popia",
    label: "POPIA Consent",
    askedBy: ["COT"],
    hint: 'Written on the COT sheet as "MORE!! — POPIA".',
  },
];

export const FIRM_DOC_LABELS: Record<string, string> = Object.fromEntries(
  FIRM_DOC_TYPES.map((d) => [d.code, d.label])
);

export function firmDocLabel(code: string): string {
  return FIRM_DOC_LABELS[code] ?? code;
}

/**
 * Firm RECORD fields the councils name, as opposed to documents.
 *
 * ⚠️ Bank details and SAP BP numbers are deliberately absent: they already
 * live in `firm_banking` and `firm_bp_numbers` (037), and `firm_bp_numbers` is
 * per (firm, council) — which is correct, because each council issues its own
 * BP number to the same firm. Adding them to `firms` would have been the 066
 * mistake.
 */
export const FIRM_FIELD_LABELS: Record<string, string> = {
  practice_number: "Practice number",
  ffc_number: "Fidelity Fund Certificate number",
  ffc_expires_on: "FFC expiry",
  file_owner_name: "File owner",
  file_owner_email: "File owner email",
  file_owner_cell: "File owner cell",
  sla_accepted_at: "SLA accepted",
  popia_accepted_at: "POPIA accepted",
};
