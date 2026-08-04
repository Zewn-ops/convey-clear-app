-- 028_email_notifications.sql
-- ============================================================================
-- A&A demo #5 — email push on PHASE changes only.
-- ============================================================================
-- Adds the two columns the email channel needs. The channel itself ships DARK:
-- `lib/email.ts` no-ops unless RESEND_API_KEY *and* EMAIL_FROM are both set, so
-- applying this migration changes nothing observable until those env vars exist.
--
--   * users.notify_email       — per-user opt-out. Default true (matches the
--     existing notify_sound / notify_enquiries prefs from migration 020).
--   * users.unsubscribe_token  — capability token for the one-click unsubscribe
--     link in the email footer. Opaque, per-user, and NOT the user id: the link
--     lands on an unauthenticated route, so it must not leak or accept an id.
--     Rotatable by updating the row.
--
-- Emails are sent for `type = 'phase'` only — stage changes are far too granular
-- and would train recipients to ignore the mail (Jukka, 2026-06-23).
--
-- Additive + idempotent.
-- ============================================================================

BEGIN;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS notify_email boolean NOT NULL DEFAULT true;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS unsubscribe_token uuid NOT NULL DEFAULT gen_random_uuid();

-- One token per user; the unsubscribe route looks a user up BY this token, so a
-- collision would unsubscribe the wrong person.
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_unsubscribe_token
  ON public.users(unsubscribe_token);

COMMENT ON COLUMN public.users.notify_email IS
  'Send phase-change emails to this user. Default true. Cleared by the one-click unsubscribe link or the /account toggle.';
COMMENT ON COLUMN public.users.unsubscribe_token IS
  'Opaque capability token for the unauthenticated unsubscribe route. Never expose the user id there.';

COMMIT;

-- ============================================================================
-- Verification
-- ============================================================================
SELECT column_name, data_type, is_nullable, column_default
  FROM information_schema.columns
 WHERE table_name = 'users' AND column_name IN ('notify_email', 'unsubscribe_token');

-- Every user must have a distinct token (the backfill uses the column DEFAULT,
-- which is evaluated per row).
SELECT count(*) AS users, count(DISTINCT unsubscribe_token) AS distinct_tokens
  FROM public.users;
