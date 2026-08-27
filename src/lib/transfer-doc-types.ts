/**
 * Supporting documents on a property transfer — what they can be, and whose.
 *
 * The five NAMED transfer documents (deed search, transfer confirmation letter,
 * clearance figures, proof of payment, electrical COC) are not here. They have
 * their own tiles and their own counter; offering them again in this dropdown is
 * what made the tiles look optional. One route in per document.
 *
 * Everything else an attorney puts on a transaction lands here. The codes are
 * deliberately the SAME ones the client FICA vault uses (`lib/client-fica.ts`),
 * so a certified ID uploaded straight onto the transfer and one pulled from a
 * vault read identically in the list, sort together, and could later be
 * reconciled without a translation table. Migration 066 is the argument for
 * this: a second vocabulary for the same things silently stopped matching.
 */

export const TRANSFER_PARTY_ROLES = ["seller", "buyer"] as const;
export type TransferPartyRole = (typeof TRANSFER_PARTY_ROLES)[number];

export interface SupportingDocGroup {
  label: string;
  types: string[];
}

/**
 * Grouped for the dropdown. A flat list of a dozen options is a scan; four short
 * groups is a choice — and the grouping is the one an attorney already has in
 * their head when they pick up the file.
 */
export const SUPPORTING_DOC_GROUPS: SupportingDocGroup[] = [
  {
    label: "Identity & authority",
    types: [
      "id_certified",
      "id_certified_representative",
      "id_certified_trustee",
      "poa",
      "letter_of_authority",
      "cor_14_3",
      "cipc_docs",
    ],
  },
  {
    label: "Proof & status",
    types: ["proof_of_address", "tax_clearance"],
  },
  {
    // 🔴 Inferred from the transaction, not from Jukka. Every transfer has an
    // offer to purchase, and a municipal account statement is what a MAD and a
    // rates clearance are both about — but neither was named in a meeting.
    // Confirm, and add whatever else he actually files here; the list is one
    // array, and a code that turns out to be wrong costs a rename, not a
    // migration, because nothing keys on it.
    label: "The transaction",
    types: ["offer_to_purchase", "municipal_account"],
  },
  {
    label: "Anything else",
    types: ["other"],
  },
];

export const SUPPORTING_DOC_TYPES: string[] = SUPPORTING_DOC_GROUPS.flatMap((g) => g.types);

/**
 * Labels for the codes `coo-docs` and `prc-docs` do not already carry.
 *
 * `docLabel()` chains through this map, so these names appear everywhere a
 * document is shown — the list, the archived drawer, the canonical file name —
 * rather than only in the dropdown that created them. Without it `poa` renders
 * as "Poa" and `proof_of_address` as "Proof Of Address".
 */
export const TRANSFER_DOC_LABELS: Record<string, string> = {
  poa: "Power of Attorney",
  proof_of_address: "Proof of Address / Residence",
  tax_clearance: "Tax Clearance",
  offer_to_purchase: "Offer to Purchase",
  municipal_account: "Municipal Account Statement",
  other: "Other",
  // Retired by migration 067 — kept so any row that predates the migration on an
  // un-migrated environment still reads as words rather than as a raw code.
  seller_document: "Seller Document",
  buyer_document: "Buyer Document",
};

/** "Seller" / "Buyer" — and a name where the transfer knows one. */
export function partyRoleLabel(
  role: string | null | undefined,
  names?: { seller?: string | null; buyer?: string | null }
): string {
  if (role !== "seller" && role !== "buyer") return "Not party-specific";
  const title = role === "seller" ? "Seller" : "Buyer";
  const name = role === "seller" ? names?.seller : names?.buyer;
  return name ? `${title} · ${name}` : title;
}

export function isTransferPartyRole(value: unknown): value is TransferPartyRole {
  return value === "seller" || value === "buyer";
}
