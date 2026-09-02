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

import { COUNCILS } from "./councils";

export const TRANSFER_PARTY_ROLES = ["seller", "buyer"] as const;
export type TransferPartyRole = (typeof TRANSFER_PARTY_ROLES)[number];

export interface SupportingDocGroup {
  label: string;
  types: string[];
}

/**
 * The five documents a transfer gathers under its own tiles.
 *
 * Deliberately absent from the dropdown below — each already has a tile with its
 * own upload, and offering them twice made the tiles look optional. Declared
 * here rather than in TransferDocuments.tsx because the completeness check at
 * the bottom of this file has to know what is already covered, and a second copy
 * of this list is exactly the drift 066 is the standing warning about.
 */
export const NAMED_DOC_TYPES = [
  "deed_search",
  "transfer_letter",
  "clearance_figures",
  "proof_of_payment_figures",
  "coc_electrical",
];

/**
 * Grouped for the dropdown. A flat list of a dozen options is a scan; a few
 * short groups is a choice — and the grouping is the one an attorney already has
 * in their head when they pick up the file.
 */
const AUTHORED_GROUPS: SupportingDocGroup[] = [
  {
    label: "Identity & authority",
    types: [
      "id_certified",
      "id_certified_representative",
      "id_certified_trustee",
      "poa",
      "letter_of_authority",
      // The councils' own "LETTER OF AUTHORITY" (CoE's sheet corrects "letter of
      // executor" to it). A separate code from the FICA one on purpose — see
      // COUNCIL_DOC_LABELS.
      "letter_of_authority_council",
      "cor_14_3",
      "cipc_docs",
    ],
  },
  {
    label: "Proof & status",
    types: ["proof_of_address", "tax_clearance"],
  },
  {
    // 🔴 THE STATEMENTS ARE THREE DOCUMENTS, NOT ONE. Zewn, 2026-09-02: "for
    // certificates it just says statement, but when i search statement in the
    // doc upload it gives me municipal account statement only. what about the
    // other types of statements?"
    //
    // The councils ask for a rates account statement and a utilities account
    // statement by name (COT's RCA sheet: "RATES ACC NUMBER / STATEMENT
    // (INVOICE)"), and both were unreachable from this dropdown — so an attorney
    // holding one had to file it as "Municipal Account Statement" or "Other",
    // and the class it landed in came out of a type that was not what they had.
    // Their labels carry the word "Statement" so the search that failed now
    // finds all three.
    label: "Accounts & readings",
    types: [
      "municipal_account",
      "rates_account_invoice",
      "utilities_account_invoice",
      // Split water/electricity on 2026-09-01, both optional — a prepaid meter
      // has nothing to photograph.
      "meter_reading_water",
      "meter_reading_electricity",
    ],
  },
  {
    // 🔴 The offer to purchase was inferred from the transaction rather than
    // named by Jukka. Confirm; the list is one array and a wrong code costs a
    // rename, not a migration, because nothing keys on it.
    label: "The transaction",
    types: ["offer_to_purchase", "consumer_agreement"],
  },
  {
    label: "Anything else",
    types: ["other"],
  },
];

/**
 * Every document type a COUNCIL asks an attorney to bring.
 *
 * The same rule ExpectedDocuments renders from — input and supporting, minus
 * anything the FIRM record autofills — so the two lists cannot disagree about
 * what an attorney is expected to hand over. Outputs are excluded because those
 * are what ConveyClear produces; nobody uploads their own deed search (updated).
 */
function councilExpectedDocTypes(): string[] {
  const out = new Set<string>();
  for (const council of COUNCILS) {
    const specs = [...Object.values(council.services), ...Object.values(council.prc)];
    for (const spec of specs) {
      for (const doc of spec?.documents ?? []) {
        if (doc.owner === "firm" || doc.docClass === "output") continue;
        out.add(doc.type);
      }
    }
  }
  return Array.from(out);
}

/**
 * The authored groups, plus anything a council asks for that they missed.
 *
 * 🔴 THE POINT IS THAT THIS CANNOT FALL BEHIND. "What we normally need" is
 * generated from the council registry; this dropdown was hand-written; so every
 * document added to a council since the list was typed became something the
 * portal told an attorney to bring and then gave them nowhere to put. Zewn,
 * 2026-09-02: "please make sure all the doc types listed in 'what you normally
 * need' are also line items in the 'what is it' doc type section for doc
 * uploads."
 *
 * Curated grouping is still worth having, so the authored list stays and the
 * leftovers are appended under their own heading rather than the whole thing
 * being derived. A new council document lands in "Asked for by a council" until
 * somebody files it properly — visible and usable on the day it is added, which
 * is the half that matters.
 */
function buildGroups(): SupportingDocGroup[] {
  const covered = new Set([...AUTHORED_GROUPS.flatMap((g) => g.types), ...NAMED_DOC_TYPES]);
  const leftovers = councilExpectedDocTypes().filter((t) => !covered.has(t));
  if (leftovers.length === 0) return AUTHORED_GROUPS;

  // Before "Anything else", which stays last: `other` is where you land when
  // nothing fits, so it has to be read after everything that might.
  const head = AUTHORED_GROUPS.slice(0, -1);
  const tail = AUTHORED_GROUPS[AUTHORED_GROUPS.length - 1];
  return [...head, { label: "Asked for by a council", types: leftovers.sort() }, tail];
}

export const SUPPORTING_DOC_GROUPS: SupportingDocGroup[] = buildGroups();

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
