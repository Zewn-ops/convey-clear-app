-- ============================================================================
-- 041 — transfer_documents.original_file_name
-- ============================================================================
-- WHY
--   Migration 040 gave matter documents a canonical name and kept the uploader's
--   original filename alongside it, as provenance for matching a document back to
--   the email it arrived in. Transfer-level documents never got either, because
--   the naming code was unreachable from that write path: canonicalDocumentName()
--   keys off a matterId and a transfer document has no matter. That is why deed
--   searches and transfer confirmation letters were still landing as "A4 - 1.pdf"
--   after canonical naming shipped on 2026-07-20.
--
--   The application fix (feature/transfer-doc-naming) resolves the subject from
--   property_transfers.property_description instead. This migration adds the
--   matching provenance column.
--
-- SAFE IN EITHER DEPLOY ORDER — this is the whole point of shipping it this way:
--   * migration first, code later  → column sits unused and NULL. Harmless.
--   * code first, migration later  → the insert fails with 42703, the route
--     catches exactly that code, drops the column and re-inserts. The upload
--     still succeeds; it simply carries no original filename until this runs.
--   Nothing here can break an upload, so it can be applied at any time.
--
-- NOT NULL is deliberately NOT set: rows created before this migration have no
-- original filename to record, and inventing one would be worse than a NULL.
-- ============================================================================

ALTER TABLE public.transfer_documents
  ADD COLUMN IF NOT EXISTS original_file_name text;

COMMENT ON COLUMN public.transfer_documents.original_file_name IS
  'The filename as uploaded, before canonical renaming (see lib/doc-naming.ts). '
  'Provenance only — file_name is what users see. NULL for rows predating 041.';

-- VERIFY:
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'transfer_documents' AND column_name = 'original_file_name';
--
-- ROLLBACK:
--   ALTER TABLE public.transfer_documents DROP COLUMN IF EXISTS original_file_name;
