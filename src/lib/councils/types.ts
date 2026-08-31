/**
 * What varies by council, and what does not.
 *
 * §5.15, decided by Zewn 2026-08-31: **one page shell per portal, composing
 * council-specific sections and config.** Not a page layout per council — ten
 * municipalities across seventeen pages is up to 170 files to keep in step, in
 * a repo that let three portal variants drift apart three times in one week.
 *
 * So the difference lives HERE, as data. What genuinely varies:
 *
 *   · which documents a service requires        → `CouncilServiceSpec.documents`
 *   · which fields the council demands          → `CouncilServiceSpec.fields`
 *   · what goes wrong, in the council's words   → `CouncilServiceSpec.issues`
 *   · what the council asks OF THE FIRM         → `Council.firmRequirements`
 *
 * What does not vary, and therefore is not here: parties, chat, the activity
 * feed, document upload mechanics, permissions, progress display, navigation,
 * page order. Those live once, in the shared shell.
 *
 * Zewn's own note is the argument for this shape: COJ is written as "same as
 * CoE" plus attorney code and practice no. A config module expresses that in a
 * line (see `coj.ts`); a copied page file cannot.
 *
 * ⚠️ SAMPLE SIZE. All three pipelines in `lib/pipelines/` are COT, and this
 * abstraction is drawn from three sheets rather than three implementations.
 * CoE is the one being built for real first, precisely so the seam moves to
 * where the divergence actually is.
 */

import type { PrcSubtype } from "../prc-docs";

/**
 * Input · supporting · output (§11.20).
 *
 * Zewn: "the input deed search is the sellers deed search, the output deed
 * search would be the buyers deed search. buyers deed search is what convey
 * clear produces and seller deed search is what cc receives."
 *
 * So the class is CONTEXTUAL — a property of (document, service, council), not
 * of the document type. That is why it is recorded per requirement below and
 * not as a column on a document-type table.
 */
export const DOC_CLASSES = ["input", "supporting", "output"] as const;
export type DocClass = (typeof DOC_CLASSES)[number];

export const DOC_CLASS_LABELS: Record<DocClass, string> = {
  input: "Input documents",
  supporting: "Supporting documents",
  output: "Output documents",
};

export const DOC_CLASS_HINTS: Record<DocClass, string> = {
  input: "What ConveyClear needs to start this work.",
  supporting: "Identity and verification material.",
  output: "What ConveyClear produces and delivers.",
};

/** Whose document this is. `firm` documents autofill from the firm record. */
export type DocOwner = "seller" | "buyer" | "firm" | "matter";

export interface CouncilDocRequirement {
  /**
   * A code from the SHARED document vocabulary — `coo-docs`, `prc-docs`,
   * `transfer-doc-types` or `client-fica`. New codes are declared in
   * `COUNCIL_DOC_LABELS` below.
   *
   * 066 is the standing warning: a second vocabulary for the same thing
   * silently stops matching. Reuse a code before inventing one.
   */
  type: string;
  docClass: DocClass;
  owner: DocOwner;
  /** Collected when available; never blocks submission. */
  optional?: boolean;
  /** Only when the council names it differently from the shared label. */
  label?: string;
  /** Why it is here, when a reader would otherwise wonder. */
  note?: string;
}

/** A field the council's own portal or form demands. */
export interface CouncilFieldRequirement {
  key: string;
  label: string;
  owner: DocOwner;
  optional?: boolean;
  note?: string;
}

export interface CouncilServiceSpec {
  documents: CouncilDocRequirement[];
  fields?: CouncilFieldRequirement[];
  /**
   * What goes wrong at this council, in the council's vocabulary — a real
   * list from the sheets, not a guess. Drives the issue dropdown.
   */
  issues?: string[];
  notes?: string[];
}

/**
 * The seven services, in the canonical order (§11.1). Identical for every
 * council: the numbering on each handwritten sheet was the order that
 * discussion happened in, not data.
 */
export const SERVICE_ORDER = [
  "EBP",
  "COC",
  "MAD",
  "PRC",
  "COO",
  "REF",
  "OTHER",
] as const;
export type ServiceCode = (typeof SERVICE_ORDER)[number];

/** RCA opens the account, RCF gets the figures, RCC gets the certificate. */
export type PrcStage = PrcSubtype["code"];

/**
 * Rates, utilities, or both (§11.17).
 *
 * COT's sheet: "① R+U  ② U only  ③ R only". Zewn: "most times you just need
 * rates, sometimes you will need utilities aswell but not always." The choice
 * decides which account number and which statement are required, so it is an
 * input that changes the document set.
 */
export const RATES_SCOPES = ["rates", "rates_and_utilities", "utilities"] as const;
export type RatesScope = (typeof RATES_SCOPES)[number];

export const RATES_SCOPE_LABELS: Record<RatesScope, string> = {
  rates: "Rates only",
  rates_and_utilities: "Rates and utilities",
  utilities: "Utilities only",
};

/** What the council asks of the FIRM, once, rather than per transaction. */
export interface CouncilFirmRequirements {
  /** Firm documents — codes from `firm-docs`. */
  documents: string[];
  /** Firm record fields the council names. */
  fields: string[];
  /** Does this council issue the firm a login per staff member? */
  perUserLogin: boolean;
  notes?: string[];
}

export interface Council {
  code: string;
  /** As it appears in `MUNICIPALITIES` (conveyclear-lists.ts). */
  municipality: string;
  name: string;
  firmRequirements: CouncilFirmRequirements;
  services: Partial<Record<ServiceCode, CouncilServiceSpec>>;
  /** PRC is the only service with stages, so it gets its own map. */
  prc: Partial<Record<PrcStage, CouncilServiceSpec>>;
  /** Whether this council asks rates-vs-utilities on a clearance. */
  ratesScope: boolean;
  /** Where this council's spec came from, so a reader can check it. */
  source: string;
}

/**
 * Codes the councils named that the shared vocabulary did not have yet.
 *
 * Kept in one place rather than sprinkled through the council modules.
 * ▶ Phase 5 folds these into `docLabel()`'s chain alongside COO_DOC_LABELS and
 * PRC_DOC_LABELS, so there is one lookup rather than four.
 */
export const COUNCIL_DOC_LABELS: Record<string, string> = {
  rates_account_invoice: "Rates Account Invoice / Statement",
  utilities_account_invoice: "Utilities Account Invoice / Statement",
  meter_readings: "Meter Readings (water and electricity)",
  consumer_agreement: "Consumer Agreement",
  building_plans: "Approved Building Plans",
  deed_search_updated: "Deed Search (updated)",
  bank_confirmation_letter: "Bank Confirmation Letter",
  letter_of_authority_council: "Letter of Authority",
};

/**
 * Build a council as a DELTA on another one.
 *
 * This exists because the notes are written that way — COJ's whole sheet is
 * the words "same as CoE" plus two fields. Expressing that as a derivation
 * keeps the two in step; copying CoE's module would let them drift, which is
 * the failure mode §5.15 was decided to avoid.
 */
export function deriveCouncil(
  base: Council,
  overrides: Partial<Omit<Council, "services" | "prc">> & {
    services?: Partial<Record<ServiceCode, CouncilServiceSpec>>;
    prc?: Partial<Record<PrcStage, CouncilServiceSpec>>;
  }
): Council {
  return {
    ...base,
    ...overrides,
    firmRequirements: overrides.firmRequirements ?? base.firmRequirements,
    services: { ...base.services, ...(overrides.services ?? {}) },
    prc: { ...base.prc, ...(overrides.prc ?? {}) },
  };
}
