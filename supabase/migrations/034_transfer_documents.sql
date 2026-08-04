-- ============================================================================
-- 034 — Property Transfers: transfer-level documents (doc groups)
--
-- THE POINT
--   One property transaction spawns SEVERAL matters (PRC → COO → refund). The
--   transfer hub (026) grouped them, but documents stayed matter-scoped — so the
--   deed search, the transfer confirmation letter and the clearance figures got
--   uploaded again for every matter in the same transaction. They are one
--   document about one property, not three.
--
--   A transfer document is uploaded ONCE against the transfer and reused on any
--   matter inside it, exactly as a client's FICA doc is reused across matters.
--   Same shape as migration 025, deliberately: `documents.transfer_document_id`
--   mirrors `documents.client_document_id`, and the reuse row carries the source
--   bucket + path so every existing viewer keeps working (signedDocUrls is
--   already bucket-aware).
--
-- REUSE SHARES THE OBJECT — IT DOES NOT COPY IT
--   As with the client vault (032): a matter's documents row points at the SAME
--   storage object. Deleting a transfer document would blank the View link on
--   every matter that reused it, so removal is a status change, and the API only
--   hard-deletes when nothing references the row.
--
-- ACCESS
--   Governed by can_access_transfer() (026): staff, plus users of the owning
--   attorney firm. Clients see NOTHING at transfer level — a transfer spans both
--   sides of the deal, so exposing it to one party leaks the counterparty. That
--   rule is unchanged; reusing a transfer doc ONTO a matter is what makes it
--   visible to that matter's parties, which is a deliberate, per-document act.
--
-- Additive, idempotent, single transaction. Applied manually in the SQL editor.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. The documents that belong to the transaction, not to any one matter.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.transfer_documents (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id    uuid NOT NULL REFERENCES public.property_transfers(id) ON DELETE CASCADE,
  document_type  text NOT NULL,
  file_name      text,
  mime_type      text,
  size_bytes     bigint,
  storage_bucket text NOT NULL DEFAULT 'transfer-documents',
  storage_path   text NOT NULL,            -- '<transfer_id>/<uuid>-<filename>'
  -- Same lifecycle as the client vault (032), for the same reason.
  status         text NOT NULL DEFAULT 'current'
                   CHECK (status IN ('current', 'superseded', 'archived')),
  supersedes_id  uuid REFERENCES public.transfer_documents(id) ON DELETE SET NULL,
  verified       boolean NOT NULL DEFAULT false,
  verified_at    timestamptz,
  verified_by    uuid REFERENCES public.users(id) ON DELETE SET NULL,
  notes          text,
  uploaded_by    uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transfer_documents_transfer
  ON public.transfer_documents(transfer_id) WHERE status = 'current';

-- No unique key on (transfer_id, document_type) — the same call as 030 and 032.
-- A transaction can hold more than one document of a kind (two erf diagrams, a
-- revised clearance figure). Replace is an explicit act against a document id.

-- ----------------------------------------------------------------------------
-- 2. Reuse link — a matter's document can point at the transfer doc it satisfies.
--    Exactly parallel to documents.client_document_id (025).
-- ----------------------------------------------------------------------------
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS transfer_document_id uuid
    REFERENCES public.transfer_documents(id) ON DELETE SET NULL;

-- ----------------------------------------------------------------------------
-- 3. RLS — read via can_access_transfer (staff + the owning firm); writes staff
--    only, matching how transfers themselves are written (026).
-- ----------------------------------------------------------------------------
ALTER TABLE public.transfer_documents ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transfer_documents TO authenticated;

DROP POLICY IF EXISTS transfer_documents_read ON public.transfer_documents;
CREATE POLICY transfer_documents_read ON public.transfer_documents FOR SELECT TO authenticated
  USING (public.can_access_transfer(transfer_id));

DROP POLICY IF EXISTS transfer_documents_staff_write ON public.transfer_documents;
CREATE POLICY transfer_documents_staff_write ON public.transfer_documents FOR ALL TO authenticated
  USING (public.app_is_staff()) WITH CHECK (public.app_is_staff());

-- ----------------------------------------------------------------------------
-- 4. Private bucket, path '<transfer_id>/...' — the leading UUID is what the
--    storage policy scopes against, same convention as 015 and 025.
-- ----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('transfer-documents', 'transfer-documents', false, 52428800,
        ARRAY['application/pdf','image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS transferdocs_staff_all ON storage.objects;
CREATE POLICY transferdocs_staff_all ON storage.objects FOR ALL TO authenticated
  USING      (bucket_id = 'transfer-documents' AND public.app_is_staff())
  WITH CHECK (bucket_id = 'transfer-documents' AND public.app_is_staff());

DROP POLICY IF EXISTS transferdocs_read_scoped ON storage.objects;
CREATE POLICY transferdocs_read_scoped ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'transfer-documents'
    AND name ~ '^[0-9a-fA-F-]{36}/'
    AND public.can_access_transfer( split_part(name, '/', 1)::uuid )
  );

-- ⚠️ A matter party who was given a REUSED transfer document reads it through the
--    matter, not through this policy — the documents row carries the
--    'transfer-documents' bucket, and matter-document reads are signed
--    SERVER-SIDE with the service role (signedDocUrls), which bypasses storage
--    RLS. That is already how reused client-vault docs work (025). The policy
--    above governs direct browser access, and correctly denies it to clients.

COMMIT;

-- ============================================================================
-- Verification
-- ============================================================================
-- Table + column + bucket landed:
--   SELECT to_regclass('public.transfer_documents');
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name='documents' AND column_name='transfer_document_id';
--   SELECT id, public FROM storage.buckets WHERE id = 'transfer-documents';
--
-- Policies (expect 2 on the table, 2 on storage.objects):
--   SELECT policyname FROM pg_policies WHERE tablename = 'transfer_documents';
--   SELECT policyname FROM pg_policies
--    WHERE tablename = 'objects' AND policyname LIKE 'transferdocs%';
--
-- The bucket INSERT sits INSIDE this transaction next to both storage policies,
-- so — as with 025 — the bucket existing proves the policies committed.
