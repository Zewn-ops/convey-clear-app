-- ============================================================================
-- 044 — document disapproval (reject-with-reason), INERT
-- ============================================================================
-- WHY
--   Zewn (2026-07-23): the approval queue (042/043) could only APPROVE. An admin
--   who sees the wrong file went up had no way to record that — the document just
--   sat pending forever with no signal to the uploader. This adds an explicit
--   "not approved" outcome that carries a reason and notifies the uploader, and a
--   third visual state (pending / approved / disapproved) for the doc lists.
--
-- THIS MIGRATION CHANGES NO VISIBILITY.
--   043's read policies gate solely on `approved_at IS NOT NULL`. A disapproved
--   document has approved_at = NULL, so it stays hidden from clients and the
--   partner firm exactly as a pending one does — the disapproval columns are
--   invisible to those policies. So, like 042, this is a no-op for every reader
--   and safe to apply in ANY order relative to the app deploy. Apply it BEFORE
--   deploying the app that reads these columns (same discipline as 042).
--
-- STATE MODEL after this migration
--   approved_at IS NULL  AND disapproved_at IS NULL   -> pending  (grey)
--   approved_at IS NOT NULL                           -> approved (released by 043)
--   disapproved_at IS NOT NULL                        -> disapproved (held, has reason)
--   (approved and disapproved are mutually exclusive; the routes enforce it by
--    only acting on a row that is still pending.)
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Disapproval columns
-- ----------------------------------------------------------------------------
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS disapproved_at     timestamptz,
  ADD COLUMN IF NOT EXISTS disapproved_by     uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS disapproval_reason text;

ALTER TABLE public.transfer_documents
  ADD COLUMN IF NOT EXISTS disapproved_at     timestamptz,
  ADD COLUMN IF NOT EXISTS disapproved_by     uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS disapproval_reason text;

-- No backfill. Every existing row is approved (042 stamped approved_at), so
-- leaving disapproved_at NULL everywhere is correct: nothing is disapproved.

-- ----------------------------------------------------------------------------
-- 2. Disapproving a matter document disapproves its transfer mirror
-- ----------------------------------------------------------------------------
-- Mirrors the shape of 042's propagate_document_approval. The two-way sync (038)
-- copies a matter upload onto its property transfer as a separate row read by a
-- separate policy; without this the mirror would keep showing as merely "pending"
-- to staff on the transfer after the matter copy was rejected. The mirror's
-- client/partner visibility is unaffected either way (approved_at stays NULL) —
-- this is purely so the staff-facing state stays consistent across the two rows.
-- Matched on storage_path, the same key 039 and 042 use, because the mirror
-- shares the storage object rather than copying it.
CREATE OR REPLACE FUNCTION public.propagate_document_disapproval()
RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.disapproved_at IS NULL AND NEW.disapproved_at IS NOT NULL THEN
    UPDATE transfer_documents td
       SET disapproved_at     = NEW.disapproved_at,
           disapproved_by     = NEW.disapproved_by,
           disapproval_reason = NEW.disapproval_reason
     WHERE td.storage_path = NEW.storage_path
       AND td.approved_at IS NULL
       AND td.disapproved_at IS NULL;
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'propagate_document_disapproval failed for document %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_documents_propagate_disapproval ON public.documents;
CREATE TRIGGER trg_documents_propagate_disapproval
  AFTER UPDATE OF disapproved_at ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.propagate_document_disapproval();

COMMIT;

-- ============================================================================
-- VERIFY
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'documents'
--      AND column_name IN ('disapproved_at','disapproved_by','disapproval_reason');  -- 3 rows
--   SELECT tgname FROM pg_trigger
--    WHERE tgrelid = 'public.documents'::regclass AND NOT tgisinternal
--      AND tgname = 'trg_documents_propagate_disapproval';                            -- 1 row
--   -- 043's policies are untouched — a disapproved doc is hidden by approved_at,
--   -- not by these columns:
--   SELECT count(*) FROM documents WHERE disapproved_at IS NOT NULL;                  -- 0 right after apply
--
-- ROLLBACK
--   DROP TRIGGER IF EXISTS trg_documents_propagate_disapproval ON public.documents;
--   DROP FUNCTION IF EXISTS public.propagate_document_disapproval();
--   -- columns can stay; they are inert without the app.
-- ============================================================================
