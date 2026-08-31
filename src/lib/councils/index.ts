/**
 * The council registry — where per-council difference lives.
 *
 * §5.15, decided 2026-08-31: shared page shell, council-specific sections and
 * config. This module is the config half. Pages ask it what a council needs;
 * they do not know any council's name.
 *
 * Composition happens here rather than in each council file so that "CoE is
 * COT for these bits" and "COJ is CoE plus two fields" stay literal — the way
 * the handwritten sheets actually say it.
 */

import { COT } from "./cot";
import { COE as COE_SPEC, COE_INHERITS_FROM_COT } from "./coe";
import { COJ_DELTA } from "./coj";
import {
  deriveCouncil,
  type Council,
  type CouncilDocRequirement,
  type CouncilServiceSpec,
  type DocClass,
  type PrcStage,
  type ServiceCode,
} from "./types";
import { COUNCIL_PARTY_FIELD_KEYS } from "../fica";

export * from "./types";
export { FIRM_DOC_TYPES, firmDocLabel } from "../firm-docs";

/**
 * CoE's sheet says "SAME AS COT" for its REF block and for its RCF/RCC issue
 * lists. Resolve that by reference, so the two cannot drift.
 *
 * CoE adds one issue of its own — Zewn (§11.23): "hanging means that the 4th
 * issue is COE portal hanging, taking long or not loading as it should".
 */
function withCotIssues(stage: PrcStage): CouncilServiceSpec | undefined {
  const own = COE_SPEC.prc[stage];
  if (!own) return undefined;
  return {
    ...own,
    issues: [
      ...(COT.prc[stage]?.issues ?? []),
      ...COE_INHERITS_FROM_COT.extraIssues,
    ],
  };
}

function resolveCOE(): Council {
  return {
    ...COE_SPEC,
    services: {
      ...COE_SPEC.services,
      REF: COT.services.REF, // "SAME AS COT", applied by reference
    },
    prc: {
      ...COE_SPEC.prc,
      RCF: withCotIssues("RCF"),
      RCC: withCotIssues("RCC"),
    },
  };
}

const COE: Council = resolveCOE();

/** COJ = CoE + attorney code + practice no. Nothing else. */
const COJ: Council = deriveCouncil(COE, {
  ...COJ_DELTA.identity,
  ratesScope: COE.ratesScope,
  firmRequirements: {
    ...COE.firmRequirements,
    fields: [...COE.firmRequirements.fields, ...COJ_DELTA.firmFields],
  },
  prc: {
    ...COE.prc,
    RCA: COE.prc.RCA
      ? {
          ...COE.prc.RCA,
          fields: [
            ...(COE.prc.RCA.fields ?? []),
            ...(COJ_DELTA.prc.RCA?.fields ?? []),
          ],
        }
      : undefined,
  },
});

/**
 * The implemented councils.
 *
 * ⚠️ `MUNICIPALITIES` (conveyclear-lists.ts) has ten entries. Three are
 * specified. The other seven resolve to `null` and must fall back to the
 * generic behaviour rather than to COT's — assuming COT is what produced the
 * "every pipeline is COT" situation in the first place.
 */
export const COUNCILS: Council[] = [COT, COE, COJ];

const BY_CODE = new Map(COUNCILS.map((c) => [c.code.toUpperCase(), c]));

/** The council for a municipality, or null when it has no spec yet. */
export function getCouncil(municipality?: string | null): Council | null {
  const key = (municipality ?? "").trim().toUpperCase();
  if (!key) return null;
  return BY_CODE.get(key) ?? null;
}

export function isCouncilSpecified(municipality?: string | null): boolean {
  return getCouncil(municipality) !== null;
}

/**
 * What this council requires for this service.
 *
 * PRC resolves through its stage, because the three stages want different
 * things — that is the whole point of §5.9. A PRC line with no stage chosen
 * yet returns null rather than a guess.
 */
