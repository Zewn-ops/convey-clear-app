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

/**
 * Display names for the seven codes, beside the order they are declared in.
 *
 * 🔴 THIS LIVES HERE BECAUSE IT DRIFTED. The map was defined twice -- in
 * components/transfers/TransferServices.tsx and again in
 * lib/transfer-service-progress.ts, whose comment said "keep the two in step".
 * 072 renamed four codes (BP→EBP, CERT→COC, RCF→PRC, REFUND→REF) and moved
 * only the first copy, so the progress dots silently fell back to raw codes
 * for exactly those four. Found on production 2026-08-31.
 *
 * That is 066 happening a second time, so the duplicate is gone rather than
 * corrected: this module is plain data with no "use client" and no server
 * imports, so both sides can import it.
 */
export const SERVICE_LABELS: Record<ServiceCode, string> = {
  EBP: "Existing Building Plans",
  COC: "Certificates",
  MAD: "Municipal Account Dispute",
  PRC: "Property Rates Clearance",
  COO: "Change of Ownership",
  REF: "Refund",
  OTHER: "Other",
};

/**
 * Service codes that exist in the `services` TABLE but are not among the seven.
 *
 * The seed (002) created eight service rows — BC, COO, BP, PPM, MAQ, RCF, RCC,
 * MAD — and 072 renamed four of them into the canonical vocabulary. The rest are
 * still there, still selectable by a client on "Request a service", and had no
 * label anywhere: `serviceLabel()` fell through to the raw code, so a client
 * request for pre-paid meters reached staff reading "PPM".
 *
 * Zewn, 2026-09-01: "it DOESNT MATTER IF THERES MORE THAN 6 OR 7 OR 8 JUST MAKE
 * SURE EVERYTHING GETS COVERED."
 *
 * Covered means two things, and this is the first: every code a client can pick
 * renders as words. The second is that the work is representable on a transfer —
 * these are not lines of their own (the checklist instantiates the seven, and
 * adding to that would put a Business Compliance line on every property
 * transfer), so they attach under OTHER, which carries a free-text label for
 * exactly this.
 *
 * ⚠️ RCC and MAQ are LEGACY rows. RCC is now a stage of PRC (072/075), not a
 * service; MAQ predates MAD, which Zewn confirmed is the catch-all for the whole
 * class of account queries. Neither should be offered to new clients — that is a
 * data cleanup on the `services` table, not a code change, so they are labelled
 * here rather than pretended away.
 */
export const NON_TRANSFER_SERVICE_LABELS: Record<string, string> = {
  BC: "Business Compliance",
  PPM: "Pre-Paid Meter Conversion",
  MAQ: "Municipal Account Query (legacy — use Municipal Account Dispute)",
  RCC: "Rates Clearance Certificate (legacy — now a stage of Property Rates Clearance)",
};

/**
 * The label for a code that came out of the database, where it is nullable and
 * typed `string`. Returns the raw code for anything unrecognised, so a service
 * added in SQL before it is added here still renders as itself rather than as
 * a blank or a crash.
 */
export function serviceLabel(code: string | null | undefined): string {
  if (!code) return "Service";
  return SERVICE_LABELS[code as ServiceCode] ?? NON_TRANSFER_SERVICE_LABELS[code.toUpperCase()] ?? code;
}

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
  // 🔴 SPLIT 2026-09-01, and both are OPTIONAL. Jukka: "meter readings you must
  // split … water and electricity meter", and separately "it's not a
  // requirement because sometimes the electricity is prepaid. So you can't take
  // pictures of that because there's no meter." Zewn: "even water you can get
  // prepaid water" — Jukka: "exactly, so you have to make it optional." One
  // combined slot could not express a property with prepaid electricity and a
  // real water meter, which is the ordinary case they were describing.
  meter_reading_water: "Water Meter Reading",
  meter_reading_electricity: "Electricity Meter Reading",
  // Kept for rows filed before the split. Nothing is backfilled: which meter a
  // historic photograph shows is not knowable from the row.
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
