-- ============================================================================
-- 032 — FICA vault v2: expiry tracking, verification, versioning
--
-- Closes the v1.2 item deferred at the A&A dry run ("FICA doc expiry tracking +
-- versioning"). The vault shipped as "simple reuse" — a flat list you could add
-- to and nothing else. No expiry, no verification, no way to replace or remove a
-- document. This adds the state a FICA document actually has.
--
-- WHY THERE IS NO UNIQUE CONSTRAINT ON (client_id, document_type)
--   It is tempting, and it is wrong — the same mistake migration 030 nearly
--   made on `documents`. A BUSINESS client legitimately holds a certified ID for
--   EACH director; a TRUST holds a letter of authority for each trustee. Vault
--   documents are not slots. "Replace" is therefore an explicit action against a
--   specific document id, never an implicit one inferred from its type.
--
-- STATUS, NOT DELETION
--   A matter's `documents` row copies the vault doc's storage_bucket +
--   storage_path — the SAME storage object is shared, not duplicated (that is the
--   whole point of reuse). So destroying a vault document's file would break the
--   View link on every matter that reused it. Removal is therefore a status
--   change; the API only permits a hard delete when nothing references the row.
--
-- Additive, idempotent, single transaction. Applied manually in the SQL editor.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Lifecycle status.
--    current    — the live document of its kind.
--    superseded — replaced by a newer version (see supersedes_id below).
--    archived   — withdrawn by staff, kept because a matter may still cite it.
-- ----------------------------------------------------------------------------
ALTER TABLE public.client_documents
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'current';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.client_documents'::regclass
      AND conname = 'client_documents_status_check'
  ) THEN
    ALTER TABLE public.client_documents
      ADD CONSTRAINT client_documents_status_check
      CHECK (status IN ('current', 'superseded', 'archived'));
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 2. Expiry. FICA documents go stale — a proof of address is typically only
--    accepted for 3 months. NULL = does not expire / not captured.
-- ----------------------------------------------------------------------------
ALTER TABLE public.client_documents
  ADD COLUMN IF NOT EXISTS expiry_date date;

-- ----------------------------------------------------------------------------
-- 3. Verification — a human confirmed this really is a certified copy.
--    Mirrors documents.verified/verified_at/verified_by, so the two documents
--    surfaces read the same way.
-- ----------------------------------------------------------------------------
ALTER TABLE public.client_documents
  ADD COLUMN IF NOT EXISTS verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS verified_by uuid REFERENCES public.users(id) ON DELETE SET NULL;

-- ----------------------------------------------------------------------------
-- 4. Versioning — a chain, not a flag. The new row points BACK at the one it
--    replaced, so history reads newest → oldest and an old version is never
--    rewritten.
-- ----------------------------------------------------------------------------
ALTER TABLE public.client_documents
  ADD COLUMN IF NOT EXISTS supersedes_id uuid
    REFERENCES public.client_documents(id) ON DELETE SET NULL;

ALTER TABLE public.client_documents
  ADD COLUMN IF NOT EXISTS notes text;

-- ----------------------------------------------------------------------------
-- 5. Indexes for the two reads the vault actually does.
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_client_documents_client_current
  ON public.client_documents (client_id)
  WHERE status = 'current';

CREATE INDEX IF NOT EXISTS idx_client_documents_expiry
  ON public.client_documents (expiry_date)
  WHERE status = 'current' AND expiry_date IS NOT NULL;

COMMENT ON COLUMN public.client_documents.status IS
  'current | superseded (replaced by a newer version) | archived (withdrawn). '
  'NOT deleted: a matter''s documents row shares this row''s storage object, so '
  'destroying the file would break every matter that reused it.';
COMMENT ON COLUMN public.client_documents.supersedes_id IS
  'The document this one replaced. Forms a newest-to-oldest version chain.';
COMMENT ON COLUMN public.client_documents.expiry_date IS
  'FICA documents go stale (a proof of address is typically good for 3 months). '
  'NULL = does not expire or not captured.';

COMMIT;

-- ----------------------------------------------------------------------------
-- Verification (run after COMMIT)
-- ----------------------------------------------------------------------------
-- Columns landed, and every pre-existing vault doc is 'current' (expect all):
--   SELECT status, count(*) FROM client_documents GROUP BY status;
--
-- Nothing is expired yet (expect 0 rows):
--   SELECT id, document_type, expiry_date FROM client_documents
--    WHERE status = 'current' AND expiry_date < now()::date;
