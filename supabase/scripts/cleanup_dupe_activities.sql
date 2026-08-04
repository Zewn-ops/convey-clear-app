-- ============================================================================
-- cleanup_dupe_activities.sql — NOT a migration. Optional, destructive, run by hand.
--
-- Migration 036 stops NEW duplicate feed rows. It deliberately does not touch the
-- ones already written: the feed is append-only history, and rewriting history is
-- a separate decision from fixing the bug.
--
-- This script tidies the duplicates Jukka saw in the demo. Run it only if you want
-- the existing feed cleaned before Thursday.
--
-- ⚠️ It DELETES rows from matter_activities and transfer_activities. Run STEP 1
--    first and read the output. Only then run STEP 2.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- STEP 1 — PREVIEW. Read-only. Shows exactly which rows STEP 2 would delete.
--
-- Same matter, same activity_type, same body, written within 10 seconds of the
-- first of its group: that is a double-write, not a person saying the same thing
-- twice. The OLDEST row of each group is kept (it is the one the notifications
-- and any links already point at); the later copies are what get deleted.
-- ----------------------------------------------------------------------------
WITH grouped AS (
  SELECT id, matter_id, activity_type, body, created_at,
         first_value(created_at) OVER w AS first_at,
         row_number()            OVER w AS rn
    FROM public.matter_activities
  WINDOW w AS (
    PARTITION BY matter_id, activity_type, body
    ORDER BY created_at
  )
)
SELECT id, matter_id, activity_type, left(coalesce(body, ''), 60) AS body,
       created_at,
       round(extract(epoch FROM (created_at - first_at))::numeric, 2) AS secs_after_first
  FROM grouped
 WHERE rn > 1
   AND created_at <= first_at + interval '10 seconds'
 ORDER BY matter_id, activity_type, created_at;

-- Same preview for the transfer feed:
WITH grouped AS (
  SELECT id, transfer_id, activity_type, body, created_at,
         first_value(created_at) OVER w AS first_at,
         row_number()            OVER w AS rn
    FROM public.transfer_activities
  WINDOW w AS (
    PARTITION BY transfer_id, activity_type, body
    ORDER BY created_at
  )
)
SELECT id, transfer_id, activity_type, left(coalesce(body, ''), 60) AS body, created_at
  FROM grouped
 WHERE rn > 1
   AND created_at <= first_at + interval '10 seconds'
 ORDER BY transfer_id, activity_type, created_at;

-- ----------------------------------------------------------------------------
-- STEP 2 — DELETE. Run only after reading STEP 1's output.
--
-- Wrapped in a transaction with the count raised, so an unexpected number can be
-- rolled back before it commits. If the count does not match STEP 1, ROLLBACK.
-- ----------------------------------------------------------------------------
-- BEGIN;
--
-- WITH grouped AS (
--   SELECT id,
--          first_value(created_at) OVER w AS first_at,
--          row_number()            OVER w AS rn,
--          created_at
--     FROM public.matter_activities
--   WINDOW w AS (PARTITION BY matter_id, activity_type, body ORDER BY created_at)
-- )
-- DELETE FROM public.matter_activities a
--  USING grouped g
--  WHERE a.id = g.id
--    AND g.rn > 1
--    AND g.created_at <= g.first_at + interval '10 seconds';
--
-- WITH grouped AS (
--   SELECT id,
--          first_value(created_at) OVER w AS first_at,
--          row_number()            OVER w AS rn,
--          created_at
--     FROM public.transfer_activities
--   WINDOW w AS (PARTITION BY transfer_id, activity_type, body ORDER BY created_at)
-- )
-- DELETE FROM public.transfer_activities a
--  USING grouped g
--  WHERE a.id = g.id
--    AND g.rn > 1
--    AND g.created_at <= g.first_at + interval '10 seconds';
--
-- -- Check the feed reads correctly, THEN:
-- COMMIT;   -- or ROLLBACK; if the numbers look wrong.
