-- ============================================================================
-- 073 — the firm record becomes what the councils actually ask for
-- ============================================================================
-- From the handwritten notes transcribed 2026-08-31
-- (NOTES-HANDWRITTEN-2026-08-31.md §11.3, §5.11 of the resume file).
--
-- Zewn: "we need to upgrade the law firm details container to have all of
-- these details in and if rca is connected that data automatically populates."
--
-- TWO COUNCILS ASK THE SAME THING, WHICH IS THE EVIDENCE THIS IS REAL
--   City of Tshwane sheet, "ATTORNEYS DOCS":
--     bank confirmation letter · fidelity fund cert · SAP business partner
--     number · PoA · file owner's/user's contact details · user's login
--     details (eTshwane) · MORE!! - SLA - POPIA
--   City of Ekurhuleni sheet, "Attorney":
--     bank letter · FFC · PoA (attorneys) · PoA (address) · user's login
--     details (list of all staff) · SAP BP number
--   City of Johannesburg adds, for RCA: attorney code · practice no.
--
-- 🔴 WHAT THIS MIGRATION DELIBERATELY DOES **NOT** ADD
--   The obvious reading of that list is "put bank details and a SAP BP number
--   on `firms`". Both already exist and adding them again would be the 066
--   mistake -- a second vocabulary for one concept:
--
--     * BANK DETAILS -> `firm_banking` (037) already holds bank_name,
--       account_name, account_number, branch_code, account_type AND a separate
--       trust account, which conveyancers must have. Richer than the councils
--       ask for. Use it.
--
--     * SAP BP NUMBER -> `firm_bp_numbers` (037) already holds one per
--       (firm, municipality), which is CORRECT and better than a single column
--       would be: each council issues its own BP number to the same firm. The
--       sheets show one number because they are one council each.
--
--   So this migration adds only what genuinely has no home yet.
--
-- WHY PoA IS NOT A COLUMN
--   PoA (attorneys) and PoA (address) are DOCUMENTS, and the councils want two
--   distinct ones. They live in firm_documents below, not in a text field.
--
-- SLA / POPIA ARE RECORDED AS ACCEPTANCES, NOT FLAGS
--   A boolean cannot answer "who accepted, and when", which is the only
--   question anyone asks of a POPIA record. Timestamp + actor, the shape the
--   rest of the schema already uses for approvals.
--
-- ⚠️ §6.1 IS STILL OPEN — what an ordinary attorney may do versus a firm
--   admin. These fields are written through /api/partner/firm, which 037
--   already gates on is_firm_admin. That is the answer for now; if §6.1 is
--   settled differently, the route is the single place to change.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Firm identity that has no home yet
-- ---------------------------------------------------------------------------

ALTER TABLE public.firms
  -- Legal Practice Council practice number. National, so one per firm --
  -- unlike the attorney code below, which a council issues.
  ADD COLUMN IF NOT EXISTS practice_number  text,

  -- Fidelity Fund Certificate. The expiry is the half that matters
  -- operationally: an expired FFC stops the firm lodging anything.
  ADD COLUMN IF NOT EXISTS ffc_number       text,
  ADD COLUMN IF NOT EXISTS ffc_expires_on   date,

  -- "FILE OWNER'S / USER'S CONTACT DETAILS" (COT sheet). The person the
  -- council calls about this firm's files, which need not be the firm's
  -- primary_email/primary_cell.
  ADD COLUMN IF NOT EXISTS file_owner_name  text,
  ADD COLUMN IF NOT EXISTS file_owner_email text,
  ADD COLUMN IF NOT EXISTS file_owner_cell  text,

  -- "MORE!! - SLA - POPIA" (COT sheet).
  ADD COLUMN IF NOT EXISTS sla_accepted_at   timestamptz,
  ADD COLUMN IF NOT EXISTS sla_accepted_by   uuid
    REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS popia_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS popia_accepted_by uuid
    REFERENCES public.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.firms.practice_number IS
  'Legal Practice Council practice number. One per firm, nationally. The '
  'per-council attorney code is firm_bp_numbers.attorney_code instead.';

