// Council submission pack — the ONE merged PDF a council will look at.
//
// Jukka (Meeting 2): council rejects multi-file submissions, and "there's only
// one document they look at first — if it's not in that document, they don't
// even scroll." So the matter's documents are merged into a single PDF in a
// FIXED order.
//
// ORDER RECONCILED 2026-07-19 against the Meeting-2 notes + the real data.
// The two sections still disagree on paper, but the disagreement resolves:
//
//   - Decisions §28 lists a deed search at position 2; Details §68 omits it.
//     Prod has 13 `deed_search` documents — the third most common type in the
//     whole table — so §68 dropped it, it was not removed. KEPT.
//   - §28 says "municipal figures", §68 says "K figures and existing account".
//     Same step, two names: `clearance_figures` (14 in prod). The "existing
//     account" half is a separate document — `council_account_statement` — so
//     it is placed next to the figures rather than left to fall to the end.
//
// Everything else matches in both sections: transfer letter first, buyer's
// documents early, proof of payment after the figures, seller's documents
// second-to-last, electrical COC last and optional.
//
// Unmatched documents are appended after this sequence by the route, never
// dropped. To change the order, edit this ONE array — nothing else encodes it.

export type PackStep =
  | { kind: "type"; docType: string } // a property/matter-level document of this type
  | { kind: "party"; role: "buyer" | "seller" }; // every document belonging to a party of this role

export const COUNCIL_PACK_ORDER: PackStep[] = [
  { kind: "type", docType: "transfer_letter" },
  { kind: "type", docType: "deed_search" }, // §28; omitted by §68 but 13 live rows say it belongs
  { kind: "party", role: "buyer" }, // buyer's documents (ID / COR 14.3 + director ID / resolution)
  { kind: "type", docType: "clearance_figures" }, // "municipal figures" / "K figures"
  { kind: "type", docType: "council_account_statement" }, // §68's "existing account"
  { kind: "type", docType: "proof_of_payment_figures" },
  { kind: "party", role: "seller" }, // seller's documents
  { kind: "type", docType: "coc_electrical" }, // ✅ confirmed last, optional
];

export interface PackDoc {
  id: string;
  document_type: string;
  matter_party_id: string | null;
  file_name: string | null;
  mime_type: string | null;
  storage_bucket: string | null;
  storage_path: string | null;
}

export interface OrderedPack {
  /** Documents in council order. */
  ordered: PackDoc[];
  /**
   * Provided documents that matched no step (an unexpected type, or a party role
   * the order doesn't name). Appended AFTER the ordered set rather than dropped —
   * a silently missing document in a council pack is worse than an extra page.
   */
  leftover: PackDoc[];
}

// Order a matter's documents for the council pack. `partyRoleById` maps a
// matter_party_id to its role so party steps can gather the right person's docs.
export function orderForCouncil(
  docs: PackDoc[],
  partyRoleById: Record<string, string>
): OrderedPack {
  const pool = [...docs];
  const ordered: PackDoc[] = [];

  const take = (pred: (d: PackDoc) => boolean) => {
    const kept: PackDoc[] = [];
    for (const d of pool) (pred(d) ? ordered : kept).push(d);
    pool.length = 0;
    pool.push(...kept);
  };

  for (const step of COUNCIL_PACK_ORDER) {
    if (step.kind === "type") {
      // Property/matter-level: this type, not attached to a party.
      take((d) => d.document_type === step.docType && !d.matter_party_id);
    } else {
      take((d) => d.matter_party_id != null && partyRoleById[d.matter_party_id] === step.role);
    }
  }

  return { ordered, leftover: pool };
}
