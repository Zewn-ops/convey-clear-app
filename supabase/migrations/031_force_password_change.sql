-- ============================================================================
-- 031 — Force a password change after a staff-issued temporary password
--
-- PROBLEM
--   Staff can create a login for a client/partner, and the app generates a temp
--   password which is DISPLAYED to the staff member (CreatePartyAccount,
--   UserManager) and — since 028 — emailed to the user. Nothing ever required
--   the user to change it. So a client could keep using, indefinitely, a
--   password that a staff member has seen and that sat in an inbox in plaintext.
--
--   The roadmap's internal-launch bar lists "temp pws reset", and the
--   auto-client-login spec said "temp pw, force-change first login". The flag
--   for it never existed.
--
-- WHAT THIS DOES
--   users.must_change_password — set true wherever the app issues a temporary
--   password; the middleware then holds the user on /auth/change-password until
--   they set their own. Cleared only by the server route that performs the
--   change, so it cannot be cleared without the password actually changing.
--
-- DEFAULT false — this is a widening of a gate, and the same rule as 027: the
--   default must not retroactively capture existing rows. Every user who logged
--   in before this migration keeps working; only newly-issued temp passwords are
--   flagged. (Existing temp-password holders are handled by Zewn re-issuing
--   their passwords from /admin/users, which now sets the flag.)
--
-- Additive, idempotent, single transaction. Applied manually in the SQL editor.
-- ============================================================================

BEGIN;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.users.must_change_password IS
  'true = this account is on a staff-issued temporary password and is held at '
  '/auth/change-password until it sets its own. Set by the routes that issue a '
  'temp password; cleared ONLY by /api/auth/change-password, after the password '
  'update succeeds.';

-- The middleware reads this on every protected request, alongside role, in the
-- lookup it already does by auth_user_id.
CREATE INDEX IF NOT EXISTS idx_users_must_change_password
  ON public.users (auth_user_id)
  WHERE must_change_password;

COMMIT;

-- ----------------------------------------------------------------------------
-- Verification
-- ----------------------------------------------------------------------------
-- Column exists and NO existing user was retroactively locked out (expect 0):
--   SELECT count(*) FROM users WHERE must_change_password;
--
-- After Zewn re-issues a temp password to a test user, that user (and only
-- that user) should appear:
--   SELECT email, must_change_password FROM users WHERE must_change_password;
