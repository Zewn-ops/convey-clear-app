-- ============================================================================
-- 075 — rates, utilities, or both
-- ============================================================================
-- From the handwritten notes transcribed 2026-08-31 (§11.17).
--
-- The City of Tshwane sheet, against the RCA owner's-details block:
--
--     ① R + U      ② U only      ③ R only
--
-- Zewn, 2026-08-31: "also make sure you made a note of the rates vs utilities
-- difference. most times you just need rates, sometimes you will need
-- utilities aswell but not always."
--
-- WHY THIS IS A COLUMN AND NOT A NOTE
--   It decides WHICH DOCUMENTS ARE REQUIRED. The COT sheet asks for a rates
--   account number and statement on one line and a utilities account number
--   and statement on the next, and the three-way choice above says which of
--   those two lines apply. So it is an input that changes the required set,
--   not a preference — which is exactly the kind of thing lib/councils reads.
--
-- WHY IT LIVES ON THE CHECKLIST LINE
--   The scope belongs to one rates-clearance job, not to the whole transfer: a
--   transfer can carry a rates-only RCF and, later, a rates-and-utilities RCA.
--   transfer_services is the row that already represents one such job.
--
-- ⚠️ NOT EVERY COUNCIL ASKS. COT does; the CoE sheet does not. That is exactly
--   the sort of difference §5.15 decided should live in config rather than in
--   page conditionals, so `Council.ratesScope` in lib/councils/ says which
--   councils show the choice. The column exists for every council either way —
--   a nullable column is cheaper than a migration when the fourth council
--   turns out to ask.
-- ============================================================================

BEGIN;

ALTER TABLE public.transfer_services
  ADD COLUMN IF NOT EXISTS rates_scope text;

ALTER TABLE public.transfer_services
  DROP CONSTRAINT IF EXISTS transfer_services_rates_scope_check;

ALTER TABLE public.transfer_services
  ADD CONSTRAINT transfer_services_rates_scope_check
  CHECK (
    rates_scope IS NULL
    OR (
      service_code = 'PRC'
      AND rates_scope IN ('rates', 'rates_and_utilities', 'utilities')
    )
  );

COMMENT ON COLUMN public.transfer_services.rates_scope IS
  'Whether this rates-clearance job covers rates only, utilities only, '
  'or both -- the City of Tshwane sheet''s "R+U / U only / R only" '
  '(Zewn, 2026-08-31). Decides which account number and statement are '
  'required, so it is read by lib/councils rather than merely '
  'displayed. NULL where the council does not ask; Council.ratesScope '
  'says which councils do.';

-- ---------------------------------------------------------------------------
-- 071's partner guard learns about this column too
-- ---------------------------------------------------------------------------
-- Same reasoning as 072's section 4b: the guard enumerates every column a
-- non-staff caller may not touch, and a column added without being listed here
-- becomes writable by a partner in the same UPDATE that moves the marker.
--
-- Whether the ATTORNEY should choose the rates scope is the same open question
-- as the PRC stage (072, section 4b), and is answered the same conservative
-- way: staff set it, nothing is blocked, and widening it later is a one-line
-- change. ▶ Ask Zewn; do not infer.

CREATE OR REPLACE FUNCTION public.transfer_services_partner_marking_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.status_set_by := public.app_current_user_id();
    NEW.status_set_at := now();
  ELSE
    NEW.status_set_by := OLD.status_set_by;
    NEW.status_set_at := OLD.status_set_at;
  END IF;

  IF public.app_is_staff() THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Only the service marker can be changed here.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NEW.status NOT IN ('needed', 'already_done', 'not_applicable') THEN
    RAISE EXCEPTION
      'A firm may mark a service needed, already done, or not applicable.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Every other column must be untouched. ADD NEW COLUMNS HERE.
  IF NEW.id           IS DISTINCT FROM OLD.id
  OR NEW.transfer_id  IS DISTINCT FROM OLD.transfer_id
  OR NEW.parent_id    IS DISTINCT FROM OLD.parent_id
  OR NEW.service_code IS DISTINCT FROM OLD.service_code
  OR NEW.label        IS DISTINCT FROM OLD.label
  OR NEW.matter_id    IS DISTINCT FROM OLD.matter_id
  OR NEW.third_party  IS DISTINCT FROM OLD.third_party
  OR NEW.position     IS DISTINCT FROM OLD.position
  OR NEW.notes        IS DISTINCT FROM OLD.notes
  OR NEW.prc_subtype  IS DISTINCT FROM OLD.prc_subtype   -- 072
  OR NEW.rates_scope  IS DISTINCT FROM OLD.rates_scope   -- 075
  OR NEW.created_by   IS DISTINCT FROM OLD.created_by
  OR NEW.created_at   IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'A firm may only change the service marker.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END $$;

COMMIT;

-- ============================================================================
-- VERIFY
-- ============================================================================
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'transfer_services' AND column_name = 'rates_scope';
--   -- expect: 1 row
--
--   The CHECK refuses a scope on a non-PRC line. Postgres has no LIMIT on
--   UPDATE, so scope it by id and roll it back:
--   BEGIN;
--     UPDATE transfer_services SET rates_scope = 'rates'
--      WHERE id = (SELECT id FROM transfer_services
--                   WHERE service_code = 'COO' LIMIT 1);
--   ROLLBACK;
--   -- expect: ERROR, transfer_services_rates_scope_check
--
--   The guard covers both new columns:
--   SELECT prosrc LIKE '%prc_subtype%' AS covers_subtype,
--          prosrc LIKE '%rates_scope%' AS covers_scope
--     FROM pg_proc
--    WHERE proname = 'transfer_services_partner_marking_guard';
--   -- expect: true, true
--
-- ============================================================================
-- DOWN
-- ============================================================================
--   ALTER TABLE transfer_services
--     DROP CONSTRAINT IF EXISTS transfer_services_rates_scope_check,
--     DROP COLUMN IF EXISTS rates_scope;
--   -- then restore 072's guard body (identical minus the rates_scope line).
-- ============================================================================
