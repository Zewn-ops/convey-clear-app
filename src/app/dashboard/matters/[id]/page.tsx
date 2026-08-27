import { redirect } from "next/navigation";

/**
 * Clients do not see matters. See ../page.tsx for the decision.
 *
 * This detail page was the worse of the two exposures. Alongside the matter it
 * showed the client, on production 2026-08-27:
 *
 *   · `COT_COO_THABO MOLEFE_ERF 1234 MENLO PARK` — ConveyClear's internal
 *     matter-naming convention
 *   · "Priority: Priority" — an internal triage field, meaningless to a client
 *     and faintly alarming
 *   · "Stage: Inquiry" — internal stage vocabulary
 *   · a third progress vocabulary distinct from both the internal and the
 *     client-facing phase names
 *
 * Redirects to the transaction rather than 404-ing: an old link should land
 * somewhere useful, and the transfer page answers the question the client
 * actually had. Previous implementation is in git at `ead80b0`.
 */
export default async function MatterDetailPage() {
  redirect("/dashboard/transfers");
}
