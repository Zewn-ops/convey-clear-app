-- 082 — Backfill matters.service_subtype from the transfer service line.
--
-- WHY
-- ---
-- `matters.service_subtype` was added by 021 and, until the code shipping with
-- this migration, was READ IN TEN PLACES AND WRITTEN IN NONE. getPipeline()
-- requires it to resolve a PRC matter (RCA / RCF / RCC each have their own
-- pipeline), and InPlaceIntake picks the document list off the same field, so
-- every PRC matter in the database has been carrying NULL and therefore showing
-- "No pipeline configured" with an empty document checklist — while the stage
-- the user actually chose sat one table away on transfer_services.prc_subtype
-- (075).
--
-- This migration is the repair for the rows already in that state. The code
-- change stops new ones being created.
--
-- ADDITIVE AND SAFE TO APPLY ANY TIME, unlike 072. It writes no schema, only
-- data, and only into rows where the column is NULL — a stage set by hand is
-- never overwritten.
--
-- APPLY: Supabase SQL editor, or the pooler. Manual, as with every migration in
-- this project.

BEGIN;

-- 1. The stage itself, from the checklist line that tracks the matter.
--
--    Joined through transfer_services.matter_id rather than through the matter's
--    transfer_id, because a transfer can carry two matters of the same service
--    (a rates clearance re-run) and only the tracked one may claim that line's
--    stage. A matter no line points at keeps NULL and gets its stage from the
--    picker on the matter page.
UPDATE public.matters m
SET service_subtype = ts.prc_subtype
FROM public.transfer_services ts
WHERE ts.matter_id = m.id
  AND ts.prc_subtype IS NOT NULL
  AND m.service_subtype IS NULL
  AND EXISTS (
    SELECT 1 FROM public.services s
    WHERE s.id = m.service_id AND upper(s.code) = 'PRC'
  );

-- 2. The pre-phase those matters never got.
--
--    A matter is created with current_phase = pipeline.prePhase.key. With no
--    stage the pipeline did not resolve, so the insert wrote NULL and the matter
--    has been sitting outside its own pipeline ever since. Every pipeline in
--    src/lib/pipelines uses the same pre-phase key, which is why this can be a
--    literal — ⚠️ if a pipeline is ever added with a different prePhase, this
--    line stops being right for it (it is a one-off repair, not a trigger, so
--    that only matters if this file is re-run).
--
--    Only fills NULLs: a matter already moving through its phases is untouched.
UPDATE public.matters m
SET current_phase = 'new_instruction'
WHERE m.current_phase IS NULL
  AND m.service_subtype IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.services s
    WHERE s.id = m.service_id AND upper(s.code) = 'PRC'
  );

COMMIT;

-- VERIFY (expect: every PRC matter whose line carries a stage now has one)
--
--   SELECT m.title, m.service_subtype, m.current_phase, ts.prc_subtype
--   FROM public.matters m
--   JOIN public.services s ON s.id = m.service_id AND upper(s.code) = 'PRC'
--   LEFT JOIN public.transfer_services ts ON ts.matter_id = m.id
--   ORDER BY m.created_at DESC;
--
-- Rows with prc_subtype set and service_subtype NULL = a failure of this
-- migration. Rows with both NULL = a matter whose stage nobody has chosen yet;
-- that is the picker's job, not this file's.
