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

/**
 * Guess a document type, and sometimes a party, from the uploader's filename.
 *
 * A convenience, never an assertion. The uploader sees the result in a control
 * they can change before anything is saved, so a wrong guess costs one click
 * and a right one saves two. That asymmetry is the whole justification — this
 * would not be worth having if it ran after the upload rather than before it.
 *
 * Order matters: the first pattern to match wins, so the specific ones come
 * before the general. "certified id of the representative" must not be caught
 * by the plain `id` rule.
 */
const TYPE_HINTS: { type: string; test: RegExp }[] = [
  { type: "id_certified_representative", test: /\brep(resentative)?\b/i },
  { type: "id_certified_trustee", test: /\btrustee\b/i },
  // No trailing \b on "auth": it has to match inside "authority", where the
  // boundary would fall between two word characters and never fire.
  { type: "letter_of_authority", test: /(\bletter[\s_-]*of[\s_-]*auth|\bloa\b)/i },
  { type: "cor_14_3", test: /\bcor[\s_-]*14/i },
  { type: "cipc_docs", test: /\bcipc\b/i },
  { type: "poa", test: /\b(power[\s_-]*of[\s_-]*attorney|poa)\b/i },
  { type: "proof_of_address", test: /\b(proof[\s_-]*of[\s_-]*(address|residence)|por|utility)\b/i },
  { type: "tax_clearance", test: /\b(tax[\s_-]*clearance|sars)\b/i },
  { type: "offer_to_purchase", test: /\b(offer[\s_-]*to[\s_-]*purchase|otp|sale[\s_-]*agreement)\b/i },
  { type: "municipal_account", test: /\b(municipal|rates[\s_-]*account|statement)\b/i },
  // Last of the type rules: "id" appears inside plenty of words, so it only
  // gets a look once nothing more specific has matched.
  { type: "id_certified", test: /\b(id|identity)\b/i },
];

const PARTY_HINTS: { role: TransferPartyRole; test: RegExp }[] = [
  { role: "seller", test: /\b(seller|vendor|transferor)\b/i },
  { role: "buyer", test: /\b(buyer|purchaser|transferee)\b/i },
];

export function guessFromFileName(fileName: string): {
  type?: string;
  role?: TransferPartyRole;
} {
  // Strip the extension so ".pdf" cannot influence anything, and treat
  // separators as spaces so `seller_id_certified.pdf` reads as three words.
  const stem = fileName.replace(/\.[A-Za-z0-9]{1,8}$/, "").replace(/[_-]+/g, " ");
  return {
    type: TYPE_HINTS.find((h) => h.test.test(stem))?.type,
    role: PARTY_HINTS.find((h) => h.test.test(stem))?.role,
  };
}
