-- ============================================================================
-- 096 — when did this matter last move?
-- ============================================================================
-- WHY
--   Francois and Marlene both asked for two day counters on a matter: how long
--   since it was created, and how long it has sat in its current stage. The
--   first already works — matters.created_at, rendered as "Open 14 workdays".
--   The second had nothing behind it.
--
--   matter_stages EXISTS for exactly this. 001 describes it as "the audit log
--   of every stage transition … exited_at IS NULL = current stage", with four
--   indexes. It has never been written to: no code references the table, and on
--   production 2026-09-15 it holds ZERO rows against 32 matters. It is a table
--   that was designed and then never wired in, which is why nobody noticed —
--   nothing errored, the same way nothing errored when middleware.ts sat at the
--   repo root for five weeks.
--
--   A column on matters is the smaller answer and the honest one for what was
--   actually asked. "How long in this stage" needs one timestamp, not a history,
--   and a history nobody writes is worse than no history at all. matter_stages
--   stays empty and unused; if a real timeline is ever wanted, it should be
--   filled deliberately rather than as a side effect of a counter.
--
-- WHAT IT DOES
--   Adds matters.stage_changed_at and backfills it. The write path lands in the
--   same branch: the admin stage action sets it in the same UPDATE that sets
--   current_stage, so the two can never disagree.
--
-- THE BACKFILL, AND WHY NOT updated_at
--   updated_at looks like the obvious source and is wrong. Migration 092 set
--   business_partner_id on 16 matters this morning, and trg_matters_updated_at
--   bumped every one of them — so updated_at now says "today" for half the
--   table and means nothing about stage movement.
--
--   matter_activities carries the real transitions: the admin action writes a
--   'status_change' row reading "Stage: <label>" on every advance. 21 such rows
--   exist. So: the newest stage activity where there is one, else created_at,
--   which for a matter that has never moved is the truthful answer.
-- ============================================================================

BEGIN;

ALTER TABLE public.matters
  ADD COLUMN IF NOT EXISTS stage_changed_at TIMESTAMPTZ;

UPDATE public.matters m
   SET stage_changed_at = COALESCE(
         (SELECT max(a.created_at)
            FROM public.matter_activities a
           WHERE a.matter_id = m.id
             AND a.activity_type = 'status_change'
             AND a.body LIKE 'Stage:%'),
         m.created_at
       )
 WHERE m.stage_changed_at IS NULL;

-- New rows get a clock from the moment they exist, so a matter created after
-- this migration never reads as having sat still since the epoch.
ALTER TABLE public.matters
  ALTER COLUMN stage_changed_at SET DEFAULT now();

COMMENT ON COLUMN public.matters.stage_changed_at IS
  'When current_stage last changed. Set by the admin stage action in the same UPDATE as current_stage. Backfilled by 096 from the newest "Stage:" activity, else created_at.';

COMMIT;

-- ============================================================================
-- VERIFY (run after COMMIT)
--
--   -- 1. Every matter has a clock. Expect 0.
--   SELECT count(*) FROM public.matters WHERE stage_changed_at IS NULL;
--
--   -- 2. No clock predates its own matter. Expect 0 rows.
--   SELECT id, title, created_at, stage_changed_at
--     FROM public.matters WHERE stage_changed_at < created_at;
--
--   -- 3. How the backfill resolved — the 21 matters that have moved should
--   --    differ from created_at; the rest should match it exactly.
--   SELECT count(*) FILTER (WHERE stage_changed_at = created_at) AS never_moved,
--          count(*) FILTER (WHERE stage_changed_at > created_at) AS has_moved
--     FROM public.matters;
--
-- THEN, IN THE APP: a matter card shows "In stage N workdays", and the
-- connector arriving at the current phase circle is green under 5 workdays,
-- yellow past 5, orange past 10, red past 15.
--
-- ROLLBACK
--   ALTER TABLE public.matters DROP COLUMN IF EXISTS stage_changed_at;
--   (Safe: nothing reads it but the counter and the connector colour, both of
--    which fall back to green / no chip when the column is absent.)
-- ============================================================================
