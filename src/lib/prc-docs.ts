// Property Rates Clearance (PRC) — sub-divisions + the RCF per-municipality
// document matrix (Jukka 2026-06-16). The PRC service is code 'RCF'; within it
// the partner picks a sub-division. Only RCF is built in-portal for now.

export interface PrcSubtype {
  code: "RCF" | "RCC" | "RCA";
  label: string;
  inPortal: boolean; // false → show a "contact ConveyClear" notice, block submit
  notice?: string;
}

export const PRC_SUBTYPES: PrcSubtype[] = [
  { code: "RCF", label: "RCF — Rates Clearance Figures", inPortal: true },
  { code: "RCC", label: "RCC — Rates Clearance Certificate", inPortal: true },
  {
    code: "RCA",
    label: "RCA — Rates Clearance Application",
    inPortal: false,
    notice: "Rates Clearance Applications (RCA) are handled directly by ConveyClear due to the complexity of the pipeline. Please contact ConveyClear to proceed.",
  },
];

export interface PrcDocRule {
  docType: string;
  optional?: boolean;
}

// RCF document requirements by municipality. COT lodges via a "memo requested"
// screenshot; COJ/COE via a Clearance Query Issue (CQI) screenshot. Meter
// readings are optional everywhere; the council account statement is required.
export function prcRcfDocs(municipality: string | null): PrcDocRule[] {
  const muni = (municipality ?? "").toUpperCase();
  const lodgementDoc = muni === "COT" ? "memo_screenshot" : "cqi_screenshot";
  return [
    { docType: lodgementDoc },
    { docType: "council_account_statement" },
    { docType: "water_meter_reading", optional: true },
    { docType: "electricity_meter_reading", optional: true },
  ];
}

// Whether COJ-style "Query Reference Number" applies to the referral form.
export function prcNeedsQueryRef(municipality: string | null): boolean {
  return (municipality ?? "").toUpperCase() === "COJ";
}
