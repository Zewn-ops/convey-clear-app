-- ============================================================================
-- 045 — Council POC extra fields (Jukka via Zewn, 2026-07-24)
-- ----------------------------------------------------------------------------
-- The council_pocs directory (022) captured name, council, department, email,
-- cell, notes. Jukka asked for a fuller contact card. Adds:
--   tel               — office / landline number (distinct from the cell)
--   office_description — free text, e.g. "Rates hall, 2nd floor, Room 214"
--   birthday          — DATE (relationship nicety; nullable)
--   region            — e.g. "Tshwane North", "East Rand"
--   job_title         — the POC's role at the council
-- "Comments" reuses the existing notes column (relabelled in the UI), so no new
-- column for it.
--
-- Additive + idempotent, no visibility change (council_pocs stays staff-only via
-- the 022 RLS). Safe in any deploy order; apply before the app that reads them.
-- ============================================================================

ALTER TABLE public.council_pocs
  ADD COLUMN IF NOT EXISTS tel               TEXT,
  ADD COLUMN IF NOT EXISTS office_description TEXT,
  ADD COLUMN IF NOT EXISTS birthday          DATE,
  ADD COLUMN IF NOT EXISTS region            TEXT,
  ADD COLUMN IF NOT EXISTS job_title         TEXT;

-- ============================================================================
-- VERIFY
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'council_pocs'
--      AND column_name IN ('tel','office_description','birthday','region','job_title'); -- 5 rows
-- ROLLBACK (columns are inert without the app):
--   ALTER TABLE public.council_pocs
--     DROP COLUMN IF EXISTS tel, DROP COLUMN IF EXISTS office_description,
--     DROP COLUMN IF EXISTS birthday, DROP COLUMN IF EXISTS region,
--     DROP COLUMN IF EXISTS job_title;
-- ============================================================================