COMMENT ON COLUMN public.firms.ffc_expires_on IS
  'Fidelity Fund Certificate expiry. Operationally the important half: an '
  'expired FFC stops the firm lodging with a council.';

-- ---------------------------------------------------------------------------
-- 2. The per-council attorney code sits beside the per-council BP number
-- ---------------------------------------------------------------------------
-- COJ asks for a "CoJ Attorney Code". It is issued BY a council, to a firm --
-- exactly the grain firm_bp_numbers already has, and it is already UNIQUE on
-- (business_partner_id, municipality). A column here beats a new table.

ALTER TABLE public.firm_bp_numbers
  ADD COLUMN IF NOT EXISTS attorney_code text;

COMMENT ON COLUMN public.firm_bp_numbers.attorney_code IS
  'The code this council issues to this firm (COJ calls it the CoJ '
  'Attorney Code and asks for it on an RCA). Same grain as bp_number: '
  'one per firm per council.';

-- bp_number is NOT NULL, which would block a row that has only an attorney
-- code. Both are optional identifiers for the same (firm, council) pair.
ALTER TABLE public.firm_bp_numbers
  ALTER COLUMN bp_number DROP NOT NULL;

-- ...but a row carrying neither is meaningless.
ALTER TABLE public.firm_bp_numbers
  DROP CONSTRAINT IF EXISTS firm_bp_numbers_has_an_identifier;

ALTER TABLE public.firm_bp_numbers
  ADD CONSTRAINT firm_bp_numbers_has_an_identifier
  CHECK (
    COALESCE(
      NULLIF(btrim(bp_number), ''),
      NULLIF(btrim(attorney_code), '')
    ) IS NOT NULL
  );

-- ---------------------------------------------------------------------------
-- 3. Firms get a document store -- they had none
-- ---------------------------------------------------------------------------
-- Documents have hung off matters (015), clients (025) and transfers (034).
-- A firm-level store is the fourth, and it deliberately COPIES 025's shape
-- rather than inventing a new one.

