-- ============================================================================
-- 022 — Council Point-of-Contact directory (Jukka 2026-06-16 / Batch 5, Theme G)
-- ----------------------------------------------------------------------------
-- Internal-only contact book of the people ConveyClear deals with at each
-- municipality/council. Staff capture a POC once (name, council, department,
-- email, cell) and link one or more to a matter. NOT visible to partners or
-- clients — pure /admin (employee) feature.
--
--   1. council_pocs        — the contact entity (the "contact card").
--   2. matter_council_pocs — many-to-many: multiple POCs per matter.
--   3. RLS: staff-only on both (FOR ALL via app_is_staff()).
-- Additive + idempotent. Apply via Supabase SQL Editor (no DB password needed).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. council_pocs — one row per council contact person
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.council_pocs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name  TEXT NOT NULL,
  last_name   TEXT,
  email       TEXT,
  cell        TEXT,
  council     TEXT,                 -- which council/municipality they belong to (COT/COJ/…)
  department  TEXT,
  notes       TEXT,
  created_by  UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_council_pocs_council ON public.council_pocs(council);

-- ----------------------------------------------------------------------------
-- 2. matter_council_pocs — link a POC to a matter (multiple POCs per matter)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.matter_council_pocs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  matter_id      UUID NOT NULL REFERENCES public.matters(id)      ON DELETE CASCADE,
  council_poc_id UUID NOT NULL REFERENCES public.council_pocs(id) ON DELETE CASCADE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (matter_id, council_poc_id)
);
CREATE INDEX IF NOT EXISTS idx_matter_council_pocs_matter ON public.matter_council_pocs(matter_id);
CREATE INDEX IF NOT EXISTS idx_matter_council_pocs_poc    ON public.matter_council_pocs(council_poc_id);

-- ----------------------------------------------------------------------------
-- 3. RLS — staff only (internal directory; partners/clients have NO access).
--    service_role (API routes) + postgres bypass RLS as usual.
-- ----------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.council_pocs        TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.matter_council_pocs TO authenticated;

ALTER TABLE public.council_pocs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matter_council_pocs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS council_pocs_staff_all ON public.council_pocs;
CREATE POLICY council_pocs_staff_all ON public.council_pocs FOR ALL TO authenticated
  USING (app_is_staff()) WITH CHECK (app_is_staff());

DROP POLICY IF EXISTS matter_council_pocs_staff_all ON public.matter_council_pocs;
CREATE POLICY matter_council_pocs_staff_all ON public.matter_council_pocs FOR ALL TO authenticated
  USING (app_is_staff()) WITH CHECK (app_is_staff());

-- ----------------------------------------------------------------------------
-- Verification
--   SELECT table_name FROM information_schema.tables
--     WHERE table_name IN ('council_pocs','matter_council_pocs');           -- 2 rows
--   SELECT policyname FROM pg_policies
--     WHERE tablename IN ('council_pocs','matter_council_pocs');            -- 2 rows
-- ----------------------------------------------------------------------------
