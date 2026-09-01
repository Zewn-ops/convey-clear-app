// Property Rates Clearance (PRC) — stages + the RCF per-municipality document
// matrix (Jukka 2026-06-16). The PRC service is code 'PRC' since 072; within it
// the partner picks a stage. Only RCF and RCC are built in-portal for now.
//
// Zewn, 2026-08-31: RCA / RCF / RCC are sequential stages of one job — RCA opens
// the rates clearance account, RCF gets the figures from it, RCC gets the
// certificate. Not three alternatives.
import { COO_DOC_LABELS } from "./coo-docs";
import { TRANSFER_DOC_LABELS } from "./transfer-doc-types";
import { councilServiceSpec } from "./councils";

export interface PrcSubtype {
  code: "RCF" | "RCC" | "RCA";
  label: string;
  inPortal: boolean; // false → show a "contact ConveyClear" notice, block submit
  notice?: string;
  /** One line on what this stage is for, shown beside the choice. */
  hint?: string;
}

/**
 * The three stages, in the order they actually happen.
 *
 * Zewn, 2026-08-31: "RCA is an application to open a rates clearance account,
 * RCF is to get rates clearance figures from the account and RCC is to get a
 * certificate." They are SEQUENTIAL STAGES of one job, not three alternatives
 * — which is why RCA leads, and why the CoE sheet lists an RCF as a
 * requirement OF an RCC.
 *
 * 🟢 RCA IS NOW IN THE PORTAL. It shipped as `inPortal: false` with a "contact
 * ConveyClear" notice because the pipeline was undocumented; the handwritten
 * notes are that documentation arriving, and the per-council requirements now
 * live in lib/councils. Flipping this flag was the finish line for §5.8, §5.9
 * and §5.12 together.
 */
export const PRC_SUBTYPES: PrcSubtype[] = [
  {
    code: "RCA",
    label: "RCA — Rates Clearance Application",
    inPortal: true,
    hint: "Opens the rates clearance account.",
  },
  {
    code: "RCF",
    label: "RCF — Rates Clearance Figures",
    inPortal: true,
    hint: "Gets the figures from an open account.",
  },
  {
    code: "RCC",
    label: "RCC — Rates Clearance Certificate",
    inPortal: true,
    hint: "Gets the certificate, once the figures are settled.",
  },
];

/** The stage a PRC job is at, or null before anyone has chosen. */
export type PrcStageCode = PrcSubtype["code"];

export function prcSubtype(code?: string | null): PrcSubtype | null {
  if (!code) return null;
  const up = code.toUpperCase();
  return PRC_SUBTYPES.find((s) => s.code === up) ?? null;
}

export function prcStageLabel(code?: string | null): string {
  return prcSubtype(code)?.label ?? "Stage not chosen";
}

/**
 * Which stages can sensibly follow the one given.
 *
 * Advisory, not enforced — the same call `TransferServices` makes for the COO
 * prerequisite rule, which §114 displays and deliberately does not block. A
 * firm may genuinely arrive with an account already open, so refusing an RCF
 * because no RCA exists in OUR records would be asserting something we do not
 * know.
 */
export function prcStagesAfter(code?: string | null): PrcStageCode[] {
  const order: PrcStageCode[] = ["RCA", "RCF", "RCC"];
  const i = order.indexOf((code ?? "").toUpperCase() as PrcStageCode);
  return i < 0 ? order : order.slice(i + 1);
}

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
/**
 * The identity documents, whichever of them applies to an entity. One list so
 * that removing identity from a stage (see prcStageDocs) removes all of it,
 * rather than the entity-driven half and not the council's line.
 */
export const PRC_FICA_TYPES: string[] = [
  "id_certified",
  "id_certified_representative",
  "id_certified_trustee",
  "cipc_docs",
  "letter_of_authority",
  "letter_of_authority_council",
];

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

/**
 * The documents a rates-clearance matter needs, for its STAGE and its COUNCIL.
 *
 * §5.8, marked *very important* by Zewn: "we also need to rework the document
 * uploads proccess for matters, specifically for PRC (RCA,RCF and RCC)".
 *
 * 🔴 THE GAP THIS CLOSES. `prcRcfDocs()` above is shaped entirely around the
 * RCF: the seller's FICA, plus an optional proof of application and proof of
 * payment. Every PRC matter got that list — an RCA and an RCC included — even
 * though an RCA opens the account (so there is no account statement to show
 * yet) and an RCC follows the figures (so the RCF output is itself an input).
 * And none of it varied by council, while the three handwritten sheets differ
 * on exactly this.
 *
 * WHAT IT COMPOSES, AND WHY IT DOES NOT SIMPLY REPLACE
 *   The entity-driven FICA in `prcRcfDocs()` is correct and hard-won — a
 *   business shows CIPC plus the representative's certified ID, a trust its
 *   letter of authority plus the trustee's. The councils do not restate that
 *   detail; their sheets say "ID / CIPC / LoA" on one line. So the FICA rules
 *   stay authoritative and the council adds what it asks for on top.
 *
 * WHAT IS DELIBERATELY EXCLUDED
 *   · `firm`-owned documents — the bank confirmation letter, the FFC, the PoA.
 *     They live on the firm record (073) and autofill (§11.3); asking an
 *     attorney to attach the firm's own FFC to every matter is the thing that
 *     upgrade exists to stop.
 *   · `output` documents — what ConveyClear produces is not something the
 *     attorney uploads at intake.
 *
 * Falls back to `prcRcfDocs()` when the council has no spec for the stage, so
 * an unspecified council behaves exactly as it does today rather than showing
 * an empty checklist.
 */
