-- ============================================================================
-- 068 — notifications get a triage: important, and archived
--
-- THE POINT
--   Zewn, 2026-08-27: "we also need to build out the notifications thing a lot
--   more, i think we should have a full slide out menu with better
--   functionality and features, read and unread as well as mark as important or
--   archive."
--
--   020 gave every notification exactly one piece of state: `read_at`. That is
--   enough for a bell with a count and nothing else. A centre someone actually
--   works from needs to know three different things:
--
--     · have I SEEN this          → read_at    (020, unchanged)
--     · does this MATTER to me    → important_at
--     · am I DONE with this       → archived_at
--
-- WHY TIMESTAMPS AND NOT BOOLEANS
--   The codebase already answers "is it flagged" with "when was it flagged" —
--   read_at, details_dismissed_at (065), revoked_at (051), used_at, deleted_at.
--   A timestamp answers the boolean question and one more besides, for free, and
--   "when did they archive this" is exactly the sort of thing that gets asked
--   later. Following the existing idiom also means every consumer already knows
--   how to read it.
--
-- WHY IMPORTANT AND ARCHIVED ARE SEPARATE COLUMNS, NOT ONE `state`
--   They are orthogonal. A notification can be important AND archived — dealt
--   with, but worth remembering. Collapsing them into a single status would make
--   that unsayable, and the first person to want it would need another migration.
--
-- WHY NO NEW POLICY
--   020's `notifications_own_update` already grants UPDATE on a user's own rows
--   (USING and WITH CHECK both `user_id = app_current_user_id()`), so these
--   columns are writable by their owner the moment they exist. Nothing here
--   widens access. Rows are still INSERTed by the service role only — there is
--   deliberately no INSERT policy, so a user cannot fabricate a notification.
--
-- ARCHIVING IS PER-USER AND NEVER DELETES. Rows are already per-user
-- (`user_id` FK), so archiving is a flag on one person's copy. Same reasoning as
-- 065's handover card: dismissing HIDES, it never destroys.
--
-- Additive, idempotent, single transaction.
-- ============================================================================

BEGIN;

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS important_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_at  timestamptz;

COMMENT ON COLUMN public.notifications.important_at IS
  'When the recipient flagged this as important. NULL = not flagged. '
  'Orthogonal to archived_at: a notification can be both.';
COMMENT ON COLUMN public.notifications.archived_at IS
  'When the recipient archived this. NULL = still in the main list. Archiving '
  'is a per-user flag and never deletes the row.';

-- ----------------------------------------------------------------------------
-- Indexes follow the views the panel actually offers.
--
-- 020's idx_notifications_user_unread covered (user_id, read_at, created_at) —
-- still correct for the unread count, which is the one query that runs on every
-- page load, so it stays. What it cannot serve is the DEFAULT list, which now
-- excludes archived rows.
-- ----------------------------------------------------------------------------

-- The default view: everything not archived, newest first.
CREATE INDEX IF NOT EXISTS idx_notifications_user_active
  ON public.notifications (user_id, created_at DESC)
  WHERE archived_at IS NULL;

-- The two filters. Partial, because both are a small minority of rows — an
-- archive nobody prunes and a flag used sparingly are exactly the shapes a
-- partial index is for.
CREATE INDEX IF NOT EXISTS idx_notifications_user_archived
  ON public.notifications (user_id, archived_at DESC)
  WHERE archived_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_user_important
  ON public.notifications (user_id, created_at DESC)
  WHERE important_at IS NOT NULL AND archived_at IS NULL;

COMMIT;

-- ============================================================================
-- VERIFY
--   SELECT column_name FROM information_schema.columns
--    WHERE table_schema='public' AND table_name='notifications'
--      AND column_name IN ('important_at','archived_at');   -- 2 rows
--
--   SELECT indexname FROM pg_indexes
--    WHERE schemaname='public' AND tablename='notifications';
--   -- expect idx_notifications_user_active / _archived / _important
--
--   -- and that the existing policy already covers the new columns, as itself:
--   UPDATE public.notifications SET important_at = now()
--    WHERE user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
--    LIMIT 1;   -- succeeds; the same UPDATE against another user's row does not
--
-- ROLLBACK
--   DROP INDEX IF EXISTS public.idx_notifications_user_active;
--   DROP INDEX IF EXISTS public.idx_notifications_user_archived;
--   DROP INDEX IF EXISTS public.idx_notifications_user_important;
--   ALTER TABLE public.notifications
--     DROP COLUMN IF EXISTS important_at,
--     DROP COLUMN IF EXISTS archived_at;
--   -- Purely additive, so this is a clean reversal: nothing read these before.
-- ============================================================================
