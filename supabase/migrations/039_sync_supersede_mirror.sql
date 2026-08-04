-- ============================================================================
-- 039 — Replacing a matter document must demote its mirror on the transfer
--
-- THE BUG (found by Zewn testing live, 2026-07-20)
--   Replace the certified ID on a matter and the PROPERTY TRANSFER ends up
--   showing BOTH copies.
--
--   Migration 038 mirrors a matter document onto its transfer, de-duplicated on
--   (transfer_id, storage_path). That correctly collapses the same file uploaded
--   twice. But a REPLACEMENT is a different file at a different path, so it
--   earns a new mirror — and meanwhile supersedeSlot() demotes the old document
--   on the MATTER while nothing at all touches its mirror on the TRANSFER.
--
--   Result: the matter shows one current document (right) and the transfer shows
--   two (wrong). The de-dup guard was never the thing that could catch this —
--   they are genuinely different files.
--
-- THE FIX
--   When a documents row leaves 'provided', demote the transfer document that
--   mirrors it. The transfer's document list already filters
--   `status <> 'superseded'`, so the stale copy simply drops out of view and
--   stays in the table for audit — the same lifecycle 034 and 032 use.
--
-- WHY A TRIGGER AND NOT APP CODE — the same argument as 038. supersedeSlot runs
-- in the app, but the n8n onboarding flow updates documents directly, and the
-- 030 slot index can demote rows too. The database is the only place that sees
-- every writer.
--
-- ONLY DEMOTES MIRRORS THIS MATTER OWNS. A documents row whose file lives in the
-- transfer's own bucket is a REUSE pointer (034, "From transfer") — superseding
-- the matter's copy of a borrowed document must never retire the transfer's
-- original, which other matters may still be using. Matched on storage_path, so
-- only a mirror created FROM this matter's own upload is affected.
--
-- Additive, idempotent, single transaction. Applied manually in the SQL editor.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.demote_superseded_transfer_mirror()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_transfer_id uuid;
BEGIN
  -- Only act when a document stops being the current one in its slot.
  IF NEW.document_status = OLD.document_status THEN
    RETURN NEW;
  END IF;
  IF NEW.document_status <> 'superseded' THEN
    RETURN NEW;
  END IF;
  IF NEW.storage_path IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT m.transfer_id INTO v_transfer_id
  FROM matters m
  WHERE m.id = NEW.matter_id;

  IF v_transfer_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Demote the mirror of THIS file only, and only if no other matter is still
  -- pointing at it. A mirror in use elsewhere is somebody else's current
  -- document and is not ours to retire.
  UPDATE transfer_documents td
  SET status = 'superseded'
  WHERE td.transfer_id = v_transfer_id
    AND td.storage_path = NEW.storage_path
    AND td.status = 'current'
    AND NOT EXISTS (
      SELECT 1
      FROM documents d
      WHERE d.transfer_document_id = td.id
        AND d.id <> NEW.id
        AND d.document_status = 'provided'
    );

  RETURN NEW;

EXCEPTION WHEN OTHERS THEN
  -- Same posture as 038: never fail the originating write for the mirror's sake.
  -- Worst case is the stale copy lingering on the transfer, which is the bug
  -- this fixes, not a new one.
  RAISE WARNING 'demote_superseded_transfer_mirror failed for document %: % (%)',
    NEW.id, SQLERRM, SQLSTATE;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.demote_superseded_transfer_mirror() IS
  'When a matter document is superseded, retires the transfer document that '
  'mirrors it (migration 039), so replacing a file does not leave both copies '
  'on the property transfer. Never touches a mirror another matter still uses.';

DROP TRIGGER IF EXISTS trg_documents_demote_transfer_mirror ON public.documents;
CREATE TRIGGER trg_documents_demote_transfer_mirror
  AFTER UPDATE OF document_status ON public.documents
  FOR EACH ROW
  EXECUTE FUNCTION public.demote_superseded_transfer_mirror();

COMMIT;

-- ============================================================================
-- CLEAN UP THE ROWS ALREADY STRANDED (optional, run once)
--
-- The trigger only fires on future supersedes. Anything already duplicated by
-- this bug — Zewn's replaced Peter van der Merwe certified ID among them — is
-- still sitting on its transfer. Preview first:
--
--   SELECT td.id, td.file_name, td.created_at, t.reference
--   FROM transfer_documents td
--   JOIN property_transfers t ON t.id = td.transfer_id
--   JOIN documents d ON d.storage_path = td.storage_path
--   WHERE td.status = 'current'
--     AND d.document_status = 'superseded'
--     AND NOT EXISTS (
--       SELECT 1 FROM documents d2
--       WHERE d2.transfer_document_id = td.id AND d2.document_status = 'provided'
--     );
--
-- Then demote exactly those:
--
--   UPDATE transfer_documents td
--   SET status = 'superseded'
--   WHERE td.status = 'current'
--     AND EXISTS (
--       SELECT 1 FROM documents d
--       WHERE d.storage_path = td.storage_path AND d.document_status = 'superseded'
--     )
--     AND NOT EXISTS (
--       SELECT 1 FROM documents d2
--       WHERE d2.transfer_document_id = td.id AND d2.document_status = 'provided'
--     );
--
-- VERIFY:
--   SELECT tgname, tgenabled FROM pg_trigger
--   WHERE tgrelid = 'public.documents'::regclass AND NOT tgisinternal;
--
-- ROLLBACK:
--   DROP TRIGGER IF EXISTS trg_documents_demote_transfer_mirror ON public.documents;
-- ============================================================================
