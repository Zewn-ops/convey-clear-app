/**
 * The FICA vault subscription gate — an EXPLORATION, not a product.
 *
 * Zewn, 2026-08-27: *"the fica vault should be locked behind a fake paywall, id
 * like to explore the option of forcing the subscription before they can use the
 * vault while also providing the document upload feature to attorneys if the
 * client doesnt have an account and/or fica vault set up."*
 *
 * ⚠️ DEFAULT OFF, AND DELIBERATELY SO. This shipped the day of an in-person
 * review. A paywall appearing unannounced in front of Jukka on his own portal is
 * a worse outcome than the idea going unexplored for a day, so it is behind a
 * flag that must be turned on on purpose:
 *
 *     NEXT_PUBLIC_VAULT_PAYWALL=on
 *
 * Set it in the Vercel environment (or .env.local) for whichever deployment is
 * being used to explore, and leave it unset everywhere else. With the flag off,
 * nothing in the portal changes at all.
 *
 * ⚠️ NOTHING HERE TAKES MONEY. There is no payment provider, no price, no
 * subscription record and no entitlement check against one. It renders the SHAPE
 * of a gate so the flow can be judged — "how does it feel to hit this, and is
 * this the right place for it" — which is what "fake paywall" asked for. Real
 * billing is a separate piece of work with its own decisions (who is charged,
 * the client or the firm; what a subscription actually entitles you to; refunds;
 * POPIA implications of holding card data).
 *
 * WHAT THE GATE COVERS, AND WHAT IT MUST NEVER COVER
 *
 * 🟢 The attorney's route to upload a document is NOT gated and must not become
 *    gated. That is the second half of the same instruction — *"while also
 *    providing the document upload feature to attorneys if the client doesnt
 *    have an account and/or fica vault set up"* — and it already exists: the
 *    supporting-documents bar on the property transfer (3cac70f + migration
 *    067), which types documents with the vault's own vocabulary and answers
 *    "whose is it" with a role rather than a party FK precisely so it works
 *    before anyone has been vetted or signed up.
 *
 *    That escape hatch is what makes gating the vault safe. Without it, a
 *    paywall would block the transaction itself rather than a convenience.
 *
 * 🔴 STAFF ARE NEVER GATED. ConveyClear must be able to see and work a client's
 *    FICA regardless of what that client has paid for; a gate that hid records
 *    from the firm doing the compliance work would be an operational hazard, not
 *    a commercial lever.
 *
 * OPEN QUESTION recorded rather than answered: the vault's value is REUSE —
 * upload once, attach to many matters. Gating it while per-transfer upload stays
 * free makes the free path strictly more convenient for a one-off transaction,
 * and the paid path worthwhile only for people who transact repeatedly. That may
 * be exactly the right segmentation. It should be a decision, not a side effect
 * of where the gate happened to land.
 */

export const VAULT_PAYWALL_ENABLED = process.env.NEXT_PUBLIC_VAULT_PAYWALL === "on";

/**
 * Whether this viewer's vault is gated.
 *
 * Takes the audience explicitly rather than reading a session, so the rule is
 * visible at every call site and a staff surface cannot acquire a paywall by
 * accident.
 */
export function vaultGated({ isStaff }: { isStaff: boolean }): boolean {
  if (!VAULT_PAYWALL_ENABLED) return false;
  if (isStaff) return false; // see above — never
  return true;
}
