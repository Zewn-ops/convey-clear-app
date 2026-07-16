// Council submission pack — the ONE merged PDF a council will look at.
//
// Jukka (Meeting 2): council rejects multi-file submissions, and "there's only
// one document they look at first — if it's not in that document, they don't
// even scroll." So the matter's documents are merged into a single PDF in a
// FIXED order.
//
// ⚠️ THE ORDER IS ONLY PARTLY CONFIRMED. The Meeting-2 notes contradict
// themselves — the Decisions section lists a deed search where the Details
// section does not, and names the municipal-figures step differently. What IS
// settled: the electrical COC is LAST (and optional), the seller's documents sit
// second-to-last, and the buyer's documents come early. The rest below is the
// best reading of the notes. Confirm with Jukka, then edit this ONE array — the
// merge engine reads it and nothing else encodes the order.

export type PackStep =
  | { kind: "type"; docType: string } // a property/matter-level document of this type
  | { kind: "party"; role: "buyer" | "seller" }; // every document belonging to a party of this role

export const COUNCIL_PACK_ORDER: PackStep[] = [
  { kind: "type", docType: "transfer_letter" },
  { kind: "type", docType: "deed_search" }, // ⚠️ present in Decisions §28, absent in Details §68 — confirm
  { kind: "party", role: "buyer" }, // buyer's documents (ID / COR 14.3 + director ID / resolution)
  { kind: "type", docType: "clearance_figures" }, // "municipal figures" / "K figures + existing account"
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