export function councilServiceSpec(
  municipality: string | null | undefined,
  serviceCode: ServiceCode | string,
  prcStage?: PrcStage | null
): CouncilServiceSpec | null {
  const council = getCouncil(municipality);
  if (!council) return null;

  const code = (serviceCode ?? "").toUpperCase();

  if (code === "PRC") {
    if (!prcStage) return null;
    return council.prc[prcStage] ?? null;
  }

  return council.services[code as ServiceCode] ?? null;
}

/** The documents of one class, for grouping the upload sections (§11.5). */
export function documentsOfClass(
  spec: CouncilServiceSpec | null,
  docClass: DocClass
): CouncilDocRequirement[] {
  if (!spec) return [];
  return spec.documents.filter((d) => d.docClass === docClass);
}

/**
 * The documents this service pulls from the FIRM record rather than asking an
 * attorney for again (§11.3 — "if rca is connected that data automatically
 * populates").
 */
export function firmAutofillDocuments(
  spec: CouncilServiceSpec | null
): CouncilDocRequirement[] {
  if (!spec) return [];
  return spec.documents.filter((d) => d.owner === "firm");
}

/** The issue vocabulary for a service at a council, for the issue dropdown. */
export function councilIssues(
  municipality: string | null | undefined,
  serviceCode: ServiceCode | string,
  prcStage?: PrcStage | null
): string[] {
  return councilServiceSpec(municipality, serviceCode, prcStage)?.issues ?? [];
}

/**
 * §5.12 — which CLIENT fields this council demands of this party, here.
 *
 * Zewn: "in order for us to do an RCA for the buyer during a COO, we need a
 * bunch of additional info for COT … because they are reqyuired on the etshwane
 * portal." The list is the council's own form, transcribed field by field, and
 * it lives in `cot.ts` — City of Ekurhuleni asks markedly less of the buyer and
 * its config says so by not listing them.
 *
 * Returns the keys to RAISE TO REQUIRED. The fields themselves are always
 * capturable (`COUNCIL_PARTY_FIELDS` in lib/fica), because a field that only
 * appears once a council is chosen is a field nobody fills in early.
 */
export function councilPartyFieldKeys(
  municipality: string | null | undefined,
  serviceCode: ServiceCode | string | null | undefined,
  prcStage: PrcStage | string | null | undefined,
  partyRole: string | null | undefined
): string[] {
  if (!serviceCode) return [];
  const stage = (prcStage ?? "").toUpperCase();
  const spec = councilServiceSpec(
    municipality,
    serviceCode,
    stage === "RCA" || stage === "RCF" || stage === "RCC" ? stage : null
  );
  if (!spec?.fields) return [];
  const role = (partyRole ?? "").toLowerCase();

  return spec.fields
    .filter((f) => !f.optional && (f.owner === "seller" || f.owner === "buyer") && f.owner === role)
    .map((f) => f.key)
    // 🔴 Only keys that are REAL, CAPTURABLE client fields.
    //
    // A council's `fields` list serves two jobs: documenting what the sheet
    // asks for, and driving what the form requires. Most entries do both, but
    // some are descriptive — CoE's RCA says `buyer_contact` ("Buyer name,
    // surname, email and cell") and COT's COC says `electrical_phase`. Those
    // are notes to a reader, not columns on `clients`.
    //
    // Returning one would raise a requirement that can never be satisfied,
    // because nothing renders a field for it — leaving every CoE buyer
    // permanently FICA-incomplete with no way to fix it. Caught by the smoke
    // test before it shipped.
    .filter((key) => (COUNCIL_PARTY_FIELD_KEYS as readonly string[]).includes(key));
}

/** Does this council ask rates-vs-utilities on a clearance? (§11.17) */
export function councilAsksRatesScope(
  municipality: string | null | undefined
): boolean {
  return getCouncil(municipality)?.ratesScope ?? false;
}
