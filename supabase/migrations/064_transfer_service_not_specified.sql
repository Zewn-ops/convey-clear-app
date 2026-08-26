-- ============================================================================
-- 064 — "not specified" becomes the starting state of a service line item
-- ============================================================================
-- Zewn, 2026-08-26, walking the dry run:
--
--   "add a 'not specified' for the options since it shouldnt automatically be
--    marked as 'needs to bedone' or 'already done' before we have that
--    information from the partner/client"
--
-- He is right, and 063 got this wrong. `needed` was the DEFAULT, so the moment
-- staff created a checklist the portal asserted that all seven services were
-- required — including, on most transactions, several that are not. A marker
-- that drives what ConveyClear actually does must not start out claiming
-- something nobody has said yet.
--
-- So the vocabulary gains a fourth value and the default moves to it:
--
--   not_specified   nobody has told us yet          ← new default
--   needed          confirmed: has to be done
--   already_done    confirmed: someone has done it
--   not_applicable  confirmed: does not apply here
--
-- The three confirmed values keep their meaning exactly. This only stops the
-- system putting words in the client's mouth before they have spoken.
--
-- BACKFILL: existing `needed` rows are reset to `not_specified` ONLY where the
-- whole checklist is still untouched — every row `needed`, which is the
-- signature of "created and never edited". A checklist someone has actually
-- worked is left completely alone; a real `needed` set by a human is a fact,
-- and this migration has no business overwriting it.
-- ============================================================================

BEGIN;

ALTER TABLE public.transfer_services
  DROP CONSTRAINT IF EXISTS transfer_services_status_check;

ALTER TABLE public.transfer_services
  ADD CONSTRAINT transfer_services_status_check
  CHECK (status IN ('not_specified', 'needed', 'already_done', 'not_applicable'));

ALTER TABLE public.transfer_services
  ALTER COLUMN status SET DEFAULT 'not_specified';

-- Untouched checklists only: every row on that transfer still reads 'needed'.
UPDATE public.transfer_services ts
   SET status = 'not_specified'
 WHERE ts.status = 'needed'
   AND NOT EXISTS (
     SELECT 1 FROM public.transfer_services other
      WHERE other.transfer_id = ts.transfer_id
        AND other.status <> 'needed'
   );

COMMENT ON COLUMN public.transfer_services.status IS
  'not_specified (nobody has told us yet — the starting state) | needed | '
  'already_done | not_applicable. Set by ConveyClear staff; drives what we do.';

COMMIT;

-- ============================================================================
-- VERIFY
-- ============================================================================
-- SELECT status, count(*) FROM public.transfer_services GROUP BY status;
-- SELECT column_default FROM information_schema.columns
--  WHERE table_name='transfer_services' AND column_name='status';  -- 'not_specified'
