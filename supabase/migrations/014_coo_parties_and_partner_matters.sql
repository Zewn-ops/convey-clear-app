-- ============================================================================
-- ConveyClear — Migration 014: COO buyer/seller parties + partner-managed matters
-- ============================================================================
-- Created: 2026-06-15. Target: Supabase yhgriqagrhyblhmloctc (eu-west-1).
--
-- WHY (Jukka demo debrief 2026-06-15, see COO_Research.md):
--   Change-of-Ownership (COO) matters have TWO sides — a buyer (Open Rates
--   Account / ORA) and a seller (account closure + deposit refund). Both are
--   DATA CAPTURES under ONE matter — NOT separate clients/logins. The matter is
--   managed by the referring business partner (linked directly to the matter).
--
-- This migration:
--   1. matters.business_partner_id  — first-class partner→matter link (a partner
--      manages the matter directly; no client login required).
--   2. matters.client_id → NULLABLE — a partner-managed COO matter need not have
--      a client account; buyer/seller live in matter_parties instead.
--   3. matter_parties — buyer/seller (and future roles) as data captures + the
--      seller's refund banking details. No auth link, no login.
--   4. documents.matter_party_id — scope a document to buyer vs seller.
--   5. can_access_matter() — extend so a partner sees matters they manage via
--      matters.business_partner_id (not only via clients.business_partner_id).
--   6. RLS for matter_parties (staff full; matter-viewers read).
--   7. Seed COO document_types (muni- and entity-keyed handled in the app/config).
--
-- Idempotent + additive: IF NOT EXISTS / DROP POLICY IF EXISTS / OR REPLACE.
-- service_role (Next.js server) + postgres (n8n) BYPASS RLS — backend unaffected.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Partner-managed matters
-- ----------------------------------------------------------------------------
ALTER TABLE public.matters
  ADD COLUMN IF NOT EXISTS business_partner_id UUID
  REFERENCES public.business_partners(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_matters_business_partner_id
  ON public.matters(business_partner_id);
COMMENT ON COLUMN public.matters.business_partner_id IS
  'The business partner that manages this matter (partner-originated/COO). First-class partner→matter link; independent of clients.business_partner_id.';

-- ----------------------------------------------------------------------------
-- 2. A partner-managed matter need not have a client account
-- ----------------------------------------------------------------------------
ALTER TABLE public.matters ALTER COLUMN client_id DROP NOT NULL;

-- ----------------------------------------------------------------------------
-- 3. matter_parties — buyer/seller data captures under one matter (no logins)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.matter_parties (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  matter_id        UUID NOT NULL REFERENCES public.matters(id) ON DELETE CASCADE,
  role             TEXT NOT NULL CHECK (role IN ('buyer','seller','owner','applicant','other')),
  entity_type      TEXT NOT NULL DEFAULT 'natural_person'
                     CHECK (entity_type IN ('natural_person','business','trust')),
  full_name        TEXT,
  business_name    TEXT,
  registration_no  TEXT,
  id_number        TEXT,
  email            TEXT,
  cell             TEXT,
  physical_address TEXT,
  -- Seller refund target (Open Rates Account closure → deposit/credit refund).
  -- Sensitive (POPIA): protected by matter_parties RLS below.
  bank_name        TEXT,
  bank_account_no  TEXT,
  bank_branch_code TEXT,
  account_holder   TEXT,
  notes            TEXT,
  created_at       TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at       TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT chk_party_name CHECK (
    (entity_type = 'natural_person' AND full_name IS NOT NULL) OR
    (entity_type IN ('business','trust')  AND business_name IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS idx_matter_parties_matter_id ON public.matter_parties(matter_id);
CREATE INDEX IF NOT EXISTS idx_matter_parties_role      ON public.matter_parties(role);

DROP TRIGGER IF EXISTS trg_matter_parties_updated_at ON public.matter_parties;
CREATE TRIGGER trg_matter_parties_updated_at
  BEFORE UPDATE ON public.matter_parties
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE public.matter_parties IS
  'Parties to a matter (COO buyer/seller etc.) as data captures under one matter. NOT auth accounts — no login. One matter, two sides.';
COMMENT ON COLUMN public.matter_parties.bank_account_no IS
  'Seller refund banking (Open Rates Account closure). Sensitive PII — RLS-scoped to matter viewers + staff.';

-- ----------------------------------------------------------------------------
-- 4. Scope documents to a party (buyer vs seller docs under one matter)
-- ----------------------------------------------------------------------------
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS matter_party_id UUID
  REFERENCES public.matter_parties(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_documents_matter_party_id ON public.documents(matter_party_id);
COMMENT ON COLUMN public.documents.matter_party_id IS
  'Optional: which party (buyer/seller) this document belongs to. NULL = matter-level.';

-- ----------------------------------------------------------------------------
-- 5. RLS helper: partner sees matters they manage directly
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_access_matter(m_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT app_is_staff()
      OR EXISTS (
           SELECT 1 FROM public.matters m WHERE m.id = m_id AND (
               m.client_id = app_user_client_id()
            OR (app_user_partner_id() IS NOT NULL
                AND m.business_partner_id = app_user_partner_id())
            OR (app_user_partner_id() IS NOT NULL
                AND m.client_id IN (SELECT id FROM public.clients
                                    WHERE business_partner_id = app_user_partner_id()))
           ))
      OR EXISTS (SELECT 1 FROM public.matter_subscribers s
                 WHERE s.matter_id = m_id AND s.user_id = app_current_user_id());
$$;

-- ----------------------------------------------------------------------------
-- 6. matter_parties RLS (staff full; matter viewers read)
-- ----------------------------------------------------------------------------
ALTER TABLE public.matter_parties ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS parties_staff_all ON public.matter_parties;
CREATE POLICY parties_staff_all ON public.matter_parties FOR ALL TO authenticated
  USING (app_is_staff()) WITH CHECK (app_is_staff());

DROP POLICY IF EXISTS parties_read_scoped ON public.matter_parties;
CREATE POLICY parties_read_scoped ON public.matter_parties FOR SELECT TO authenticated
  USING (can_access_matter(matter_id));

-- ----------------------------------------------------------------------------
-- 7. Seed COO document types (additive; muni/entity keying lives in app config)
-- ----------------------------------------------------------------------------
INSERT INTO public.document_types (code, name, description) VALUES
  ('deed_of_sale',             'Deed of Sale / Offer to Purchase', 'Proof of ownership transfer'),
  ('coc_electrical',           'Electrical Certificate of Compliance', 'COC per connection/unit'),
  ('certificate_of_occupation','Certificate of Occupation', 'New connections only'),
  ('consumer_agreement',       'Consumer Agreement (account application)', 'COE buyer new-account form'),
  ('service_application',      'Municipal Service Application', 'COT buyer new-account form'),
  ('registration_letter',      'Registration Letter to Municipality', 'Attorney letter confirming transfer + new owner'),
  ('rates_clearance_figures',  'Rates Clearance Figures', 's118 figures statement'),
  ('rates_clearance_certificate','Rates Clearance Certificate', 's118 clearance certificate'),
  ('deed_search',              'Deeds Search', 'WinDeed / deeds office search'),
  ('seller_banking_details',   'Seller Banking Details (refund)', 'For Open Rates Account closure refund')
ON CONFLICT (code) DO NOTHING;

COMMIT;

-- ============================================================================
-- Verification
-- ============================================================================
-- matters.client_id now nullable; business_partner_id present
SELECT column_name, is_nullable FROM information_schema.columns
WHERE table_name='matters' AND column_name IN ('client_id','business_partner_id');
-- matter_parties exists + RLS on
SELECT relrowsecurity FROM pg_class WHERE relname='matter_parties';
-- policies
SELECT policyname FROM pg_policies WHERE tablename='matter_parties';
