/**
 * Documents that can only exist AFTER the property is registered in the new
 * owner's name. Everything else can be gathered before.
 *
 * Jukka, 2026-09-15: "I would split those required documents into two
 * departments. It's called not yet registered and registered, because there's a
 * difference … it's very important for us to have the INITIAL deed search. If we
 * need to make an amendment on the RCC, if we need to submit for a MAD
 * application, we need the existing deed search — the pre-updated, the current
 * owner's deed." And on the other side: "after registration is just two
 * documents. It's transfer letter, transfer confirmation letter, and updated
 * deed search."
 *
 * Why this matters rather than being cosmetic: an attorney who has already
 * registered and is only now coming to ConveyClear should be able to upload the
 * whole package at once, and one who has not should not be hunting for a
 * transfer letter that cannot exist yet. Zewn's first instinct was to show only
 * the pre-registration list; Jukka pushed back — "I don't agree, because if they
 * have completed the transfer but not added us to the system yet … the moment
 * they create the property transfer they should be able to upload a full
 * package" — so BOTH show, labelled, and neither is hidden.
 *
 * ⚠️ Matched on a substring of the portal's own document-type label, not on a
 * code. The registry is authored as prose labels and there is no stage field to
 * key off; if one is ever added, key off it instead of this.
 *
 * ⚠️⚠️ THE PATTERNS MUST MATCH THE REGISTRY'S SPELLING, NOT THE MEETING'S.
 * Jukka said "updated deed search"; the registry says "Deed Search (updated)",
 * and a pattern written from the transcript matched nothing at all — the split
 * would have rendered as a single unlabelled list and looked like it worked.
 * There is an assertion for exactly this in
 * scripts/check-transfer-progress.ts; if a label is renamed, that fails rather
 * than the feature going quietly inert.
 */
export const POST_REGISTRATION_PATTERNS = [
  "transfer confirmation letter", // the registry's exact label
  "transfer letter",              // Jukka's own word for it, if it ever appears
  "deed search (updated)",        // NOT "updated deed search" — see below
];

export function isPostRegistration(docLabelText: string): boolean {
  const t = docLabelText.toLowerCase();
  return POST_REGISTRATION_PATTERNS.some((p) => t.includes(p));
}
