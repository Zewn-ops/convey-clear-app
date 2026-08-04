-- ============================================================================
-- 023 — Config-driven pipelines + firm abbreviation (2026-06-22)
--   Supports the Vision Board pipeline redesign:
--   1. matters.current_phase moves from the hardcoded '1'..'4' to free-text
--      PHASE KEYS (e.g. 'onboarding','operations'). Drop the old CHECK.
--   2. matters.current_stage already free text (stage keys). No change.
--   3. business_partners.abbreviation — firm short code (e.g. "BSI"), manually
--      set when a firm is created; shown in the matter's staff-only container.
--   4. service_data already JSONB — holds branch outcome/reason
--      (stage_outcome / stage_reason) + PRC referral fields.
-- Additive + idempotent.
-- ============================================================================

BEGIN;

-- 1. Relax the phase tracker (was CHECK current_phase IN ('1','2','3','4')).
ALTER TABLE public.matters DROP CONSTRAINT IF EXISTS matters_current_phase_check;
COMMENT ON COLUMN public.matters.current_phase IS
  'Pipeline phase KEY (src/lib/pipelines), e.g. onboarding/operations/client_delivery. Free text.';
COMMENT ON COLUMN public.matters.current_stage IS
  'Pipeline stage KEY within the current phase, e.g. documents_verified.';

-- 3. Firm abbreviation.
ALTER TABLE public.business_partners ADD COLUMN IF NOT EXISTS abbreviation TEXT;
COMMENT ON COLUMN public.business_partners.abbreviation IS
  'Short firm code (e.g. BSI for Bert Smith Inc), manually set at firm creation.';

-- 4. First name + surname stored SEPARATELY across the portal (note 22/59).
--    full_name is kept (backward-compat + business/trust display) and is set to
--    "first last" on write. Backfill existing rows by splitting on first space.
ALTER TABLE public.clients        ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE public.clients        ADD COLUMN IF NOT EXISTS last_name  TEXT;
ALTER TABLE public.matter_parties ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE public.matter_parties ADD COLUMN IF NOT EXISTS last_name  TEXT;
ALTER TABLE public.users          ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE public.users          ADD COLUMN IF NOT EXISTS last_name  TEXT;

-- Backfill from full_name (first token = first name, remainder = surname).
UPDATE public.clients SET
  first_name = COALESCE(first_name, NULLIF(split_part(full_name, ' ', 1), '')),
  last_name  = COALESCE(last_name,  NULLIF(btrim(substr(full_name, length(split_part(full_name, ' ', 1)) + 1)), ''))
WHERE full_name IS NOT NULL AND first_name IS NULL;

UPDATE public.matter_parties SET
  first_name = COALESCE(first_name, NULLIF(split_part(full_name, ' ', 1), '')),
  last_name  = COALESCE(last_name,  NULLIF(btrim(substr(full_name, length(split_part(full_name, ' ', 1)) + 1)), ''))
WHERE full_name IS NOT NULL AND first_name IS NULL;

UPDATE public.users SET
  first_name = COALESCE(first_name, NULLIF(split_part(full_name, ' ', 1), '')),
  last_name  = COALESCE(last_name,  NULLIF(btrim(substr(full_name, length(split_part(full_name, ' ', 1)) + 1)), ''))
WHERE full_name IS NOT NULL AND first_name IS NULL;

COMMIT;

-- Verification
--   SELECT conname FROM pg_constraint WHERE conname='matters_current_phase_check'; -- 0 rows
--   SELECT column_name FROM information_schema.columns
--     WHERE table_name='business_partners' AND column_name='abbreviation';         -- 1 row
