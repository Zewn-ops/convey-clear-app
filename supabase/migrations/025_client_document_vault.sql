-- 025_client_document_vault.sql
-- ============================================================================
-- A&A demo #4 / Meeting 1: reusable client-level FICA document vault.
-- ============================================================================
-- Store a client's reusable FICA docs (Certified ID, COR14.3, Power of
-- Attorney, ...) against their CLIENT record so they carry across matters —
-- no re-uploading per matter. v1 = SIMPLE REUSE. Expiry tracking + versioning
-- are v1.2.
--
-- Model:
--   * client_documents  — the reusable per-client library (own storage bucket).
--   * documents.client_document_id — when a client doc is REUSED on a matter,
--     the matter's documents row points back at it (so the existing doc lists /
--     in-place intake / signed-download all keep working unchanged).
--   * matter_parties.client_id — links a captured party to a known client
--     record so a party's reusable docs resolve (COO buyer/seller can each be a
--     repeat client).
--
-- Storage mirrors the matter-documents pattern: PRIVATE bucket, path
-- '<client_id>/...', RLS via can_access_client(); view/download over short-lived
-- signed URLs minted server-side.
--
-- ⚠ storage.objects policies must be created as the `postgres` role (as with
-- migration 015); if privilege errors, add the two clientdocs_* policies via
-- Dashboard → Storage → Policies with the same predicates.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. client_documents — reusable per-client library
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.client_documents (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id      uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  document_type  text NOT NULL,
  file_name      text,
  mime_type      text,
  size_bytes     bigint,
  storage_bucket text NOT NULL DEFAULT 'client-documents',
  storage_path   text NOT NULL,             -- '<client_id>/<uuid>-<filename>'
  uploaded_by    uuid REFERENCES public.users(id),
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_client_documents_client ON public.client_documents(client_id);

-- ----------------------------------------------------------------------------
-- 2. Reuse link — a matter's documents row can reference the client doc it
--    satisfies (nullable; normal matter uploads leave it null).
-- ----------------------------------------------------------------------------
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS client_document_id uuid
    REFERENCES public.client_documents(id) ON DELETE SET NULL;

-- ----------------------------------------------------------------------------
-- 3. Link a captured party to a known client record (so its reusable docs
--    resolve). Set when a login/contact is created from the party.
-- ----------------------------------------------------------------------------
ALTER TABLE public.matter_parties
  ADD COLUMN IF NOT EXISTS client_id uuid
    REFERENCES public.clients(id) ON DELETE SET NULL;

-- ----------------------------------------------------------------------------
-- 4. RLS on client_documents — read via can_access_client; writes staff-only
--    (inserts also go through service-role server routes, same as documents).
-- ----------------------------------------------------------------------------
ALTER TABLE public.client_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS client_documents_read ON public.client_documents;
CREATE POLICY client_documents_read ON public.client_documents FOR SELECT TO authenticated
  USING (public.can_access_client(client_id));

DROP POLICY IF EXISTS client_documents_staff_write ON public.client_documents;
CREATE POLICY client_documents_staff_write ON public.client_documents FOR ALL TO authenticated
  USING (public.app_is_staff()) WITH CHECK (public.app_is_staff());

-- ----------------------------------------------------------------------------
-- 5. Private storage bucket for client docs, path '<client_id>/...'
-- ----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('client-documents', 'client-documents', false, 52428800,
        ARRAY['application/pdf','image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS clientdocs_staff_all ON storage.objects;
CREATE POLICY clientdocs_staff_all ON storage.objects FOR ALL TO authenticated
  USING      (bucket_id = 'client-documents' AND public.app_is_staff())
  WITH CHECK (bucket_id = 'client-documents' AND public.app_is_staff());

DROP POLICY IF EXISTS clientdocs_read_scoped ON storage.objects;
CREATE POLICY clientdocs_read_scoped ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'client-documents'
    AND name ~ '^[0-9a-fA-F-]{36}/'
    AND public.can_access_client( split_part(name, '/', 1)::uuid )
  );

COMMIT;

-- ============================================================================
-- Verification
-- ============================================================================
SELECT to_regclass('public.client_documents') AS client_documents_table;
SELECT column_name FROM information_schema.columns
  WHERE table_name='documents' AND column_name='client_document_id';
SELECT column_name FROM information_schema.columns
  WHERE table_name='matter_parties' AND column_name='client_id';
SELECT id, public FROM storage.buckets WHERE id='client-documents';
SELECT policyname FROM pg_policies WHERE tablename='client_documents';
