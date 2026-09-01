// ConveyClear matter naming (revised 2026-06-22).
// PRIMARY: {INTERNAL REF}_{PROPERTY DESCRIPTION}  — e.g. AS1234_ERF 101 TESTING CENTRE.
//   Used for partner-referred matters (the partner supplies an internal file ref).
//   Seller / Buyer / Council are NOT in the title — they render as grey subtext
//   on the matters dashboard instead.
// FALLBACK (no internal ref — staff/client-created matters): the legacy
//   {MUNICIPALITY}_{SERVICE}_{CLIENT}_{PROPERTY} convention.
// Segments join with "_"; spaces WITHIN a segment are kept.

export function buildMatterTitle(opts: {
  internalRef?: string | null;
  property?: string | null;
  // fallback fields (used only when there is no internal ref)
  municipality?: string | null;
  serviceCode?: string | null;
  clientName?: string | null;
  /**
   * PRC only — the rates clearance stage (RCA | RCF | RCC), which REPLACES the
   * service code in the title.
   *
   * Zewn, 2026-09-01: "please make sure it doesnt get labelled as PRC in the
   * title but rather as RCA,RCC or RCF based on what was selected." PRC is the
   * umbrella; nobody works "a PRC". They work an application, a figures request
   * or a certificate request, and those are different jobs with different
   * documents and different pipelines — so a list of matters all reading
   * COT_PRC_… hides the only distinction that matters between them.
   */
  serviceSubtype?: string | null;
}): string {
  const ref = (opts.internalRef || "").trim().toUpperCase();
  const prop = (opts.property || "").trim().toUpperCase();
  if (ref) return [ref, prop].filter((s) => s && s.length).join("_") || ref;

  const muni = (opts.municipality || "").trim().toUpperCase().replace(/\s+/g, "");
  const code = (opts.serviceCode || "").trim().toUpperCase();
  const sub = (opts.serviceSubtype || "").trim().toUpperCase();
  // The stage stands in for the umbrella, never beside it: COT_RCA_…, not
  // COT_PRC_RCA_…. A PRC with no stage yet keeps reading PRC, which is honest —
  // nobody has said which job it is.
  const svc = code === "PRC" && sub ? sub : code;
  const client = (opts.clientName || "").trim().toUpperCase();
  return [muni || "NA", svc || "SVC", client, prop]
    .filter((s) => s && s.length)
    .join("_");
}
