-- ============================================================================
-- 020 — In-portal notifications (Theme I / Batch 3)
--   • notifications table (one row per recipient) + RLS (own read/update).
--   • Added to the supabase_realtime publication → live red dots + sound.
--   • users.notify_sound / notify_enquiries prefs (C1 notification settings).
-- Producers insert via the service role (bypasses RLS); recipients read/update
-- only their own rows.
-- Additive + idempotent.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.users(id)   ON DELETE CASCADE,
  type        TEXT NOT NULL,                 -- 'enquiry'|'enquiry_reply'|'referral'|'document'|'status'|'phase'
  title       TEXT NOT NULL,
  body        TEXT,
  link        TEXT,                          -- optional explicit path; else derived from matter_id/enquiry_id
  matter_id   UUID REFERENCES public.matters(id)   ON DELETE CASCADE,
  enquiry_id  UUID REFERENCES public.enquiries(id) ON DELETE CASCADE,
  read_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON public.notifications(user_id, read_at, created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notifications_own_read ON public.notifications;
CREATE POLICY notifications_own_read ON public.notifications FOR SELECT TO authenticated
  USING (user_id = app_current_user_id());

DROP POLICY IF EXISTS notifications_own_update ON public.notifications;
CREATE POLICY notifications_own_update ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = app_current_user_id()) WITH CHECK (user_id = app_current_user_id());
-- No INSERT policy: rows are created by the service role only.

-- Realtime publication (guarded — ADD TABLE is not idempotent).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END $$;

-- Per-user notification preferences (C1).
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS notify_sound     BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS notify_enquiries BOOLEAN NOT NULL DEFAULT true;

-- ----------------------------------------------------------------------------
-- Verification
--   SELECT tablename FROM pg_publication_tables
--     WHERE pubname='supabase_realtime' AND tablename='notifications';   -- 1 row
--   SELECT policyname FROM pg_policies WHERE tablename='notifications';  -- 2 rows
--   SELECT column_name FROM information_schema.columns
--     WHERE table_name='users' AND column_name LIKE 'notify_%';          -- 2 rows
-- ----------------------------------------------------------------------------
