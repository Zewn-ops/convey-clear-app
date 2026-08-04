-- ============================================================================
-- 038 — Two-way document sync, in the DATABASE
--
-- THE POINT
--   Migration 034 built the downward half of the sync (a transfer document
--   reused onto a matter). The upward half — a document uploaded on a matter
--   becoming a document of its property transfer — shipped in the application
--   on 2026-07-20.
--
--   The application cannot cover every writer. The n8n onboarding flow
--   ("CC - Submit Onboarding Docs") runs `INSERT INTO documents` directly over
--   a Postgres connection, so a client's onboarding documents never reached
--   their transfer. This is the same lesson migration 030 wrote down: an app
--   guard cannot reach a writer you don't control, so the backstop belongs in
--   the database.
--
-- WHAT THIS DOES
--   AFTER INSERT ON documents: if the matter belongs to a property transfer,
--   mirror the document onto that transfer and link the two rows. Covers the
--   portal, the onboarding form, n8n, and anything added later.
--
-- SAFE IN EITHER DEPLOY ORDER — the bug shape that has bitten this project
-- three sessions running is code that assumes a schema prod doesn't have yet.
-- There is no such assumption here, in either direction:
--   * Migration applied, old code deployed → the trigger does the mirroring on
--     its own. Nothing references anything new.
--   * New code deployed, migration not applied → the app-side sync keeps doing
--     portal uploads exactly as it does today. n8n stays unsynced, which is the
--     status quo, not a regression.
--   * Both → the app's sync finds the row the trigger already made (it matches
--     on transfer_id + storage_path), re-links to it, and reports `deduped`,
--     which suppresses its duplicate feed entry. One row, one activity line.
--
-- SECURITY INVOKER, deliberately — same reasoning as 036. Every writer today is
-- either the service role (the API routes, which authorise for themselves) or
-- the Postgres role n8n connects with. A SECURITY DEFINER trigger would
-- silently upgrade any future user-scoped writer to service-role privileges.
--
-- AND IT CAN NEVER FAIL AN UPLOAD — the whole body is wrapped in an exception
-- handler that downgrades any failure to a WARNING. The document row is the
-- thing that matters; the mirror is a convenience. A caller who somehow lacks
-- INSERT on transfer_documents gets an unsynced document, not a rejected
-- upload with their file already sitting in storage.
--
-- ⚠️ SCOPE — this mirrors EVERY document type, including person-scoped FICA
-- documents (certified IDs, COR 14.3, letters of authority). That is option B,
-- decided by Zewn on 2026-07-20, and it is safe ONLY under the rule that a
-- property transfer belongs to exactly ONE firm: two firms on one property
-- means two independent transfers, one each. The staff link routes enforce that
-- rule as of the same date. If the rule is ever relaxed, this trigger is one of
-- the two places that has to change with it.
--
-- Additive, idempotent, single transaction. Applied manually in the SQL editor.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.sync_document_to_transfer()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_transfer_id uuid;
  v_tdoc_id     uuid;
  v_label       text;
BEGIN
  -- A "not available" declaration is a documents row with no file behind it.
  IF NEW.storage_path IS NULL THEN
    RETURN NEW;
  END IF;

  -- Already points at a transfer document: this row IS the downward reuse from
  -- 034. Mirroring it back up would be circular.
  IF NEW.transfer_document_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT m.transfer_id INTO v_transfer_id
  FROM matters m
  WHERE m.id = NEW.matter_id;

  IF v_transfer_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Idempotent on (transfer_id, storage_path). A retry, a re-fired webhook or
  -- two racing tabs re-link the existing transfer document rather than stacking
  -- a second row for the same storage object — the duplicate-row failure this
  -- project has now hit on activities, on slots and on reuse.
  SELECT td.id INTO v_tdoc_id
  FROM transfer_documents td
  WHERE td.transfer_id = v_transfer_id
    AND td.storage_path = NEW.storage_path
  LIMIT 1;

  IF v_tdoc_id IS NULL THEN
    -- Shares the matter's storage object, never copies it — the same call as
    -- 034 and the client vault (032). Transfer document lists sign with the
    -- service role and the signing helper is bucket-aware, so a row pointing
    -- into the matter bucket views correctly.
    INSERT INTO transfer_documents (
      transfer_id, document_type, file_name, mime_type, size_bytes,
      storage_bucket, storage_path, status
    ) VALUES (
      v_transfer_id,
      COALESCE(NEW.document_type, 'other'),
      NEW.file_name,
      NEW.mime_type,
      NEW.size_bytes,
      COALESCE(NEW.storage_bucket, 'matter-documents'),
      NEW.storage_path,
      'current'
    )
    RETURNING id INTO v_tdoc_id;

    v_label := COALESCE(NEW.file_name, NEW.document_type, 'A document');

    -- 'document_upload' is an accepted transfer_activities type under 035.
    INSERT INTO transfer_activities (transfer_id, activity_type, author_label, body)
    VALUES (
      v_transfer_id,
      'document_upload',
      'System (document sync)',
      v_label || ' was added from a linked matter'
    );
  END IF;

  UPDATE documents
  SET transfer_document_id = v_tdoc_id
  WHERE id = NEW.id;

  RETURN NEW;

EXCEPTION WHEN OTHERS THEN
  -- Never fail the upload for the sake of the mirror. WARNING rather than
  -- silence, so a sync that stops working shows up in the Postgres log instead
  -- of quietly doing nothing — the failure mode 035 had to go back and fix.
  RAISE WARNING 'sync_document_to_transfer failed for document %: % (%)',
    NEW.id, SQLERRM, SQLSTATE;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.sync_document_to_transfer() IS
  'Mirrors a matter document onto its property transfer (migration 038). '
  'Covers every writer, including the n8n onboarding flow which inserts into '
  'documents directly. Idempotent on (transfer_id, storage_path); failures '
  'degrade to a WARNING and never fail the originating insert.';

DROP TRIGGER IF EXISTS trg_documents_sync_to_transfer ON public.documents;
CREATE TRIGGER trg_documents_sync_to_transfer
  AFTER INSERT ON public.documents
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_document_to_transfer();

COMMIT;

-- ============================================================================
-- VERIFY (run after applying)
--
--   -- 1. The trigger exists and is enabled ('O' = enabled, origin).
--   SELECT tgname, tgenabled
--   FROM pg_trigger
--   WHERE tgrelid = 'public.documents'::regclass
--     AND NOT tgisinternal;
--
--   -- 2. Nothing was mirrored retroactively — this migration deliberately does
--   --    NOT backfill. Existing matter documents stay where they are, so
--   --    applying it cannot move a document across a firm boundary. Only new
--   --    inserts sync. Expect the count to be unchanged by the migration:
--   SELECT count(*) FROM transfer_documents;
--
--   -- 3. End-to-end, on a matter that belongs to a transfer: upload a document
--   --    through the portal, then confirm exactly ONE mirror row and ONE feed
--   --    line came out of it.
--   SELECT td.id, td.file_name, td.storage_path
--   FROM transfer_documents td
--   WHERE td.transfer_id = '<transfer uuid>'
--   ORDER BY td.created_at DESC
--   LIMIT 5;
--
-- ROLLBACK (if it misbehaves — the trigger is the only new behaviour):
--   DROP TRIGGER IF EXISTS trg_documents_sync_to_transfer ON public.documents;
-- ============================================================================
