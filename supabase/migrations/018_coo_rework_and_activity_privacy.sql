-- ============================================================================
-- 018 — COO rework (Jukka demo notes 2026-06-16) + activity-feed privacy
-- ----------------------------------------------------------------------------
-- Additive + idempotent EXCEPT the seller-banking DROP (intentional, see §2).
-- Apply via Supabase SQL Editor (no DB password needed).
--
--   1. matter_parties: contact-person fields for business/trust parties (A1).
--   2. matter_parties: DROP seller refund banking columns (A2 — refunds now go
--      through the partner, never directly; sensitive PII removed for POPIA).
--   3. document_types: COR 14.3 + Letter of Authority for COO per-party docs (A4).
--   4. matter_activities RLS: comment-type ('post') activities are INTERNAL ONLY
--      — partners + clients may read only lifecycle events, never staff notes (D1).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Contact person for business / trust parties (A1)
-- ----------------------------------------------------------------------------
ALTER TABLE public.matter_parties
  ADD COLUMN IF NOT EXISTS contact_name  TEXT,
  ADD COLUMN IF NOT EXISTS contact_email TEXT,
  ADD COLUMN IF NOT EXISTS contact_cell  TEXT;
COMMENT ON COLUMN public.matter_parties.contact_name IS
  'Contact person for a business/trust party (the human ConveyClear deals with).';

-- ----------------------------------------------------------------------------
-- 2. Remove seller refund banking (A2) — refunds handled via the partner only.
--    DROP (not deprecate): this is sensitive banking PII and must not linger.
-- ----------------------------------------------------------------------------
ALTER TABLE public.matter_parties
  DROP COLUMN IF EXISTS bank_name,
  DROP COLUMN IF EXISTS bank_account_no,
  DROP COLUMN IF EXISTS bank_branch_code,
  DROP COLUMN IF EXISTS account_holder;

-- The matching document type is no longer collected.
DELETE FROM public.document_types WHERE code = 'seller_banking_details';

-- ----------------------------------------------------------------------------
-- 3. COO per-party document types (A4)
-- ----------------------------------------------------------------------------
INSERT INTO public.document_types (code, name, description) VALUES
  ('cor_14_3',           'COR 14.3 Certificate',     'Company registration certificate (business entities)'),
  ('letter_of_authority','Letter of Authority (LOA)','Master''s letter of authority (trusts)')
ON CONFLICT (code) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 4. Activity-feed privacy (D1) — hide comment ('post') activities from
--    partners + clients at the DB layer (not just the UI). Staff keep full read
--    via activities_staff_all (FOR ALL). External roles see lifecycle only.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS activities_read_scoped ON public.matter_activities;
CREATE POLICY activities_read_scoped ON public.matter_activities FOR SELECT TO authenticated
  USING (
    can_access_matter(matter_id)
    AND (
      app_is_staff()
      OR activity_type IN ('status_change', 'document_upload', 'phase_transition', 'poa_signed')
    )
  );

-- ----------------------------------------------------------------------------
-- Verification
-- ----------------------------------------------------------------------------
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name='matter_parties' AND column_name LIKE 'contact%';   -- 3 rows
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name='matter_parties' AND column_name LIKE 'bank%';      -- 0 rows
-- SELECT code FROM document_types WHERE code IN ('cor_14_3','letter_of_authority'); -- 2 rows
-- SELECT policyname FROM pg_policies WHERE tablename='matter_activities';
