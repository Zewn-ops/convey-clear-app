import type { Council, CouncilServiceSpec, PrcStage, ServiceCode } from "./types";

/**
 * CITY OF JOHANNESBURG — expressed as a DELTA on City of Ekurhuleni.
 *
 * The entire COJ sheet (notes §4) is three lines:
 *
 *     COJ
 *     "SAME AS CoE"
 *     RCA — (ADD): ATTORNEY CODE, PRACTICE NO.
 *
 * ...plus a short attachment list that CoE already covers.
 *
 * This file is therefore a delta object, not a full council. That is the
 * §5.15 decision made literal: Zewn's own note expresses one council as
 * another council plus two fields, and a config module can say exactly that.
 * A copied page layout could not — it would restate all of CoE and start
 * drifting the first time either council changed.
 *
 * The marked-up COJ clearance application form (notes §4, images 09→06) is the
 * corroborating evidence: it asks for the CoJ Attorney Code and Practice No on
 * page 1, and nothing else CoE does not also ask.
 */
export const COJ_DELTA: {
  identity: Pick<Council, "code" | "municipality" | "name" | "source">;
  firmFields: string[];
  prc: Partial<Record<PrcStage, Partial<CouncilServiceSpec>>>;
  services?: Partial<Record<ServiceCode, Partial<CouncilServiceSpec>>>;
} = {
  identity: {
    code: "COJ",
    municipality: "COJ",
    name: "City of Johannesburg",
    source:
      'Handwritten sheet, 2026-08-31 (notes §4) — literally "same as CoE" ' +
      "plus attorney code and practice no. Portal: eJoburg.",
  },

  /**
   * Both are already on the firm record after 073: `practice_number` on
   * `firms` (national, one per firm) and `attorney_code` on `firm_bp_numbers`
   * (per firm per council, which is the right grain because a council issues
   * it). So COJ's addition costs no new storage — it only means these two
   * become REQUIRED here, and autofill from the firm record (§11.3).
   */
  firmFields: ["practice_number", "attorney_code"],

  prc: {
    RCA: {
      fields: [
        {
          key: "coj_attorney_code",
          label: "CoJ attorney code",
          owner: "firm",
          note: "Autofills from firm_bp_numbers.attorney_code for COJ (073).",
        },
        {
          key: "practice_number",
          label: "Practice number",
          owner: "firm",
          note: "Autofills from firms.practice_number (073).",
        },
      ],
    },
  },
};
