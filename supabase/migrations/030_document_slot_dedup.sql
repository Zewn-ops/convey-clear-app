-- ============================================================================
-- 030 — One current document per intake slot (de-duplication)
--
-- PROBLEM
--   Nothing stopped the same required document attaching to a matter twice.
--   The in-place intake resolves a slot with
--     documents.find(d => d.document_type === type && d.matter_party_id === party)
--   i.e. the FIRST match — so re-uploading a corrected file left the slot still
--   showing the OLD one, with the new row invisible behind it.
--
-- THE SLOT KEY IS (matter, party, type) — NOT (matter, type)
--   A COO matter has a buyer AND a seller, each with their own certified ID.
--   Against production today, (matter_id, document_type) alone reports 11
--   "duplicate" groups, but 9 of them are legitimate buyer/seller pairs that
--   separate cleanly once matter_party_id is in the key. Uniqueness on
--   (matter_id, document_type) would have been WRONG and would have aborted
--   on apply.
--
-- 'other' IS EXEMPT
--   'other' is the catch-all type: a matter may carry many unrelated files
--   under it (the remaining 2 production groups are exactly this — different
--   filenames, same 'other' bucket). It is not an intake slot, so it is not
--   constrained.
--
-- REPLACE, DON'T REJECT
--   There is no delete-document path anywhere in the app, so rejecting a second
--   upload would strand the user with no way to correct a wrong file. Instead a
--   new upload SUPERSEDES the one in its slot: the old row is demoted to
--   document_status='superseded', which drops it out of the index predicate and
--   keeps it for audit. Hence the widened CHECK below.
--
-- Additive, idempotent, single transaction. Applied manually (Supabase SQL
-- editor) like every migration in this folder.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Allow the 'superseded' status.
--    The base CHECK (old/001_schema.sql) is an inline, auto-named constraint:
--    documents_document_status_check. Look it up rather than trusting the name.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  con_name text;
BEGIN
  SELECT c.conname INTO con_name
  FROM pg_constraint c
  WHERE c.conrelid = 'public.documents'::regclass
    AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) ILIKE '%document_status%';

  IF con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.documents DROP CONSTRAINT %I', con_name);
  END IF;
END $$;

ALTER TABLE public.documents
  ADD CONSTRAINT documents_document_status_check
  CHECK (document_status IN (
    'provided',
    'not_available_reason_given',
    'required',
    'optional',
    'rejected',
    'superseded'          -- NEW: replaced by a newer upload in the same slot
  ));

COMMENT ON COLUMN public.documents.document_status IS
  'provided = the current file in its intake slot. superseded = replaced by a '
  'newer upload in the same (matter, party, type) slot; retained for audit, '
  'hidden from the matter document lists.';

-- ----------------------------------------------------------------------------
-- 2. Pre-flight: refuse to create the index if production would violate it.
--    A bare CREATE UNIQUE INDEX would fail with a bare 23505 naming no rows.
--    This names them. Expected to pass: verified 0 violations on 2026-07-12.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  bad_count int;
  sample    text;
BEGIN
  SELECT count(*), string_agg(t.detail, E'\n' ORDER BY t.detail)
    INTO bad_count, sample
  FROM (
    SELECT format('  matter=%s party=%s type=%s -> %s rows',
                  d.matter_id,
                  coalesce(d.matter_party_id::text, 'NULL'),
                  d.document_type,
                  count(*)) AS detail
    FROM public.documents d
    WHERE d.document_status = 'provided'
      AND d.document_type <> 'other'
    GROUP BY d.matter_id, d.matter_party_id, d.document_type
    HAVING count(*) > 1
  ) t;

  IF bad_count > 0 THEN
    RAISE EXCEPTION
      'Cannot enforce one-document-per-slot: % slot(s) already hold more than one provided document.%s%s',
      bad_count, E'\n', sample
      USING HINT = 'Demote the stale rows to document_status=''superseded'' (keep the newest by uploaded_at), then re-run.';
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 3. One current document per slot.
--    COALESCE because a matter-level (party-less) document has matter_party_id
--    NULL, and in a plain unique index NULL never equals NULL — two party-less
--    docs of the same type would both slip through.
-- ----------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS documents_one_current_per_slot
  ON public.documents (
    matter_id,
    (COALESCE(matter_party_id, '00000000-0000-0000-0000-000000000000'::uuid)),
    document_type
  )
  WHERE document_status = 'provided'
    AND document_type <> 'other';

COMMENT ON INDEX public.documents_one_current_per_slot IS
  'One provided document per (matter, party, document_type) intake slot. '
  'Backstop for the app-side supersede in lib/documents.ts — it also covers '
  'the n8n onboarding-docs flow, which inserts documents rows directly and '
  'never passes through the app.';

COMMIT;

-- ----------------------------------------------------------------------------
-- Verification (run after COMMIT)
-- ----------------------------------------------------------------------------
-- Index exists:
--   SELECT indexname FROM pg_indexes
--    WHERE tablename = 'documents' AND indexname = 'documents_one_current_per_slot';
--
-- 'superseded' is accepted by the CHECK:
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conrelid = 'public.documents'::regclass AND contype = 'c';
--
-- No slot holds two current docs (must return 0 rows):
--   SELECT matter_id, matter_party_id, document_type, count(*)
--     FROM documents
--    WHERE document_status = 'provided' AND document_type <> 'other'
--    GROUP BY 1,2,3 HAVING count(*) > 1;
