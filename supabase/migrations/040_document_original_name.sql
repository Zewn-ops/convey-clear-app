-- ============================================================================
-- 040 — Keep the uploader's original filename
--
-- THE POINT
--   Documents are now stored under a canonical name generated at upload:
--     Certified ID — Peter van der Merwe — 2026-07-20.pdf
--   instead of whatever the uploader's file was called (`A4 - 1.pdf`), which
--   told you nothing once the document travelled to a transfer or a council
--   pack.
--
--   Overwriting file_name would throw away real information: the name a
--   document arrived under is how you match it back to the email or the folder
--   it came from. So the original is kept alongside rather than discarded.
--
-- NO BACKFILL, DELIBERATELY. Existing documents keep the names they have.
-- Renaming 99 live rows automatically is hard to undo and nobody asked for it;
-- new uploads simply start naming themselves properly. If a sweep is wanted
-- later it should be a considered, previewed one-off, not a side effect of a
-- schema change.
--
-- Additive, idempotent, single transaction. Applied manually in the SQL editor.
-- ============================================================================

BEGIN;

ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS original_file_name text;

COMMENT ON COLUMN public.documents.original_file_name IS
  'The filename as uploaded, before canonical renaming (migration 040). '
  'file_name holds the display name and may be edited by staff; this holds '
  'provenance and is never rewritten.';

-- Deliberately NOT added to transfer_documents. The mirror carries the canonical
-- display name, which is what makes a transfer's document list readable; the
-- provenance belongs on the matter document, which is the row that was actually
-- uploaded. A column nothing populates is worse than no column.

COMMIT;

-- ============================================================================
-- VERIFY
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'documents' AND column_name = 'original_file_name';
--   -- expect 1 row
--
-- ROLLBACK
--   ALTER TABLE public.documents DROP COLUMN IF EXISTS original_file_name;
-- ============================================================================
