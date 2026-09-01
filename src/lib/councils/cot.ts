import type { Council } from "./types";

/**
 * CITY OF TSHWANE.
 *
 * Transcribed from Zewn's handwritten COT sheet, 2026-08-31
 * (NOTES-HANDWRITTEN-2026-08-31.md §2). The sheet numbers its services
 * 1..7 starting at RCA; that numbering is the order the discussion happened
 * in, NOT data — the canonical order is `SERVICE_ORDER`.
 *
 * COT is the only council with pipelines already implemented (`cot-coo`,
 * `cot-rcf`, `cot-rcc`), so it is the best-covered and the most likely to
 * have absorbed assumptions that are really COT's rather than universal.
 */
export const COT: Council = {
  code: "COT",
  municipality: "COT",
  name: "City of Tshwane",
  source: "Handwritten sheet, 2026-08-31 (notes §2). Portal: eTshwane.",
  ratesScope: true,

  firmRequirements: {
    documents: [
      "bank_confirmation_letter",
      "fidelity_fund_certificate",
      "poa_attorneys",
      "sla",
      "popia",
    ],
    fields: [
      "sap_bp_number", // per council — firm_bp_numbers
      "file_owner_name",
      "file_owner_email",
      "file_owner_cell",
    ],
    perUserLogin: true,
    notes: [
      'The sheet ends "MORE!! — SLA — POPIA — ___" with one blank line. ' +
        "Something else was meant to go there and was never written down.",
    ],
  },

  services: {
    EBP: {
      documents: [
        { type: "poa", docClass: "supporting", owner: "seller" },
        {
          type: "municipal_account",
          docClass: "input",
          owner: "seller",
          label: "Statement",
        },
        { type: "id_certified", docClass: "supporting", owner: "seller" },
        {
          type: "cipc_docs",
          docClass: "supporting",
          owner: "seller",
          optional: true,
          note: "Business entities. The sheet reads ID / CIPC / LoA.",
        },
        {
          type: "letter_of_authority",
          docClass: "supporting",
          owner: "seller",
          optional: true,
          note: "Trusts.",
        },
        {
          type: "building_plans",
          docClass: "output",
          owner: "matter",
          note: 'The delivered artefact — the separate EBP note reads "(O) Proof Delivered: PLANS".',
        },
      ],
      notes: [
        "Sheet item 1 reads `PoA (o / cc)` — the parenthetical is unread and " +
          "still open (notes §12.6).",
      ],
    },

    COC: {
      documents: [
        {
          type: "municipal_account",
          docClass: "input",
          owner: "seller",
          label: "Statement",
        },
        {
          type: "coc_electrical",
          docClass: "output",
          owner: "seller",
          note: "The sheet splits (E) into single-phase and 3-phase.",
        },
      ],
      fields: [
        {
          key: "contact_details",
          label: "Contact details (cell and email)",
          owner: "seller",
          note: 'Sheet: "CONTACT DETAILS (C + E)".',
        },
        {
          key: "electrical_phase",
          label: "Electrical: single-phase or 3-phase",
          owner: "seller",
        },
        {
          key: "gas_applicable",
          label: "Gas certificate applicable",
          owner: "seller",
          optional: true,
          note: 'Sheet item 4 is "(G) —" with nothing after the dash.',
        },
      ],
    },

    COO: {
      documents: [
        { type: "transfer_letter", docClass: "input", owner: "matter" },
        {
          type: "deed_search",
          docClass: "input",
          owner: "seller",
          note: "The SELLER's deed search — what ConveyClear receives (§11.20).",
        },
        {
          type: "deed_search_updated",
          docClass: "output",
          owner: "buyer",
          note: "The BUYER's deed search — what ConveyClear produces (§11.20).",
        },
        { type: "clearance_figures", docClass: "input", owner: "matter" },
        {
          type: "proof_of_payment_figures",
          docClass: "input",
          owner: "matter",
        },
        { type: "id_certified", docClass: "supporting", owner: "seller" },
        { type: "id_certified", docClass: "supporting", owner: "buyer" },
        {
          type: "id_certified_representative",
          docClass: "supporting",
          owner: "seller",
          note: 'Sheet: "AUTHORIZED REP" on the seller side. This is the ' +
            "§5.14 representative flag showing up as a council requirement.",
        },
        {
          type: "meter_reading_water",
          docClass: "input",
          owner: "buyer",
          optional: true,
          note: 'Sheet: buyer is "SAME. + READINGS". Optional since 2026-09-01 — a prepaid meter has no reading to photograph.',
        },
        {
          type: "meter_reading_electricity",
          docClass: "input",
          owner: "buyer",
          optional: true,
          note: "Optional — prepaid electricity is common and has no meter to read.",
        },
      ],
    },

    REF: {
      documents: [
        {
          type: "bank_confirmation_letter",
          docClass: "input",
          owner: "firm",
          note: "Autofills from the firm record — the firm's own bank letter.",
        },
        { type: "transfer_letter", docClass: "input", owner: "matter" },
        {
          type: "other",
          docClass: "input",
          owner: "matter",
          label: "Memo",
        },
        {
          type: "proof_of_payment_figures",
          docClass: "input",
          owner: "matter",
          label: "Proof of Payment (memo)",
        },
      ],
    },

    MAD: {
      documents: [],
      notes: [
        "MAD is the council-related catch-all for odd cases — incorrect " +
          "meter readings and the like (Zewn, §11.14). It appears on none " +
          "of the three sheets BY DESIGN: it has no fixed document list. " +
          "`services` has always seeded it as 'Municipal Account Disputes " +
          "(umbrella catchall)'.",
      ],
    },
  },

  prc: {
    RCA: {
      documents: [
        {
          type: "rates_account_invoice",
          docClass: "input",
          owner: "seller",
          note: 'Sheet: "RATES ACC NUMBER / STATEMENT (INVOICE)".',
        },
        {
          type: "utilities_account_invoice",
          docClass: "input",
          owner: "seller",
          optional: true,
          note: "Required only when the rates scope includes utilities (§11.17).",
        },
        { type: "id_certified", docClass: "supporting", owner: "seller" },
        {
          type: "cipc_docs",
          docClass: "supporting",
          owner: "seller",
          optional: true,
        },
        {
          type: "letter_of_authority",
          docClass: "supporting",
          owner: "seller",
          optional: true,
        },
        { type: "deed_search", docClass: "input", owner: "seller" },
        {
          type: "poa",
          docClass: "supporting",
          owner: "firm",
          note: 'Sheet marks this "ATTORNEY\'S?" — autofills from the firm PoA.',
        },
        { type: "meter_reading_water", docClass: "input", owner: "seller", optional: true },
        { type: "meter_reading_electricity", docClass: "input", owner: "seller", optional: true },
      ],
      fields: [
        {
          key: "rates_scope",
          label: "Rates only, utilities only, or both",
          owner: "matter",
          note: 'Sheet: "① R+U  ② U only  ③ R only". Decides which account ' +
            "number and statement above are required.",
        },
        // §5.12 — the eTshwane "Purchaser details" screenshot taped to the COT
        // sheet, field for field, ticks kept and strikes dropped. 080 adds the
        // columns; naming them HERE is what makes them required, and only for
        // a City of Tshwane RCA. The CoE sheet asks markedly less of the buyer,
        // and its config says so by not listing them.
        { key: "title", label: "Title", owner: "buyer" },
        { key: "initials", label: "Initials", owner: "buyer" },
        { key: "nationality", label: "Nationality", owner: "buyer" },
        { key: "id_type", label: "ID type", owner: "buyer" },
        { key: "marital_status", label: "Marital status", owner: "buyer" },
        {
          key: "language",
          label: "Language of communication",
          owner: "buyer",
        },
        { key: "street_number", label: "Street number", owner: "buyer" },
        { key: "street_name", label: "Street name", owner: "buyer" },
        { key: "suburb", label: "Suburb", owner: "buyer" },
        { key: "city", label: "City", owner: "buyer" },
        { key: "postal_code", label: "Postal code", owner: "buyer" },
      ],
      notes: [
        'The sheet strikes out a bare "RATES ACCOUNT NUMBER" bullet and ' +
          "replaces it with the account-number-plus-statement lines.",
        "The buyer's fields come from the eTshwane portal screenshot taped " +
          "to the sheet — see §5.12 and the notes' transcription of it.",
      ],
    },

    RCF: {
      documents: [
        // Statement first: Jukka asked for this order explicitly.
        {
          type: "municipal_account",
          docClass: "input",
          owner: "seller",
          label: "Statement",
        },
        { type: "meter_reading_water", docClass: "input", owner: "seller", optional: true },
        { type: "meter_reading_electricity", docClass: "input", owner: "seller", optional: true },
      ],
      issues: [
        "Journals outstanding",
        "Estimated readings",
        "Billing",
        "Wrong account",
        "Mistake on application",
      ],
      notes: [
        "⚠️ Issues 2 and 5 are transcribed from difficult handwriting and " +
          'are still unconfirmed — "EST. [?READINGS]" and "MISTAKE ON APP. ' +
          '— L.ATT [?]" (notes §12.6).',
      ],
    },

    RCC: {
      documents: [
        {
          type: "other",
          docClass: "input",
          owner: "matter",
          label: "Memo",
        },
        {
          type: "proof_of_payment_figures",
          docClass: "input",
          owner: "matter",
        },
        { type: "meter_reading_water", docClass: "input", owner: "seller", optional: true },
        { type: "meter_reading_electricity", docClass: "input", owner: "seller", optional: true },
      ],
      issues: ["Wrong account", "Credit short", "Estimated"],
      notes: [
        'The sheet groups these as "① ② MEMO + PoP · — 2ND PoP ③ · ' +
          '— READINGS ④".',
      ],
    },
  },
};
