-- ============================================================================
-- 042 — staff-upload approval gate, PART 1 of 2: preparation (INERT)
-- ============================================================================
-- WHY
--   Jukka's requirement (2026-07-22): documents uploaded by ConveyClear ops,
--   services and runners must be approved by an admin before clients and
--   business partners can see them. He wants to be sure his employees uploaded
--   the CORRECT document before it goes out to the other side of a deal.
--
-- THIS MIGRATION CHANGES NO VISIBILITY. It adds the columns, backfills every
-- existing row as approved, and installs the triggers that mark new staff
-- uploads pending. The read policies are untouched, so applying this on its own
-- is a no-op for every user. Migration 043 flips the policies.
--
--   Deliberate two-step. This project has been bitten by deploy-order gaps in
--   three separate sessions, and a visibility gate has the worst possible
--   failure mode: applied ahead of its UI, every document in production
--   disappears from client and partner view with no way to approve it back.
--   Apply 042 whenever. Apply 043 only once the approval queue is deployed.
--
-- ORDER OF OPERATIONS THAT IS SAFE AT EVERY STEP
--   1. apply 042            → nothing changes for anyone
--   2. deploy the app       → uploads start recording who made them; the admin
--                             queue appears; pending docs are still visible
--   3. apply 043            → the gate goes live
--   Rolling back is 043's DROP/CREATE in reverse; 042 can stay indefinitely.
--
-- ⚠️ WHAT IS *NOT* GATED, AND WHY
--   Client uploads (onboarding) and partner-firm uploads are auto-approved. The
--   requirement is quality control over ConveyClear's OWN employees; gating a
--   client's own document would strand the onboarding flow behind an admin who
--   has no reason to review it.
--
-- ⚠️ THIS IS A ROW-VISIBILITY GATE, NOT AN OBJECT LOCK
--   The storage policies (015, 034) authorise on the path prefix, not on the
--   row, so a pending document's FILE is still readable by anyone who already
--   knows its storage path. Paths carry a random UUID and a client never sees an
--   unapproved row, so there is no practical leak — but do not describe this as
--   sealing the file away. Closing that would mean rewriting the storage
--   policies to join back to the owning row, which is a much larger change.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Approval columns
-- ----------------------------------------------------------------------------
-- approved_at IS NULL  ==  pending. Storing a timestamp rather than a boolean
-- gives us "when" for free, which the audit trail wants anyway.

ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.transfer_documents
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES public.users(id) ON DELETE SET NULL;

-- documents.uploaded_by is TEXT ('staff' | 'attorney' | 'client') — a category,
-- NOT a user reference, despite transfer_documents.uploaded_by being a uuid FK
-- to users. Same column name, two different meanings. So there is currently no
-- way to tell WHICH employee uploaded a matter document, which the approval
-- queue needs both to resolve the uploader's role and to show Jukka who to talk
-- to. This is that column; the text one is left alone.
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS uploaded_by_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.documents.uploaded_by_user_id IS
  'The user who uploaded this document. Distinct from uploaded_by, which is a '
  'text category (staff/attorney/client), not a reference. Added by 042 for the '
  'approval gate. NULL for rows predating 042 and for direct n8n inserts.';

-- ----------------------------------------------------------------------------
-- 2. Backfill — EVERY existing row counts as approved
-- ----------------------------------------------------------------------------
-- Without this, flipping the policy in 043 would hide the entire document
-- history from every client and partner at once. Nothing that is already
-- visible may become invisible.

UPDATE public.documents
   SET approved_at = COALESCE(created_at, now())
 WHERE approved_at IS NULL;

UPDATE public.transfer_documents
   SET approved_at = COALESCE(created_at, now())
 WHERE approved_at IS NULL;

-- ----------------------------------------------------------------------------
-- 3. Which roles need approving
-- ----------------------------------------------------------------------------
-- admin and super_admin are the approvers, so their own uploads are approved on
-- arrival — making an admin approve themselves is friction with no reviewer.

