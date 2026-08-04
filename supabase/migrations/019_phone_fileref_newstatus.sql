-- ============================================================================
-- 019 — Batch 2 small-wins (Jukka 2026-06-16)
--   1. users.phone — staff contact number, dialled by the enquiry Call button (C3).
--   2. matters.partner_file_ref — the partner's own internal file reference,
--      searchable in the portal (F2).
--   3. matters.status — add 'new': partner/client referrals land here until a
--      ConveyClear member reviews and moves them to 'open' (H1).
-- Additive + idempotent.
-- ============================================================================

-- 1. Staff phone (C3)
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS phone TEXT;

-- 2. Partner file reference (F2)
ALTER TABLE public.matters ADD COLUMN IF NOT EXISTS partner_file_ref TEXT;
CREATE INDEX IF NOT EXISTS idx_matters_partner_file_ref ON public.matters(partner_file_ref);
COMMENT ON COLUMN public.matters.partner_file_ref IS
  'The referring partner''s own internal file/reference number. Searchable in-portal.';

-- 3. matters.status += 'new' (H1)
ALTER TABLE public.matters DROP CONSTRAINT IF EXISTS matters_status_check;
ALTER TABLE public.matters ADD CONSTRAINT matters_status_check
  CHECK (status IN ('open', 'won', 'lost', 'archived', 'on_hold', 'new'));

-- ----------------------------------------------------------------------------
-- Verification
--   SELECT column_name FROM information_schema.columns
--     WHERE table_name='users' AND column_name='phone';                 -- 1 row
--   SELECT column_name FROM information_schema.columns
--     WHERE table_name='matters' AND column_name='partner_file_ref';    -- 1 row
--   SELECT conname FROM pg_constraint WHERE conname='matters_status_check';
-- ----------------------------------------------------------------------------
