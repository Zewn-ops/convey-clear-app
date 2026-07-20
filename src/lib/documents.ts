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

/**
 * Postgres "column does not exist". The bug shape this project has shipped three
 * times: code that compiles perfectly and assumes a column production hasn't got
 * yet. Callers writing a NEW column should detect this and retry without it, so
 * deploying ahead of the migration degrades to the old behaviour instead of
 * breaking the feature outright.
 */
export function isUndefinedColumn(error: { code?: string } | null): boolean {
  return error?.code === "42703";
}

// ---------------------------------------------------------------------------
// Two-way document sync (matter → transfer). Migration 034 built the downward
// half — a transfer document reused onto a matter. This is the upward half:
// a document uploaded on a matter also becomes a document of its transfer.
//
// SCOPE — option B, "everything syncs", decided by Zewn 2026-07-20.
// Every document type travels up, including person-scoped FICA documents.
// That is safe ONLY under the rule that a property transfer belongs to exactly
// ONE firm: two firms on one property means two independent transfers, one
// each. Without that rule a synced certified ID would be readable by a firm
// acting for the other side of the deal. The rule is now enforced in the two
// staff link paths (api/admin/property-transfers/link and the create-matter-
// inside-a-transfer route); the partner routes already enforced it.
//
// If that rule is ever relaxed, this is the code that has to change with it.
//
// SHARES THE OBJECT, DOES NOT COPY IT — same call as 034 and the client vault:
// the transfer_documents row carries the MATTER's bucket and path. Transfer
// document lists sign with the service role and signedDocUrls is bucket-aware,
// so a row pointing into the matter bucket views correctly.
// ---------------------------------------------------------------------------

export interface TransferSyncInput {
  documentId: string;
  matterId: string;
  documentType: string;
  fileName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  storageBucket: string;
  storagePath: string;
  uploadedById: string | null;
}

export interface TransferSyncResult {
  synced: boolean;
  transferId: string | null;
  transferDocumentId: string | null;
  /** True when the object was already on the transfer and we only re-linked. */
  deduped: boolean;
}

const NOT_SYNCED: TransferSyncResult = {
  synced: false,
  transferId: null,
  transferDocumentId: null,
  deduped: false,
};

/**
 * Push a freshly-uploaded matter document up to its property transfer, and link
 * the two rows. No-op when the matter has no transfer.
 *
 * Idempotent on (transfer_id, storage_path): a re-fired confirm, a retry, or two
 * racing tabs re-link the existing transfer document instead of stacking a
 * second row for the same object — the same failure this project hit with
 * duplicate activity rows and duplicate slot rows.
 *
 * Call with a service-role client. Callers should treat a throw as non-fatal:
 * the upload itself already succeeded and must not be failed by the mirror.
 */
export async function syncMatterDocToTransfer(
  admin: SupabaseClient,
  input: TransferSyncInput
): Promise<TransferSyncResult> {
  const { data: matter } = await admin
    .from("matters")
    .select("transfer_id")
    .eq("id", input.matterId)
    .maybeSingle();

  const transferId = (matter?.transfer_id as string | null) ?? null;
  if (!transferId) return NOT_SYNCED;

  // Already up there? Re-link rather than duplicate.
  const { data: existing } = await admin
    .from("transfer_documents")
    .select("id")
    .eq("transfer_id", transferId)
    .eq("storage_path", input.storagePath)
    .maybeSingle();

  if (existing?.id) {
    await admin
      .from("documents")
      .update({ transfer_document_id: existing.id })
      .eq("id", input.documentId);
    return { synced: true, transferId, transferDocumentId: existing.id as string, deduped: true };
  }

  const { data: tdoc, error } = await admin
    .from("transfer_documents")
    .insert({
      transfer_id: transferId,
      document_type: input.documentType,
      file_name: input.fileName,
      mime_type: input.mimeType,
      size_bytes: input.sizeBytes,
      storage_bucket: input.storageBucket,
      storage_path: input.storagePath,
      status: "current",
      uploaded_by: input.uploadedById,
    })
    .select("id")
    .single();

  if (error) throw new Error(`Could not sync the document to its transfer: ${error.message}`);

  await admin
    .from("documents")
    .update({ transfer_document_id: tdoc.id })
    .eq("id", input.documentId);

  return { synced: true, transferId, transferDocumentId: tdoc.id as string, deduped: false };
}
