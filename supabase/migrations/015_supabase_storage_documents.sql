-- ============================================================================
-- ConveyClear — Migration 015: Documents on Supabase Storage (private)
-- ============================================================================
-- Created: 2026-06-15. Target: Supabase yhgriqagrhyblhmloctc (eu-west-1).
--
-- WHY: Portal-first — documents move off Google Drive onto Supabase Storage.
-- Jukka signed off (demo 2026-06-15); built to the secure pattern:
--   * PRIVATE bucket (no public access)
--   * RLS on storage.objects: staff full; matter-viewers read; writes via
--     service-role / server-minted signed-upload URLs only
--   * Short-lived signed URLs for view/download (minted server-side)
--   * Path convention: '<matter_id>/<...>' so RLS can reuse can_access_matter()
--
-- Existing Drive docs keep working (documents.drive_file_id retained). New
-- uploads populate documents.storage_path/storage_bucket instead.
--
-- ⚠ storage.objects is owned by supabase_storage_admin. CREATE POLICY here
-- works when this migration is run as the `postgres` role (Supabase grants it
-- storage-policy management). If it errors on privilege, create the two
-- policies via Dashboard → Storage → Policies instead (same predicates).
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. documents storage columns
-- ----------------------------------------------------------------------------
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS storage_bucket TEXT,
  ADD COLUMN IF NOT EXISTS storage_path   TEXT;
CREATE INDEX IF NOT EXISTS idx_documents_storage_path
  ON public.documents(storage_path) WHERE storage_path IS NOT NULL;
COMMENT ON COLUMN public.documents.storage_path IS
  'Object path in Supabase Storage, "<matter_id>/<filename>". Supersedes drive_file_id for new uploads.';

-- ----------------------------------------------------------------------------
-- 2. Private bucket
-- ----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'matter-documents', 'matter-documents', false,
  52428800,  -- 50 MB ceiling (form caps at 10 MB client-side)
  ARRAY['application/pdf','image/jpeg','image/png','image/webp']
)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ----------------------------------------------------------------------------
-- 3. Storage RLS (scoped to the matter-documents bucket)
--    Path '<matter_id>/...': first folder is the matter UUID. The name ~ regex
--    guard short-circuits before the ::uuid cast so malformed names just deny.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS matterdocs_staff_all ON storage.objects;
CREATE POLICY matterdocs_staff_all ON storage.objects FOR ALL TO authenticated
  USING      (bucket_id = 'matter-documents' AND public.app_is_staff())
  WITH CHECK (bucket_id = 'matter-documents' AND public.app_is_staff());

DROP POLICY IF EXISTS matterdocs_read_scoped ON storage.objects;
CREATE POLICY matterdocs_read_scoped ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'matter-documents'
    AND name ~ '^[0-9a-fA-F-]{36}/'
    AND public.can_access_matter( split_part(name, '/', 1)::uuid )
  );

COMMIT;

-- ============================================================================
-- Verification
-- ============================================================================
SELECT id, public, file_size_limit FROM storage.buckets WHERE id = 'matter-documents';
SELECT policyname FROM pg_policies WHERE schemaname='storage' AND tablename='objects'
  AND policyname LIKE 'matterdocs_%';
SELECT column_name FROM information_schema.columns
  WHERE table_name='documents' AND column_name IN ('storage_bucket','storage_path');
