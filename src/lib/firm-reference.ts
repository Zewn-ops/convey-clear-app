/**
 * Qualifying a firm's own transfer reference with its firm code.
 *
 * ── THE PROBLEM THIS SOLVES IS ALREADY LIVE ────────────────────────────────
 *
 * `uq_property_transfers_reference` (026) is UNIQUE (upper(reference)) across
 * the WHOLE TABLE, not per firm. Two firms both running a file numbered "5600"
 * is ordinary — references belong to the firm, and firms do not coordinate
 * numbering with each other. Today the second one to submit is refused with
 * "Reference 5600 is already in use", and neither the firm nor the staff member
 * looking at the screen can do anything about it, because the reference is the
 * firm's own and the collision is invisible to them through RLS.
 *
 * With one firm live this never fires. It fires on the second firm's first
 * transfer.
 *
 * Jukka, 2026-09-18: *"if I get another attorney and they also use the same
 * referencing style like AS, then it'll be a problem … a chance that AS is 5,600
 * and another is 5,600 registered on the same date is highly unlikely [once the
 * code is there]. So we should determine an abbreviation for each attorney."*
 *
 * ── WHY THE CODE IS STORED IN THE REFERENCE, NOT BESIDE IT ─────────────────
 *
 * The alternative was to leave `reference` as the firm's raw value and scope the
 * unique index to (business_partner_id, upper(reference)). That is the tidier
 * schema and it is NOT what was asked for, for a reason that only shows up
 * downstream —
 *
 * Jukka: *"The title of the property transfer is what gets dragged into the name
 * of the matter created. So when we add the BSI in the beginning, it's going to
 * automatically slot itself into the matter as well."*
 *
 * Every place that already displays or derives from a transfer reference —
 * matter titles, document names (`doc-naming.ts`), council packs, the firm's own
 * search — inherits the code for free when it lives in the string, and would
 * each need their own change if it lived in a joined column. Storing it is the
 * one-line-of-blast-radius option.
 *
 * It also keeps the global unique index CORRECT rather than merely tolerated:
 * BSI_5600 and AA_5600 are genuinely different references, so the constraint now
 * means what it says.
 *
 * ── WHY AN ALREADY-PREFIXED REFERENCE IS LEFT EXACTLY AS TYPED ─────────────
 *
 * The convention predates the enforcement. Sterling Hayes' live transfers read
 * SH-2026-1001, with the firm code already at the front and a HYPHEN, not an
 * underscore. Rewriting those to SH_SH-2026-1001 would be absurd, and
 * "correcting" the separator to SH_2026-1001 would silently change references
 * that attorneys have written on files and that the dry-run guide names.
 *
 * So the rule is: if the reference already opens with this firm's code followed
 * by a separator, it is already qualified — return it untouched, whatever
 * separator it uses. Only an unqualified reference gets `CODE_` prepended.
 */

/** Separators a firm might already be using between its code and its number. */
const SEPARATORS = ["_", "-", "/", " ", "."];

/**
 * True when `raw` already opens with `code` followed by a separator (or is the
 * code and nothing else). Case-insensitive: references are matched
 * case-insensitively by the unique index, so they must be judged that way here.
 */
export function alreadyQualified(code: string, raw: string): boolean {
  const c = code.trim().toUpperCase();
  const r = raw.trim().toUpperCase();
  if (!c || !r) return false;
  if (!r.startsWith(c)) return false;
  if (r.length === c.length) return true;
  return SEPARATORS.includes(r.charAt(c.length));
}

/**
 * Put the firm's code at the front of its reference.
 *
 * Returns the reference unchanged when there is no code to apply, which is the
 * deliberate graceful path: a firm whose abbreviation has not been set yet must
 * still be able to submit a transfer. Migration 100 backfills every existing
 * firm and the admin form requires one on new firms, so the null case is a
 * fallback rather than a route anyone travels.
 *
 * ⚠️ NULLISHNESS IS PRESERVED EXACTLY, and that is not a typing nicety.
 * A DRAFT request legitimately carries no reference yet — the firm has not typed
 * one — and `transfer_requests.suggested_reference` must stay NULL for it. 078's
 * conditional CHECKs distinguish "not supplied" from "supplied", and an empty
 * string is supplied. Collapsing null to "" here would make a half-written draft
 * unsaveable, which is the one thing drafts exist to allow.
 */
export function qualifyReference<T extends string | null | undefined>(
  code: string | null | undefined,
  raw: T
): T extends string ? string : T {
  type Out = T extends string ? string : T;
  if (raw === null || raw === undefined) return raw as Out;

  const reference = raw.trim();
  const c = (code ?? "").trim().toUpperCase();
  if (!c || !reference) return reference as Out;
  if (alreadyQualified(c, reference)) return reference as Out;
  return `${c}_${reference}` as Out;
}

/**
 * The shape the admin form and API accept for a firm code: 2–6 characters,
 * letters and digits only.
 *
 * Bounded at both ends on purpose. One character is not a code, it is a
 * collision — and the whole point of this change is that two firms must not be
 * able to occupy the same prefix by accident. Six is enough for the longest
 * sensible initialism (A&A → AA, Bert Smith Inc → BSI, Sterling Hayes → SH)
 * while keeping the reference readable once the firm's own number follows it.
 *
 * Separators are excluded because the code is joined to the reference WITH a
 * separator; one inside the code would make `alreadyQualified` ambiguous about
 * where the code ends.
 */
export const FIRM_CODE_PATTERN = /^[A-Z0-9]{2,6}$/;

export function isValidFirmCode(code: string): boolean {
  return FIRM_CODE_PATTERN.test(code.trim().toUpperCase());
}

/**
 * A starting code derived from a firm's name, for the admin form to offer.
 *
 * Initials of the first words, which is how these are actually written: "Bert
 * Smith Inc" → BSI, "Sterling Hayes" → SH, "Adams & Adams" → AA. Punctuation
 * and one-letter connectives are skipped so "&" does not become a letter of the
 * code.
 *
 * A SUGGESTION, never an assignment — Jukka's words were "we should determine an
 * abbreviation for each attorney", and determining it is his call. The form
 * pre-fills and the human confirms.
 */
export function suggestFirmCode(name: string): string {
  const words = name
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1);

  const initials = words.map((w) => w.charAt(0)).join("");
  if (initials.length >= 2) return initials.slice(0, 6);

  // One usable word ("Batsmith") — take the opening letters instead of a
  // single-letter code, which FIRM_CODE_PATTERN would reject anyway.
  const single = words[0] ?? name.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return single.slice(0, 3);
}
