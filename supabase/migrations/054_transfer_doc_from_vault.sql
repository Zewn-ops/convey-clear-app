-- ============================================================================
-- 054 — a transfer document may come from a client's FICA vault
-- ============================================================================
-- Decision, Meeting 2 (2026-08-06) as answered by Zewn 2026-08-07: the FICA
-- vault stays, UNLINKED from the property transfer — but ConveyClear members get
-- a backdoor to pull a vault document onto a transfer. Attorneys and clients do
-- not get that option.
--
-- WHY A COLUMN AND NOT A COPY
--   Exactly parallel to documents.client_document_id (025) and
--   documents.transfer_document_id (034): the row points at the SAME storage
--   object rather than duplicating the bytes. A certified ID re-uploaded per
--   transfer is how a client ends up with four copies of one document, three of
--   them stale, and no way to tell which the council actually got.
--
-- WHO CAN SEE THE RESULT — the part that matters for the privacy decision
--   transfer_documents_read (034) is can_access_transfer(): STAFF, or a firm
--   holding a live grant. There is NO client branch, so pulling a seller's FICA
--   document onto a transfer exposes it to ConveyClear and the attorney firm —
--   never to the buyer, and never to the other side. That is the property the
--   meeting was worried about (§100, buyers and sellers must not see each
--   other's FICA), and it holds without further work.
--
--   The write side is already staff-only: transfer_documents_staff_write is
--   FOR ALL USING app_is_staff(). So "not offered to attorney or client" is
--   enforced by RLS, not only by hiding a button. The API route gates on role
--   as well, because a route that relies solely on a policy it does not name is
--   one refactor away from not being gated at all.
-- ============================================================================

BEGIN;

ALTER TABLE public.transfer_documents
  ADD COLUMN IF NOT EXISTS client_document_id uuid
    REFERENCES public.client_documents(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.transfer_documents.client_document_id IS
  'Set when this transfer document was pulled from a client FICA vault rather '
  'than uploaded to the transfer. The row carries the vault storage_bucket and '
  'storage_path, so it is the same object, not a copy. Staff-only action '
  '(Meeting 2, 2026-08-06) — attorneys and clients cannot pull from a vault.';

-- Dedupe, the same shape as 036 does for documents: the same vault document
-- lands on a transfer at most once. A superseded row must not hold the slot, or
-- replacing a document would permanently block re-attaching the newer version.
CREATE UNIQUE INDEX IF NOT EXISTS transfer_documents_one_per_vault_doc
  ON public.transfer_documents (transfer_id, client_document_id)
  WHERE client_document_id IS NOT NULL AND status <> 'superseded';

CREATE INDEX IF NOT EXISTS idx_transfer_documents_vault_src
  ON public.transfer_documents (client_document_id)
  WHERE client_document_id IS NOT NULL;

COMMIT;

-- ============================================================================
-- VERIFY
--
--   -- inert on arrival: nothing has been pulled yet
--   SELECT count(*) FROM transfer_documents WHERE client_document_id IS NOT NULL;
--   → 0
--
--   -- the dedupe actually bites (expect a unique violation on the second)
--   INSERT INTO transfer_documents (transfer_id, document_type, storage_path,
--     storage_bucket, client_document_id)
--   VALUES ('<t>', 'id_certified', '<path>', 'client-documents', '<cd>');
--   -- repeat verbatim → ERROR: duplicate key ... transfer_documents_one_per_vault_doc
--
--   -- and superseding frees the slot again
--   UPDATE transfer_documents SET status = 'superseded'
--    WHERE transfer_id = '<t>' AND client_document_id = '<cd>';
--   -- the insert above now succeeds
--
--   -- impersonate a partner: they can READ a pulled doc on a transfer they hold
--   -- a grant for, and CANNOT insert one
--   INSERT INTO transfer_documents (transfer_id, document_type, storage_path,
--     client_document_id) VALUES ('<t>', 'id_certified', '<path>', '<cd>');
--   → ERROR: new row violates row-level security policy
--
-- ROLLBACK
--   DROP INDEX IF EXISTS transfer_documents_one_per_vault_doc;
--   DROP INDEX IF EXISTS idx_transfer_documents_vault_src;
--   ALTER TABLE public.transfer_documents DROP COLUMN IF EXISTS client_document_id;
-- ============================================================================
