import type { SupabaseClient } from "@supabase/supabase-js";

// Document intake slots (migration 030).
//
// A slot is (matter, party, document_type) — NOT (matter, document_type): a COO
// matter has a buyer AND a seller, each with their own certified ID.
//
// One document is current per slot. Re-uploading into a filled slot SUPERSEDES
// what was there rather than stacking a second row beside it, because the intake
// resolves a slot with `documents.find(...)` — the first match — so a stacked row
// left the slot showing the OLD file. Superseded rows stay in the table for audit
// and are hidden from the matter document lists.
//
// A unique partial index enforces the same rule in the database, which is what
// covers the n8n onboarding-docs flow (it inserts documents rows directly).

/** Not intake slots — 'other' is the catch-all, a matter may hold many. */
const SLOT_EXEMPT_DOC_TYPES = new Set(["other"]);

export const CURRENT_DOC_STATUSES_EXCLUDED = "superseded";

export function isSlotted(documentType: string | null | undefined): boolean {
  return Boolean(documentType) && !SLOT_EXEMPT_DOC_TYPES.has(documentType as string);
}

/**
 * Demote whatever currently occupies this slot, so the caller's insert becomes
 * the one current document. No-op for exempt types and for empty slots.
 * Returns the ids that were superseded (empty when the slot was free).
 *
 * Call with a service-role client, immediately before inserting.
 */
export async function supersedeSlot(
  admin: SupabaseClient,
  slot: { matterId: string; matterPartyId: string | null; documentType: string }
): Promise<string[]> {
  if (!isSlotted(slot.documentType)) return [];

  let q = admin
    .from("documents")
    .update({ document_status: "superseded", updated_at: new Date().toISOString() })
    .eq("matter_id", slot.matterId)
    .eq("document_type", slot.documentType)
    .eq("document_status", "provided");

  // A party-less (matter-level) document has matter_party_id NULL, and `.eq`
  // never matches NULL — it has to be `.is`.
  q = slot.matterPartyId ? q.eq("matter_party_id", slot.matterPartyId) : q.is("matter_party_id", null);

  const { data, error } = await q.select("id");
  if (error) throw new Error(`Could not replace the existing document: ${error.message}`);
  return (data ?? []).map((d: { id: string }) => d.id);
}

/**
 * Keep only the last occurrence of each slot in a batch about to be inserted.
 * The DB index rejects the whole statement on the first in-batch collision, so a
 * client submitting two files for one slot would otherwise lose the entire
 * submission to a raw 23505.
 */
export function dedupeSlotBatch<T extends { document_type?: string | null; matter_party_id?: string | null }>(
  rows: T[]
): T[] {
  const bySlot = new Map<string, T>();
  const exempt: T[] = [];
  for (const r of rows) {
    if (!isSlotted(r.document_type)) {
      exempt.push(r);
      continue;
    }
    bySlot.set(`${r.matter_party_id ?? "null"}::${r.document_type}`, r);
  }
  return [...Array.from(bySlot.values()), ...exempt];
}

/** Turn a slot-index violation into something a human can act on. */
export function isSlotConflict(error: { code?: string; message?: string } | null): boolean {
  return error?.code === "23505" && Boolean(error.message?.includes("documents_one_current_per_slot"));
}
