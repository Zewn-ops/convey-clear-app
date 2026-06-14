// ConveyClear matter naming convention (Jukka's standard, MASTER_DIRECTORY §4):
//   {MUNICIPALITY}_{SERVICE-ABBR}_{CLIENT/ORG}_{PROPERTY}
//   e.g.  COT_COO_JP HOLDINGS_ERF 123 VALHALLA
// Segments are joined with "_"; spaces WITHIN a segment are kept. Used wherever a
// matter is created in the portal so titles are consistent everywhere.

export function buildMatterTitle(opts: {
  municipality?: string | null;
  serviceCode?: string | null;
  clientName?: string | null;
  property?: string | null;
}): string {
  const muni = (opts.municipality || "").trim().toUpperCase().replace(/\s+/g, "");
  const svc = (opts.serviceCode || "").trim().toUpperCase();
  const client = (opts.clientName || "").trim().toUpperCase();
  const prop = (opts.property || "").trim().toUpperCase();
  return [muni || "NA", svc || "SVC", client, prop]
    .filter((s) => s && s.length)
    .join("_");
}
