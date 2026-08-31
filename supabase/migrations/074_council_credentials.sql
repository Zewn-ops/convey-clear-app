-- ============================================================================
-- 074 — council portal logins, entered by the firm, readable only by admin
-- ============================================================================
-- From the handwritten notes transcribed 2026-08-31 (§11.13).
--
-- Both councils ask the firm for EVERY staff member's portal login:
--   City of Tshwane:    "USER'S LOGIN DETAILS - ETSHWANE"
--   City of Ekurhuleni: "USER'S LOGIN DETAILS (LIST OF ALL STAFF)"
--
-- Zewn, 2026-08-31, asked how to handle it:
--   "for now just... im not sure because it is a risk. make the fields entered
--    but only a conveyclear admin can see the data once entered."
--
-- 🔒 WHAT THIS TABLE IS
--   Live third-party municipal portal passwords, for every attorney at every
--   firm on the platform. It is the highest-value target in the schema. The
--   design below assumes it WILL eventually be read by someone who should not
--   have it, and tries to make that survivable.
--
-- 🔒 THREE LAYERS, EACH DOING A DIFFERENT JOB
--
--   1. ENCRYPTED AT REST, IN THE APPLICATION. The columns hold AES-256-GCM
--      ciphertext, never plaintext. The key lives in the environment
--      (COUNCIL_CRED_KEY) exactly where the standing rule puts machine
--      secrets -- Vercel env and .env.local -- and NEVER in the database. So a
--      database dump, a leaked backup or a mistaken `select *` yields
--      ciphertext, not credentials. See src/lib/council-credentials.ts; the
--      write path REFUSES rather than falling back to plaintext if the key is
--      missing.
--
--      ⚠️ THE TRADE: lose COUNCIL_CRED_KEY and every stored credential is
--      unrecoverable. They must be re-entered. That is the correct failure
--      mode for a secret store, but it has to be known. Back the key up in
--      Vaultwarden.
--
--   2. ADMIN-TIER READ ONLY, IN THE DATABASE. app_is_admin() (013: admin +
--      super_admin). Not staff. Not the firm. The firm WRITES its logins and
--      cannot read them back -- which is exactly what Zewn asked for, and is
--      also why there is no partner SELECT policy below.
--
--   3. NO WRITE POLICY AT ALL for `authenticated`. Writes go through
--      /api/partner/firm/credentials on the service role after re-checking
--      is_firm_admin -- the pattern 037 established for firm self-service. A
--      route cannot be the boundary for READS (Supabase exposes PostgREST
--      directly, so a route-only read check is bypassable) but it is a fine
--      boundary for WRITES: the worst a bypass achieves is writing a
--      credential nobody can read back.
--
-- 🔒 THE EYE TOGGLE IS NOT A SECURITY CONTROL
--   Zewn asked for show/hide buttons on username and password. That is
--   shoulder-surfing protection in the admin UI and nothing more. The boundary
--   is layers 1-3 above.
--
-- SCOPE: PER USER, PER COUNCIL
--   The councils ask for a list of all staff, so the credential belongs to a
--   PERSON at a firm, for one council. The existing per-CLIENT
--   municipal_username / municipal_password in ficaFields() are a different
--   thing -- a client's own municipal account -- and are left alone.
--
-- ▶ REVISIT AFTER LAUNCH. Zewn's own words were "for now".
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.firm_council_credentials (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Denormalised from users.business_partner_id so RLS and the unique index
  -- do not have to join. Kept honest by the trigger below.
  firm_id       uuid NOT NULL
                  REFERENCES public.firms(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL
                  REFERENCES public.users(id) ON DELETE CASCADE,

  -- COT / COJ / COE / ... — deliberately unconstrained. MUNICIPALITIES in
  -- conveyclear-lists.ts has ten entries today and councils get added; a CHECK
  -- here would mean a migration every time one does.
  municipality  text NOT NULL,

  -- 🔒 AES-256-GCM ciphertext. NEVER plaintext. Written only by
  -- src/lib/council-credentials.ts.
  username_ciphertext text NOT NULL,
  password_ciphertext text NOT NULL,

  -- Which key encrypted these, so the key can be rotated without a flag day:
  -- bump the version, decrypt-with-old / encrypt-with-new in a background
  -- pass, and the column says which rows are still on the old key.
  key_version   integer NOT NULL DEFAULT 1,

  created_by    uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_by    uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at    timestamptz NOT NULL DEFAULT now(),

  -- One credential per person per council. Re-entering replaces.
  CONSTRAINT firm_council_credentials_unique UNIQUE (user_id, municipality)
);

CREATE INDEX IF NOT EXISTS idx_firm_council_credentials_firm
  ON public.firm_council_credentials(firm_id);

COMMENT ON TABLE public.firm_council_credentials IS
  '🔒 Council portal logins for a firm''s staff, one row per user per '
  'council. Values are AES-256-GCM ciphertext; the key lives in the '
  'environment (COUNCIL_CRED_KEY), never in this database. Readable '
  'only by the admin tier -- the firm writes its own logins and cannot '
  'read them back. Written only through '
  '/api/partner/firm/credentials on the service role. Zewn 2026-08-31, '
  'and marked "for now": revisit after launch.';

COMMENT ON COLUMN public.firm_council_credentials.key_version IS
  'Which COUNCIL_CRED_KEY encrypted this row. Lets the key rotate '
  'without a flag day -- rows still on an old version can be '
  're-encrypted in the background.';

-- ---------------------------------------------------------------------------
-- The denormalised firm_id must match the user's actual firm
-- ---------------------------------------------------------------------------
-- Without this, a caller with service-role access could stamp a credential to
-- the wrong firm and it would read as that firm's. A CHECK cannot look at
-- another table, so this is a trigger.

CREATE OR REPLACE FUNCTION public.enforce_credential_firm()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  actual_firm uuid;
BEGIN
  SELECT business_partner_id INTO actual_firm
    FROM public.users WHERE id = NEW.user_id;

  IF actual_firm IS NULL THEN
    RAISE EXCEPTION
      'A council credential belongs to a user at a firm; user % is at no '
      'firm.', NEW.user_id
      USING ERRCODE = 'check_violation';
  END IF;

  IF actual_firm <> NEW.firm_id THEN
    RAISE EXCEPTION
      'Council credential firm_id does not match the user''s firm.'
      USING ERRCODE = 'check_violation';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_firm_council_credentials_firm
  ON public.firm_council_credentials;

CREATE TRIGGER trg_firm_council_credentials_firm
  BEFORE INSERT OR UPDATE ON public.firm_council_credentials
  FOR EACH ROW EXECUTE FUNCTION public.enforce_credential_firm();

-- ---------------------------------------------------------------------------
-- RLS: admin reads. Nobody else reads. Nobody writes through PostgREST.
-- ---------------------------------------------------------------------------

ALTER TABLE public.firm_council_credentials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS firm_council_credentials_admin_read
  ON public.firm_council_credentials;
CREATE POLICY firm_council_credentials_admin_read
  ON public.firm_council_credentials
  FOR SELECT TO authenticated
  USING (public.app_is_admin());

-- ⚠️ There is deliberately NO insert/update/delete policy, and deliberately
-- no policy for staff or for the owning firm. Writes are made by the service
-- role from /api/partner/firm/credentials, which re-checks is_firm_admin.
-- Adding a partner SELECT policy here would defeat the entire point.

COMMIT;

-- ============================================================================
-- VERIFY
-- ============================================================================
--   SELECT to_regclass('public.firm_council_credentials');
--   -- expect: public.firm_council_credentials
--
--   SELECT polname, polcmd FROM pg_policy
--    WHERE polrelid = 'public.firm_council_credentials'::regclass;
--   -- expect: exactly ONE row, firm_council_credentials_admin_read, cmd 'r'
--
--   SELECT relrowsecurity FROM pg_class
--    WHERE oid = 'public.firm_council_credentials'::regclass;
--   -- expect: true
--
--   SELECT tgname FROM pg_trigger
--    WHERE tgname = 'trg_firm_council_credentials_firm';
--   -- expect: 1 row
--
-- 🔒 AND THE ONE THAT MATTERS -- prove no plaintext ever landed:
--   SELECT username_ciphertext FROM firm_council_credentials LIMIT 5;
--   -- expect: base64-looking blobs, NOT anything readable.
--
-- ============================================================================
-- DOWN
-- ============================================================================
--   DROP TRIGGER IF EXISTS trg_firm_council_credentials_firm
--     ON public.firm_council_credentials;
--   DROP FUNCTION IF EXISTS public.enforce_credential_firm();
--   DROP TABLE IF EXISTS public.firm_council_credentials;
-- ============================================================================
