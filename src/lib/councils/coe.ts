import type { Council } from "./types";

/**
 * CITY OF EKURHULENI.
 *
 * Transcribed from Zewn's handwritten CoE sheet, 2026-08-31
 * (NOTES-HANDWRITTEN-2026-08-31.md §3). The most legible and most complete of
 * the three sheets, which is why CoE is the council being built for real first
 * — with all three implemented pipelines being COT, a second council is what
 * shows where the seam between shared shell and council config actually
 * belongs (§5.15, sequencing note).
 *
 * CoE says "SAME AS COT" for its RCF and RCC issue lists and for REF, so those
 * are derived rather than restated — see the bottom of this file.
 */
export const COE: Council = {
  code: "COE",
  municipality: "COE",
  name: "City of Ekurhuleni",
  source: "Handwritten sheet, 2026-08-31 (notes §3). Portal: RCS Ekurhuleni.",
  ratesScope: false,

  firmRequirements: {
    documents: [
      "bank_confirmation_letter",
      "fidelity_fund_certificate",
      "poa_attorneys",
      "poa_address",
    ],
    fields: ["sap_bp_number", "file_owner_name", "file_owner_email"],
    perUserLogin: true,
    notes: [
      'CoE asks for the PoA twice, as two distinct documents: "PoA ' +
        '(ATTORNEYS)" and "PoA (ADDRESS)".',
      'The login line reads "USER\'S ~~CONTACT~~ LOGIN DETAILS (LIST OF ALL ' +
        'STAFF)" — the correction from "contact" to "login" is on the page.',
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
        },
        {
          type: "letter_of_authority",
          docClass: "supporting",
          owner: "seller",
          optional: true,
        },
        { type: "building_plans", docClass: "output", owner: "matter" },
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
        { type: "coc_electrical", docClass: "output", owner: "seller" },
      ],
      fields: [
        {
          key: "contact_details",
          label: "Contact details",
          owner: "seller",
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
        },
      ],
      notes: [
        "Identical in shape to COT's COC block, which is why confidence in " +
          "both transcriptions is higher than for the blocks that appear once.",
      ],
    },

    COO: {
      documents: [
        { type: "transfer_letter", docClass: "input", owner: "matter" },
        {
          type: "deed_search_updated",
          docClass: "output",
          owner: "buyer",
          note: 'Sheet: "DEED SEARCH (UPDATED)".',
        },
        {
          type: "clearance_figures",
          docClass: "input",
          owner: "matter",
          label: "RCF",
          note: "CoE's COO consumes the RCF output directly.",
        },
        {
          type: "proof_of_payment_figures",
          docClass: "input",
          owner: "matter",
          note: 'Sheet: "PoP u RCF".',
        },
        { type: "id_certified", docClass: "supporting", owner: "seller" },
        { type: "id_certified", docClass: "supporting", owner: "buyer" },
        {
          type: "consumer_agreement",
          docClass: "input",
          owner: "buyer",
          note: "The Ekurhuleni water/electricity consumer agreement. Its " +
            "own marked-up form is transcribed in notes §6.",
        },
        {
          type: "poa",
          docClass: "supporting",
          owner: "buyer",
          note: 'Sheet: "PoA (POWER OF ATT. CC) — BUYER".',
        },
      ],
      fields: [
        {
          key: "connection_size",
          label: "Water/electricity connection size",
          owner: "buyer",
          note: 'Sheet: "DEPOSIT BASED ON METER SIZE". The consumer ' +
            "agreement form carries connection sizes in mm and AMP, and the " +
            "deposit is calculated from them — a money consequence the other " +
            "two councils do not have.",
        },
      ],
      notes: [
        "⚠️ Sheet item 9 reads `[?FCOC]` and is still unconfirmed (§12.6).",
      ],
    },

    MAD: {
      documents: [],
      notes: [
        "Council-related catch-all, no fixed document list — see COT's MAD " +
          "note and §11.14.",
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
          note: 'Sheet: "RATES ACCOUNT INVOICE".',
        },
        {
          type: "utilities_account_invoice",
          docClass: "input",
          owner: "seller",
          optional: true,
          note: 'Sheet: "3RD PARTY UTILITY / 2ND U-INVOICE".',
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
        // Split and optional — the same rule as COT (2026-09-01). A prepaid
        // meter has nothing to photograph, and a property can be prepaid on one
        // utility and metered on the other.
        { type: "meter_reading_water", docClass: "input", owner: "seller", optional: true },
        { type: "meter_reading_electricity", docClass: "input", owner: "seller", optional: true },

        // The ATTACHMENTS column, written vertically in orange on the sheet.
        { type: "deed_search", docClass: "input", owner: "seller" },
        {
          type: "letter_of_authority_council",
          docClass: "supporting",
          owner: "seller",
          note: 'Sheet: "LETTER OF ~~EXECUTOR~~ AUTHORITY" — the correction ' +
            "is on the page.",
        },
        {
          type: "municipal_account",
          docClass: "input",
          owner: "seller",
          label: "Statement",
        },
        { type: "offer_to_purchase", docClass: "input", owner: "matter" },
        { type: "id_certified", docClass: "supporting", owner: "buyer" },
        {
          type: "proof_of_address",
          docClass: "supporting",
          owner: "buyer",
          note: 'Sheet: "~~STREET~~ PoA (PROOF OF ADDRESS)".',
        },
      ],
      fields: [
        {
          key: "buyer_contact",
          label: "Buyer name, surname, email and cell",
          owner: "buyer",
          note: "CoE asks markedly LESS of the buyer than COT does — which " +
            "is exactly the kind of difference that justifies per-council " +
            "config rather than one form with conditionals.",
        },
      ],
      notes: [
        '⚠️ "SELLING PRICE" is struck out at the head of the attachments ' +
          "column. Read as a deletion, but unconfirmed (§12.6) — so it is " +
          "absent here rather than present-and-optional.",
      ],
    },

    RCF: {
      documents: [
        // Split and optional — the same rule as COT (2026-09-01). A prepaid
        // meter has nothing to photograph, and a property can be prepaid on one
        // utility and metered on the other.
        { type: "meter_reading_water", docClass: "input", owner: "seller", optional: true },
        { type: "meter_reading_electricity", docClass: "input", owner: "seller", optional: true },
        {
          type: "municipal_account",
          docClass: "input",
          owner: "seller",
          label: "Statement",
        },
      ],
      // Issues are filled from COT below — the sheet literally says so.
    },

    RCC: {
      documents: [
        {
          type: "clearance_figures",
          docClass: "input",
          owner: "matter",
          label: "RCF",
          note: "RCC consumes the RCF output. Zewn (§11.16): the three are " +
            "sequential stages, so this dependency is real rather than " +
            "coincidental.",
        },
        {
          type: "proof_of_payment_figures",
          docClass: "input",
          owner: "matter",
        },
      ],
      notes: [
        '⚠️ Sheet item 3 reads "[?PoP.s]" and is unconfirmed (§12.6).',
      ],
    },
  },
};

/**
 * "SAME AS COT" — applied literally rather than retyped.
 *
 * The CoE sheet writes its RCF and RCC issue lists as the words "SAME AS COT",
 * and its REF block as "SAME AS COT". Copying COT's lists here would let the
 * two drift the moment either changes; referencing them cannot.
 *
 * The one addition is CoE's own: Zewn (§11.23) — "hanging means that the 4th
 * issue is COE portal hanging, taking long or not loading as it should".
 */
export const COE_INHERITS_FROM_COT = {
  services: ["REF"] as const,
  prcIssues: ["RCF", "RCC"] as const,
  extraIssues: ["Council portal hanging or not loading"],
};