CREATE TABLE IF NOT EXISTS public.firm_documents (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id        uuid NOT NULL
                   REFERENCES public.firms(id) ON DELETE CASCADE,
  document_type  text NOT NULL,
  file_name      text,
  mime_type      text,
  size_bytes     bigint,
  storage_bucket text NOT NULL DEFAULT 'firm-documents',
  storage_path   text NOT NULL,        -- '<firm_id>/<uuid>-<filename>'
  uploaded_by    uuid REFERENCES public.users(id),
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_firm_documents_firm
  ON public.firm_documents(firm_id);

COMMENT ON TABLE public.firm_documents IS
  'Documents belonging to the FIRM rather than to a matter, client or '
  'transfer: bank confirmation letter, fidelity fund certificate, PoA '
  '(attorneys), PoA (address), SLA, POPIA. Both COT and CoE ask for these '
  'of the firm once, rather than per transaction -- which is what makes '
  'them autofill sources (notes 2026-08-31, 11.3).';

ALTER TABLE public.firm_documents ENABLE ROW LEVEL SECURITY;

-- A firm sees its own documents and no other firm's. Staff see all.
DROP POLICY IF EXISTS firm_documents_read ON public.firm_documents;
CREATE POLICY firm_documents_read ON public.firm_documents
  FOR SELECT TO authenticated
  USING (
    public.app_is_staff()
    OR firm_id = public.app_user_partner_id()
  );

DROP POLICY IF EXISTS firm_documents_staff_write ON public.firm_documents;
CREATE POLICY firm_documents_staff_write ON public.firm_documents
  FOR ALL TO authenticated
  USING (public.app_is_staff())
  WITH CHECK (public.app_is_staff());

-- The firm's own uploads: a firm admin may add a document to its OWN firm.
-- INSERT only. Editing and deleting stay staff-only, because a lodged council
-- pack must not lose the document it was built from.
DROP POLICY IF EXISTS firm_documents_firm_admin_insert
  ON public.firm_documents;
CREATE POLICY firm_documents_firm_admin_insert ON public.firm_documents
  FOR INSERT TO authenticated
  WITH CHECK (
    public.app_is_firm_admin()
    AND firm_id = public.app_user_partner_id()
  );

-- ---------------------------------------------------------------------------
-- 4. Private bucket, same shape as 025's client vault
-- ---------------------------------------------------------------------------

INSERT INTO storage.buckets
  (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('firm-documents', 'firm-documents', false, 52428800,
        ARRAY['application/pdf','image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS firmdocs_staff_all ON storage.objects;
CREATE POLICY firmdocs_staff_all ON storage.objects
  FOR ALL TO authenticated
  USING      (bucket_id = 'firm-documents' AND public.app_is_staff())
  WITH CHECK (bucket_id = 'firm-documents' AND public.app_is_staff());

-- Path is '<firm_id>/...', so the firm prefix IS the scope check.
DROP POLICY IF EXISTS firmdocs_read_scoped ON storage.objects;
CREATE POLICY firmdocs_read_scoped ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'firm-documents'
    AND name ~ '^[0-9a-fA-F-]{36}/'
    AND split_part(name, '/', 1)::uuid = public.app_user_partner_id()
  );

DROP POLICY IF EXISTS firmdocs_firm_admin_insert ON storage.objects;
CREATE POLICY firmdocs_firm_admin_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'firm-documents'
    AND public.app_is_firm_admin()
    AND name ~ '^[0-9a-fA-F-]{36}/'
    AND split_part(name, '/', 1)::uuid = public.app_user_partner_id()
  );

COMMIT;

-- ============================================================================
-- VERIFY
-- ============================================================================
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'firms'
--      AND column_name IN ('practice_number','ffc_number','ffc_expires_on',
--                          'file_owner_name','file_owner_email',
--                          'file_owner_cell','sla_accepted_at',
--                          'popia_accepted_at')
--    ORDER BY column_name;
--   -- expect: 8 rows
--
--   SELECT column_name, is_nullable FROM information_schema.columns
--    WHERE table_name = 'firm_bp_numbers'
--      AND column_name IN ('bp_number','attorney_code');
--   -- expect: both YES (nullable), guarded by the CHECK
--
--   SELECT to_regclass('public.firm_documents');
--   SELECT id, public FROM storage.buckets WHERE id = 'firm-documents';
--   -- expect: the table, and 1 bucket row with public = false
--
--   SELECT polname FROM pg_policy
--    WHERE polrelid = 'public.firm_documents'::regclass ORDER BY polname;
--   -- expect: firm_documents_firm_admin_insert, firm_documents_read,
--   --         firm_documents_staff_write
--
-- ============================================================================
-- DOWN
-- ============================================================================
--   DROP POLICY IF EXISTS firmdocs_firm_admin_insert ON storage.objects;
--   DROP POLICY IF EXISTS firmdocs_read_scoped       ON storage.objects;
--   DROP POLICY IF EXISTS firmdocs_staff_all         ON storage.objects;
--   DELETE FROM storage.buckets WHERE id = 'firm-documents';
--   DROP TABLE IF EXISTS public.firm_documents;
--   ALTER TABLE public.firm_bp_numbers
--     DROP CONSTRAINT IF EXISTS firm_bp_numbers_has_an_identifier,
--     DROP COLUMN IF EXISTS attorney_code;
--   -- ⚠️ restoring bp_number NOT NULL needs any null rows cleared first.
--   ALTER TABLE public.firms
--     DROP COLUMN IF EXISTS practice_number,
--     DROP COLUMN IF EXISTS ffc_number,
--     DROP COLUMN IF EXISTS ffc_expires_on,
--     DROP COLUMN IF EXISTS file_owner_name,
--     DROP COLUMN IF EXISTS file_owner_email,
--     DROP COLUMN IF EXISTS file_owner_cell,
--     DROP COLUMN IF EXISTS sla_accepted_at,
--     DROP COLUMN IF EXISTS sla_accepted_by,
--     DROP COLUMN IF EXISTS popia_accepted_at,
--     DROP COLUMN IF EXISTS popia_accepted_by;
-- ============================================================================