export function prcStageDocs(
  stage: string | null | undefined,
  sellerEntityType?: string | null,
  municipality?: string | null
): PrcDocRule[] {
  const st = normalisePrcStage(stage);

  // 🔴 AN RCF DOES NOT NEED IDENTITY DOCUMENTS. Jukka, 2026-09-01 meeting:
  //   Zewn — "you won't require it in order to complete the RCF."
  //   Jukka — "No. Take that out."
  //
  // A figures request is made against an account that is already open, and the
  // account was opened by the RCA, which is where identity was proved. Asking
  // again is the friction the meeting was about. RCA and RCC keep their FICA:
  // an RCA opens the account and an RCC transfers a clearance certificate, and
  // both are identity-bearing acts.
  //
  // The proof-of-payment and proof-of-application extras stay on the RCF —
  // those are about the request, not the person.
  const fica = st === "RCF"
    ? prcRcfDocs(sellerEntityType).filter((d) => !PRC_FICA_TYPES.includes(d.docType))
    : prcRcfDocs(sellerEntityType);
  const spec = councilServiceSpec(municipality, "PRC", st);
  if (!spec) return fica;

  // 🔴 THE COUNCIL'S OWN LIST LEADS. Jukka, 2026-09-01: "you can make the order
  // of the documents … is statement" — and on production the statement was
  // third, behind proof of application and proof of payment, because those come
  // from prcRcfDocs() and that array was concatenated first.
  //
  // The council's documents are what it will actually look for, so they go
  // first and the generic extras follow. Order is not cosmetic here: Jukka's
  // rule for the council pack is that if it is not near the top, they do not
  // scroll.
  const seen = new Set<string>();
  const councilFirst: PrcDocRule[] = [];
  const out: PrcDocRule[] = councilFirst;

  // The councils write identity as ONE line — "ID / CIPC / LoA" — meaning
  // whichever applies to this entity. prcRcfDocs() has already made that
  // choice, correctly and by entity type, so every other member of the family
  // must be skipped rather than offered as an optional extra. Without this a
  // natural person was shown empty CIPC and letter-of-authority slots, and a
  // business was shown a plain certified ID beside the representative's.
  const ficaFamily = PRC_FICA_TYPES;
  // An RCF has had its identity documents removed deliberately (above), so the
  // council's own "ID / CIPC / LoA" line must not put them back.
  const ficaAnswered = st === "RCF" || fica.some((d) => ficaFamily.includes(d.docType));

  for (const req of spec.documents) {
    if (req.owner === "firm") continue;      // autofills from the firm record
    if (req.docClass === "output") continue; // not the attorney's to upload
    if (seen.has(req.type)) continue;
    if (ficaAnswered && ficaFamily.includes(req.type)) continue;

    // A slot is keyed by (party, document type), so a generic `other` cannot
    // be one: two "other" documents would collide on the same key and the
    // second would render as the first. The councils use `other` for things
    // like a memo, which the generic uploader elsewhere on the page already
    // takes.
    if (req.type === "other") continue;

    seen.add(req.type);
    out.push({ docType: req.type, optional: req.optional });
  }

  // Then whatever the council did not name — the entity's identity documents and
  // the request-level extras.
  for (const d of fica) {
    if (seen.has(d.docType)) continue;
    seen.add(d.docType);
    out.push(d);
  }

  return out;
}

/**
 * 'rca' / 'RCA ' / null → a stage the council registry recognises, or null.
 *
 * Exported so that every writer of a PRC stage — the matter-creation route, the
 * checklist line, the stage picker — validates against ONE list. The database
 * has its own CHECK (072), and two disagreeing validators is how a value gets
 * rejected at the far end of a form nobody expected to fail.
 */
export function normalisePrcStage(stage?: string | null): PrcStageCode | null {
  const up = (stage ?? "").trim().toUpperCase();
  return up === "RCA" || up === "RCF" || up === "RCC" ? up : null;
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
  // Jukka, 2026-09-01 meeting: "what you need for RCF is proof of payment for
  // APPLICATION FEE … keep the proof of payment in, just change your bracket
  // context." The council charges to process the request; the figures
  // themselves are paid later and are a different document. The code stays
  // `proof_of_payment_figures` because it is on real rows — renaming it is a
  // 066-class migration for a label nobody sees.
  proof_of_payment_figures: "Proof of Payment (Application Fee)",
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
