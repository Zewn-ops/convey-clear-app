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
}): string {
  const ref = (opts.internalRef || "").trim().toUpperCase();
  const prop = (opts.property || "").trim().toUpperCase();
  if (ref) return [ref, prop].filter((s) => s && s.length).join("_") || ref;

  const muni = (opts.municipality || "").trim().toUpperCase().replace(/\s+/g, "");
  const svc = (opts.serviceCode || "").trim().toUpperCase();
  const client = (opts.clientName || "").trim().toUpperCase();
  return [muni || "NA", svc || "SVC", client, prop]
    .filter((s) => s && s.length)
    .join("_");
}
