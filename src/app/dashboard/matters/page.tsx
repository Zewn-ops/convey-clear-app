import { redirect } from "next/navigation";

/**
 * Clients do not see matters.
 *
 * Zewn, 2026-08-27: *"matters should be unseen by clients"* — restating the
 * 2026-08-26 decision (*"the same principal should apply that they dont see
 * matters but only see property transfers"*) that hid the Matters tab from this
 * nav. Hiding the tab was not enough: this route stayed reachable and listed
 * every matter by its INTERNAL name (`COT_COO_THABO MOLEFE_ERF 1234 MENLO
 * PARK`), and the detail page went further, exposing our internal priority
 * triage and stage vocabulary. Observed on production 2026-08-27.
 *
 * WHY A REDIRECT AND NOT A DELETE OR A 404
 *   A client following an old link or bookmark should land somewhere useful
 *   rather than on an error, and the transaction is what they came to see. RLS
 *   already scoped this page correctly — nothing here was a leak, it was simply
 *   the wrong surface for this audience. The transfer page carries the progress
 *   instead, which is what the 08-26 decision said would replace it.
 *
 *   The previous implementation is in git at `ead80b0`, and staff keep their own
 *   matters surface at /admin/matters. Nothing is lost.
 */
export default async function MattersPage() {
  redirect("/dashboard/transfers");
}
