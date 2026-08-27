-- ============================================================================
-- 069 — a service can say WE finished it
--
-- THE POINT
--   Zewn, 2026-08-28, with the marker dropdown open: *"add a completed option"*.
--
--   064's vocabulary cannot express the most ordinary outcome there is:
--
--     not_specified   nobody has decided whether this is needed
--     needed          it must be done
--     already_done    SOMEBODY ELSE did it, before us or outside us
--     not_applicable  ruled out of this transaction
--
--   A service ConveyClear has finished has nowhere to land. Staff either leave
--   it on `needed` — which reads as outstanding and keeps the transfer looking
--   unfinished — or mark it `already_done`, which claims we were not involved.
--   That second one is actively harmful: `already_done` is the field anyone
--   would read to work out what the firm actually delivered, and overloading it
--   destroys that answer.
--
--   Seen on production 2026-08-28: a Refund line marked `already_done` whose
--   own progress row read "Complete" — the derived state already knew the work
--   was finished and the marker had no way to agree with it.
--
-- WHY A NEW VALUE AND NOT A DERIVED FLAG
--   §122 has these markers set by ConveyClear, deliberately. A marker that
--   sometimes moves on its own and sometimes waits for a person is harder to
--   trust than one that never moves by itself — you can no longer tell whether
--   a value means "someone decided this" or "nothing has happened yet". So
--   `completed` is set by hand like every other status, and the linked matter's
--   own state stays visible beside it, where a disagreement can be SEEN rather
--   than silently resolved in one direction.
--
-- ⚠️ THREE THINGS MOVE TOGETHER OR THE ROLL-UP GOES WRONG. This migration is
-- one of them:
--   1. this CHECK
--   2. STATUS_LABEL / STATUS_TONE / SELECT_TONE in TransferServices.tsx
--   3. transferProgress() in lib/transfer-service-progress.ts — `completed`
--      MUST count as resolved, or a finished service would still read as
--      outstanding on the transfer's own bar
--
-- Additive: no existing row changes, and every existing value stays legal.
-- ============================================================================

BEGIN;

ALTER TABLE public.transfer_services
  DROP CONSTRAINT IF EXISTS transfer_services_status_check;

ALTER TABLE public.transfer_services
  ADD CONSTRAINT transfer_services_status_check
  CHECK (status IN ('not_specified', 'needed', 'completed', 'already_done', 'not_applicable'));

COMMENT ON COLUMN public.transfer_services.status IS
  'not_specified = undecided (064''s default) · needed = outstanding · '
  'completed = WE finished it (069) · already_done = someone else had already '
  'done it, outside us · not_applicable = ruled out of this transaction. '
  'Set by ConveyClear (§122), never derived — see 069 for why.';

COMMIT;

-- ============================================================================
-- VERIFY
--   SELECT pg_get_constraintdef(oid)
--     FROM pg_constraint
--    WHERE conname = 'transfer_services_status_check';
--   -- must list all FIVE values, 'completed' among them
--
--   -- and that the new value is actually accepted:
--   UPDATE public.transfer_services SET status = 'completed'
--    WHERE id = '<some id>';          -- succeeds
--   UPDATE public.transfer_services SET status = 'nonsense'
--    WHERE id = '<some id>';          -- must be REJECTED by the CHECK
--
--   SELECT status, count(*) FROM public.transfer_services GROUP BY 1 ORDER BY 1;
--
-- ROLLBACK
--   -- Only safe while no row uses the new value; move them back first:
--   UPDATE public.transfer_services SET status = 'already_done'
--    WHERE status = 'completed';
--   ALTER TABLE public.transfer_services
--     DROP CONSTRAINT IF EXISTS transfer_services_status_check;
--   ALTER TABLE public.transfer_services
--     ADD CONSTRAINT transfer_services_status_check
--     CHECK (status IN ('not_specified', 'needed', 'already_done', 'not_applicable'));
--   -- ⚠️ That UPDATE is lossy: it re-merges "we did it" back into "someone else
--   -- did it", which is the distinction this migration exists to create.
-- ============================================================================