CREATE OR REPLACE FUNCTION public.upload_needs_approval(p_user_id uuid, p_uploaded_by text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT CASE
    -- Known user: decide on their actual role.
    WHEN p_user_id IS NOT NULL THEN EXISTS (
      SELECT 1 FROM public.users u
       WHERE u.id = p_user_id
         AND u.role IN ('staff_services', 'staff_ops', 'staff_delivery')
    )
    -- No user reference. Fall back to the text category so the gate still works
    -- for any writer that has not been taught the new column — 'staff' is
    -- exactly the population Jukka wants reviewed. Anything else (a client's
    -- onboarding upload, an attorney's, or an unattributed row) is approved, so
    -- the client flow cannot be stranded behind a review nobody expects.
    ELSE COALESCE(p_uploaded_by, '') = 'staff'
  END;
$$;

-- ----------------------------------------------------------------------------
-- 4. Mark new staff uploads pending — in the DB, not the app
-- ----------------------------------------------------------------------------
-- The n8n onboarding flow runs INSERT INTO documents directly. Migration 030
-- and 038 both learned the same lesson the hard way: an app-side guard cannot
-- reach a writer you do not control. A gate that only exists in the route
-- handlers is not a gate.

CREATE OR REPLACE FUNCTION public.set_document_approval()
RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF public.upload_needs_approval(NEW.uploaded_by_user_id, NEW.uploaded_by) THEN
    NEW.approved_at := NULL;
    NEW.approved_by := NULL;
  ELSIF NEW.approved_at IS NULL THEN
    NEW.approved_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_documents_set_approval ON public.documents;
CREATE TRIGGER trg_documents_set_approval
  BEFORE INSERT ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.set_document_approval();

-- transfer_documents.uploaded_by IS a uuid FK here, so pass it as the user and
-- give the text fallback nothing to match on.
--
-- ⚠️ The uploaded_by IS NULL branch is load-bearing. Rows inserted by 038's sync
-- trigger carry no uploader and set approved_at EXPLICITLY from the source
-- document (see step 5). Auto-approving them here would let a pending matter
-- upload reappear on the property transfer, where the partner firm reads it —
-- straight around the gate. So when there is no uploader, whatever the inserter
-- chose is respected verbatim.
CREATE OR REPLACE FUNCTION public.set_transfer_document_approval()
RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.uploaded_by IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.upload_needs_approval(NEW.uploaded_by, NULL) THEN
    NEW.approved_at := NULL;
    NEW.approved_by := NULL;
  ELSIF NEW.approved_at IS NULL THEN
    NEW.approved_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_transfer_documents_set_approval ON public.transfer_documents;
CREATE TRIGGER trg_transfer_documents_set_approval
  BEFORE INSERT ON public.transfer_documents
  FOR EACH ROW EXECUTE FUNCTION public.set_transfer_document_approval();

-- ----------------------------------------------------------------------------
-- 5. The two-way sync must carry approval state upward
-- ----------------------------------------------------------------------------
-- Replaces 038's function. The ONLY change is that the mirror insert now copies
-- approved_at / approved_by from the source document. Everything else is 038
-- verbatim, including the early returns and the idempotency key.
--
-- This is the whole reason gating public.documents alone is insufficient: the
-- mirror is a separate row in a separate table read by a separate policy, and
-- 038 creates it on INSERT — immediately, before any human has looked at it.

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
  IF NEW.storage_path IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.transfer_document_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT m.transfer_id INTO v_transfer_id
  FROM matters m
  WHERE m.id = NEW.matter_id;

  IF v_transfer_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT td.id INTO v_tdoc_id
  FROM transfer_documents td
  WHERE td.transfer_id = v_transfer_id
    AND td.storage_path = NEW.storage_path
  LIMIT 1;

  IF v_tdoc_id IS NULL THEN
    INSERT INTO transfer_documents (
      transfer_id, document_type, file_name, mime_type, size_bytes,
      storage_bucket, storage_path, status,
      approved_at, approved_by
    ) VALUES (
      v_transfer_id,
      COALESCE(NEW.document_type, 'other'),
      NEW.file_name,
      NEW.mime_type,
      NEW.size_bytes,
      COALESCE(NEW.storage_bucket, 'matter-documents'),
      NEW.storage_path,
      'current',
      NEW.approved_at,   -- pending source ⇒ pending mirror
      NEW.approved_by
    )
    RETURNING id INTO v_tdoc_id;

    v_label := COALESCE(NEW.file_name, NEW.document_type, 'A document');

    INSERT INTO transfer_activities (transfer_id, activity_type, author_label, body)
    VALUES (
      v_transfer_id,
      'document_upload',
      'System (document sync)',
      'Synced from a matter: ' || v_label
    );
  END IF;

  UPDATE documents SET transfer_document_id = v_tdoc_id WHERE id = NEW.id;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'sync_document_to_transfer failed for document %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

-- ----------------------------------------------------------------------------
-- 6. Approving a document approves its mirror
-- ----------------------------------------------------------------------------
-- Otherwise an admin approves on the matter, the document appears for the
-- client, and the copy on the property transfer stays invisible to the firm —
-- the gate would become a permanent half-open state instead of a review step.
-- Matched on storage_path, the same key 039 uses, because the mirror shares the
-- object rather than copying it.

CREATE OR REPLACE FUNCTION public.propagate_document_approval()
RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.approved_at IS NULL AND NEW.approved_at IS NOT NULL THEN
    UPDATE transfer_documents td
       SET approved_at = NEW.approved_at,
           approved_by = NEW.approved_by
     WHERE td.storage_path = NEW.storage_path
       AND td.approved_at IS NULL;
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'propagate_document_approval failed for document %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_documents_propagate_approval ON public.documents;
CREATE TRIGGER trg_documents_propagate_approval
  AFTER UPDATE OF approved_at ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.propagate_document_approval();

COMMIT;

-- ============================================================================
-- VERIFY (all of these should hold immediately after applying)
--
--   -- no existing row was left pending:
--   SELECT count(*) FROM documents WHERE approved_at IS NULL;           -- 0
--   SELECT count(*) FROM transfer_documents WHERE approved_at IS NULL;  -- 0
--
--   -- triggers installed:
--   SELECT tgname FROM pg_trigger
--    WHERE tgrelid IN ('public.documents'::regclass,
--                      'public.transfer_documents'::regclass)
--      AND NOT tgisinternal;
--
--   -- the policies are still the OLD ones (042 must not gate anything):
--   SELECT polname, pg_get_expr(polqual, polrelid) FROM pg_policy
--    WHERE polrelid = 'public.documents'::regclass;
--
-- ROLLBACK:
--   DROP TRIGGER IF EXISTS trg_documents_set_approval ON public.documents;
--   DROP TRIGGER IF EXISTS trg_transfer_documents_set_approval ON public.transfer_documents;
--   DROP TRIGGER IF EXISTS trg_documents_propagate_approval ON public.documents;
--   -- and re-apply 038 to restore the original sync function.
--   -- The columns can stay; they are inert without 043.
-- ============================================================================
