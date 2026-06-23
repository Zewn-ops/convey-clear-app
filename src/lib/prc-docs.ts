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

// RCF/RCC document requirements — from the Rates Clearance SOP, Email Template 1
// ("Document Request to Conveyancer"). The conveyancer uploads the SELLER's
// FICA/CIPC (always) plus, where applicable, Proof of Application (applied but no
// figures yet) and/or Proof of Payment for the figures (paid but no certificate).
// Property description + municipal account number are captured as referral FIELDS,
// not uploads. FICA varies by the seller's entity type.
export function prcRcfDocs(sellerEntityType?: string | null): PrcDocRule[] {
  const et = (sellerEntityType ?? "natural_person").toLowerCase();
  const ficaDocs: PrcDocRule[] =
    et === "business"
      ? [{ docType: "cipc_docs" }, { docType: "id_certified_representative" }]
      : et === "trust"
      ? [{ docType: "letter_of_authority" }, { docType: "id_certified_trustee" }]
      : [{ docType: "id_certified" }];
  return [
    ...ficaDocs,
    { docType: "proof_of_application", optional: true },
    { docType: "proof_of_payment_figures", optional: true },
  ];
}

// Whether COJ-style "Query Reference Number" applies to the referral form.
export function prcNeedsQueryRef(municipality: string | null): boolean {
  return (municipality ?? "").toUpperCase() === "COJ";
}
