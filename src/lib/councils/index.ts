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

/** Does this council ask rates-vs-utilities on a clearance? (§11.17) */
export function councilAsksRatesScope(
  municipality: string | null | undefined
): boolean {
  return getCouncil(municipality)?.ratesScope ?? false;
}
