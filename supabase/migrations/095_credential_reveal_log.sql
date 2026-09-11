-- ============================================================================
-- 095 — every reveal of a council login is recorded
-- ============================================================================
--
-- Zewn, 2026-09-11, on what to tell a firm about its stored council logins:
--   "let them know that only conveyclear members will be able to access the
--    login details. we need the details secure but at the same time the CC
--    members need access to it in order to do their work"
--
-- The answer to that is a promise ConveyClear can keep, and "secure, but our
-- people can see it" is much easier to keep when you can show a firm exactly who
-- looked and when.
--
-- ── IT WAS NOT LOGGED ───────────────────────────────────────────────────────
--
-- 074 and the reveal route were built for it and stopped short. The route's own
-- header says why the value crosses the wire one credential at a time:
--
--   "That also makes each reveal an event that can be logged, which a
--    client-side toggle can never be."
--
-- CAN BE. Nothing wrote the event, and no table existed to write it to. Checked
-- 2026-09-11: no audit table anywhere in the schema, and nothing in
-- /api/admin/council-credentials writes a row. So until now the platform held
-- live municipal passwords for every attorney at every firm, showed them to the
-- admin tier on request, and kept no record of a single one of those requests.
--
-- ── WHY ITS OWN TABLE ───────────────────────────────────────────────────────
--
-- The two activity feeds in this schema are matter_activities (004) and
-- transfer_activities (035). A credential reveal belongs to neither: it is about
-- a FIRM and a PERSON, not a piece of work, and nothing about it should appear
-- in a feed a firm reads casually.
--
-- ── DENORMALISED ON PURPOSE ─────────────────────────────────────────────────
--
-- firm_id, credential_user_id and municipality are copied onto the row rather
-- than joined through credential_id. A log that loses its subject when the
-- subject is deleted is not a log — a credential removed after being read must
-- still leave the reading behind, which is exactly the case anyone would want to
-- look up. credential_id is therefore ON DELETE SET NULL, not CASCADE.
--
-- ── WHAT IT DOES NOT HOLD ───────────────────────────────────────────────────
--
-- No ciphertext, no plaintext, no key version. This table answers "who looked at
-- whose login, when". Copying any part of the credential into an audit row would
-- make the audit trail a second, less protected copy of the thing being audited.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.credential_reveals (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The credential that was read. SET NULL rather than CASCADE: see above.
  credential_id uuid REFERENCES public.firm_council_credentials(id) ON DELETE SET NULL,

  -- Denormalised subject, so the row still says what happened after the
  -- credential is gone.
  firm_id            uuid NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
  credential_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  municipality       text,

  -- Who looked. NOT NULL: a reveal with no reader is not something this table
  -- should be able to record — the route holds an authenticated admin by the
  -- time it writes.
  revealed_by   uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  revealed_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_credential_reveals_firm
  ON public.credential_reveals(firm_id, revealed_at DESC);
CREATE INDEX IF NOT EXISTS idx_credential_reveals_credential
  ON public.credential_reveals(credential_id)
  WHERE credential_id IS NOT NULL;

COMMENT ON TABLE public.credential_reveals IS
  'One row each time a ConveyClear admin reveals a stored council portal '
  'login (074). Who looked, whose login, which council, when -- and nothing '
  'of the credential itself. Written by the service role from '
  '/api/admin/council-credentials; there is deliberately no INSERT policy, '
  'because a caller who can write this table can write a false denial of '
  'having read a password.';

-- ---------------------------------------------------------------------------
-- RLS: admin reads. Nobody writes through PostgREST. Nothing is ever updated.
-- ---------------------------------------------------------------------------
-- 🔒 The same tier that may reveal a credential may read the log of reveals.
-- Narrower than 074 in one way that matters: there is no UPDATE or DELETE
-- policy for anyone, so an admin who reads a login cannot then remove the
-- record of having read it. Service-role callers bypass RLS entirely, which is
-- true of every table here and is why the secret key is a secret.

ALTER TABLE public.credential_reveals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS credential_reveals_admin_read ON public.credential_reveals;
CREATE POLICY credential_reveals_admin_read
  ON public.credential_reveals
  FOR SELECT TO authenticated
  USING (public.app_is_admin());

COMMIT;

-- ============================================================================
-- VERIFY
-- ============================================================================
--
-- 1. The table exists:
--    SELECT to_regclass('public.credential_reveals');
--    -- expect: public.credential_reveals
--
-- 2. 🔒 Exactly ONE policy, and it is a SELECT:
--    SELECT polname, polcmd FROM pg_policy
--     WHERE polrelid = 'public.credential_reveals'::regclass;
--    -- expect: one row, credential_reveals_admin_read, cmd 'r'
--
-- 3. RLS is on:
--    SELECT relrowsecurity FROM pg_class
--     WHERE oid = 'public.credential_reveals'::regclass;
--    -- expect: true
--
-- 4. After revealing one login in the admin UI, the reading is there:
--    SELECT r.revealed_at, u.email AS looked_by, f.name AS firm, r.municipality
--      FROM credential_reveals r
--      JOIN users u ON u.id = r.revealed_by
--      JOIN firms f ON f.id = r.firm_id
--     ORDER BY r.revealed_at DESC LIMIT 5;
--    -- expect: one row per Show you clicked
--
-- ============================================================================
-- DOWN
-- ============================================================================
-- ⚠️ Dropping this destroys the audit trail. Deploy the code change that stops
-- writing it first, or reveals will start failing.
--   DROP TABLE IF EXISTS public.credential_reveals;
-- ============================================================================
