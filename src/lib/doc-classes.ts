import { COUNCILS, getCouncil, type DocClass } from "./councils";
import type { CouncilDocRequirement } from "./councils/types";

/**
 * Input · supporting · output — which class a document falls into, and why.
 *
 * Zewn, 2026-08-31: "we also want to split the documents into input, supporting
 * and output documents. easier to navigate and specify things that way … for
 * the most part, things for input are like existing building plans, offer to
 * purchase, rates figures maybe and stuff like that, supporting docs examples
 * is stuff like IDs, proof of residence, fica vault type things. and then
 * output docs are the things conveyclear is sorting so like a change of
 * ownership typwe thing."
 *
 * 🔴 THE CLASS IS CONTEXTUAL, NOT A PROPERTY OF THE DOCUMENT TYPE:
 *
 *   "the input deed search is the sellers deed search, the output deed search
 *    would be the buyers deed search. buyers deed search is what convey clear
 *    produces and seller deed search is what cc receives along with other
 *    information to get there."
 *
 * A deed search is an input on the way in and an output on the way out, and
 * which one it is depends on the transaction rather than on the file. The
 * councils resolve that by naming them separately — the CoE sheet writes the
 * second as "DEED SEARCH (UPDATED)" — so they are modelled as two types here,
 * and the class follows the type.
 *
 * The resolution is still (council, document type, party role): a council
 * states an OWNER against each document it requires, several types are required
 * of both seller and buyer, and `transfer_documents.party_role` (067) already
 * records whose a given upload is. So the party dimension costs nothing and is
 * there for the council that files one type two ways.
 *
 * WHY THE CLASS IS STORED ON THE ROW, NOT COMPUTED ON READ
 *   Council requirements change. A document filed last month was filed under
 *   the rules of last month, and re-labelling it retrospectively because a
 *   config edit landed would quietly rewrite history. 076 stores the class at
 *   upload; this module is what decides the value to store, and the fallback
 *   for rows that predate it.
 */

/**
 * The last resort, when no council says otherwise.
 *
 * Grouped by Zewn's own three examples rather than by anything clever:
 * identity and verification material is supporting, what ConveyClear receives
 * to start work is input, and what ConveyClear produces is output.
 */
const DEFAULT_BY_TYPE: Record<string, DocClass> = {
  // Supporting — identity, authority, verification.
  id_certified: "supporting",
  id_certified_representative: "supporting",
  id_certified_trustee: "supporting",
  cipc_docs: "supporting",
  cor_14_3: "supporting",
  letter_of_authority: "supporting",
  letter_of_authority_council: "supporting",
  proof_of_address: "supporting",
  tax_clearance: "supporting",
  poa: "supporting",

  // Input — what ConveyClear receives in order to do the work.
  offer_to_purchase: "input",
  municipal_account: "input",
  rates_account_invoice: "input",
  utilities_account_invoice: "input",
  clearance_figures: "input",
  meter_readings: "input",
  meter_reading_water: "input",
  meter_reading_electricity: "input",
  transfer_letter: "input",
  proof_of_application: "input",
  proof_of_payment_figures: "input",
  consumer_agreement: "input",
  deed_search: "input",

  // Output — what ConveyClear produces and hands back.
  deed_search_updated: "output",
  building_plans: "output",
  coc_electrical: "output",
};

/** Party roles `transfer_documents.party_role` can hold (067). */
export type PartyRole = "seller" | "buyer" | null | undefined;

/**
 * ⚠️ As the three councils are configured today, NO document type carries two
 * different classes. Zewn's seller/buyer deed-search example is modelled as two
 * TYPES — `deed_search` and `deed_search_updated` — because the CoE sheet names
 * the second one that way ("DEED SEARCH (UPDATED)"), and a distinct type keeps
 * the two apart in the canonical file name as well as in the class.
 *
 * The owner dimension below is kept anyway, and is not speculative: the council
 * requirements genuinely record an owner per document, several types appear for
 * both seller and buyer, and a council that files one type two ways is exactly
 * the kind of difference §5.15 decided config should absorb. It costs one
 * comparison and removes a whole class of future edit.
 */
function ownerMatchesRole(
  requirement: CouncilDocRequirement,
  role: PartyRole
): boolean {
  if (requirement.owner === "seller" || requirement.owner === "buyer") {
    return requirement.owner === role;
  }
  // `matter` and `firm` documents belong to the transaction rather than to a
  // side, which is what a null role means.
  return !role;
}

/** Every requirement a council states, across all its services and stages. */
function requirementsFor(municipality: string | null | undefined) {
  const council = getCouncil(municipality);
  if (!council) return [];
  return [
    ...Object.values(council.services),
    ...Object.values(council.prc),
  ].flatMap((spec) => spec?.documents ?? []);
}

/**
 * Which class this document is, at this council, for this party.
 *
 * Resolution order, most specific first:
 *   1. the council's own requirements, matched on type AND owner
 *   2. the council's requirements, matched on type alone
 *   3. any council that states a class for this type
 *   4. the default map above
 *   5. `supporting` — the least wrong of the three for an unknown document,
 *      because it is the class that makes no claim about who produced it
 */
export function resolveDocClass(
  municipality: string | null | undefined,
  documentType: string,
  partyRole?: PartyRole
): DocClass {
  const type = (documentType ?? "").trim();
  if (!type) return "supporting";

  const councilRules = requirementsFor(municipality).filter((r) => r.type === type);

  const byOwner = councilRules.find((r) => ownerMatchesRole(r, partyRole));
  if (byOwner) return byOwner.docClass;

  if (councilRules.length > 0) return councilRules[0].docClass;

  // No spec for this council. Another council naming the same document is
  // better evidence than the default map, and the three sheets agree far more
  // than they differ.
  for (const council of COUNCILS) {
    const rules = [
      ...Object.values(council.services),
      ...Object.values(council.prc),
    ]
      .flatMap((spec) => spec?.documents ?? [])
      .filter((r) => r.type === type);
    const match = rules.find((r) => ownerMatchesRole(r, partyRole)) ?? rules[0];
    if (match) return match.docClass;
  }

  return DEFAULT_BY_TYPE[type] ?? "supporting";
}
