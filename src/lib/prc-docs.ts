// Property Rates Clearance (PRC) — stages + the RCF per-municipality document
// matrix (Jukka 2026-06-16). The PRC service is code 'PRC' since 072; within it
// the partner picks a stage. Only RCF and RCC are built in-portal for now.
//
// Zewn, 2026-08-31: RCA / RCF / RCC are sequential stages of one job — RCA opens
// the rates clearance account, RCF gets the figures from it, RCC gets the
// certificate. Not three alternatives.
import { COO_DOC_LABELS } from "./coo-docs";
import { TRANSFER_DOC_LABELS } from "./transfer-doc-types";

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

// Server-safe labels for the PRC document types (the client-only DOC_META in
// OnboardForm can't be imported into server components — see the coo-docs note).
export const PRC_DOC_LABELS: Record<string, string> = {
  id_certified: "Certified ID",
  cipc_docs: "CIPC Documents",
  id_certified_representative: "Representative's Certified ID",
  letter_of_authority: "Letter of Authority",
  id_certified_trustee: "Trustee's Certified ID",
  proof_of_application: "Proof of Application",
  proof_of_payment_figures: "Proof of Payment (Figures)",
};

// One label lookup across the COO, PRC and transfer-supporting doc types, with a
// humanised fallback. Safe in server components (no client-only imports).
//
// Order matters where a code appears twice: COO and PRC win over the transfer
// map, so a `proof_of_payment_figures` keeps the name it has had since June and
// only codes nobody else claims are named here.
export function docLabel(docType: string): string {
  return (
    COO_DOC_LABELS[docType] ??
    PRC_DOC_LABELS[docType] ??
    TRANSFER_DOC_LABELS[docType] ??
    docType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}
