-- ============================================================================
-- 021 — Property Rates Clearance (PRC) sub-pipelines (Jukka 2026-06-16 / Batch 4)
--   The PRC service (code 'RCF', "Property Rates Clearance") has three
--   sub-divisions: RCA / RCF / RCC. Only RCF is built in-portal now (RCC stub,
--   RCA = contact ConveyClear). RCF doc requirements vary by municipality.
--
--   1. matters.service_subtype  — 'RCA' | 'RCF' | 'RCC' (null for non-PRC).
--   2. matters.service_data     — service-specific referral fields (JSONB):
--      municipal_account_no, query_reference_no (COJ), seller_name, etc.
--   3. PRC/RCF document types (per-municipality doc pipelines).
-- Additive + idempotent.
-- ============================================================================

ALTER TABLE public.matters ADD COLUMN IF NOT EXISTS service_subtype TEXT;
ALTER TABLE public.matters ADD COLUMN IF NOT EXISTS service_data    JSONB NOT NULL DEFAULT '{}'::jsonb;
COMMENT ON COLUMN public.matters.service_subtype IS
  'Sub-division within a service (PRC: RCA/RCF/RCC). NULL when the service has none.';
COMMENT ON COLUMN public.matters.service_data IS
  'Service-specific referral fields (e.g. PRC municipal_account_no, query_reference_no, seller_name).';

INSERT INTO public.document_types (code, name, description) VALUES
  ('memo_screenshot',           'Screenshot of Memo Requested',            'COT — proof the clearance memo was requested'),
  ('cqi_screenshot',            'Screenshot of Clearance Query Issue (CQI)','COJ/COE — the lodged clearance query'),
  ('water_meter_reading',       'Water Meter Reading',                     'Optional meter reading'),
  ('electricity_meter_reading', 'Electricity Meter Reading',               'Optional meter reading'),
  ('council_account_statement', 'Council Existing Account Statement',      'Current municipal account statement')
ON CONFLICT (code) DO NOTHING;

-- ----------------------------------------------------------------------------
-- Verification
--   SELECT column_name FROM information_schema.columns
--     WHERE table_name='matters' AND column_name IN ('service_subtype','service_data'); -- 2 rows
--   SELECT code FROM document_types WHERE code IN
--     ('memo_screenshot','cqi_screenshot','water_meter_reading','electricity_meter_reading','council_account_statement'); -- 5 rows
-- ----------------------------------------------------------------------------
