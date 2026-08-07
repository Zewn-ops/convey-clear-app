-- ============================================================================
-- 057 — a self-signup on a known contact card is refused, not adopted
-- ============================================================================
-- Meeting 2 (2026-08-06) Details §80: "If a user attempts to register with an
-- email already present in a contact card, the system will prevent account
-- creation and instead send a notification to ConveyClear members. This allows
-- ConveyClear members to verify the user and create the login on their behalf."
--
-- WHAT IT DOES TODAY (the bug this closes)
--   handle_new_user() adopts a pre-seeded `users` row by email, else creates a
--   fresh one. It never looks at `clients` — the contact cards. So someone
--   whose email is on a client record but who has no `users` row today gets a
--   BRAND NEW, unlinked profile: they see an empty portal, and ConveyClear ends
--   up with two identities for one person. Nothing warns anybody.
--
-- WHY A TRIGGER AND NOT ONLY AN APP CHECK
--   supabase.auth.signUp is called from the browser. An app-side check is the
--   good-UX path, not a boundary — anyone can post to the Supabase auth endpoint
--   directly. Raising here rolls back the auth.users insert, so the account is
--   genuinely not created.
--
-- ⚠️ THE NOTIFICATION CANNOT BE SENT FROM HERE. Raising rolls the transaction
--   back, and any row this function inserted would go with it. So the app route
--   records the attempt and notifies staff; this trigger is the part that cannot
--   be bypassed. A direct-to-Supabase bypass is therefore BLOCKED but SILENT —
--   accepted deliberately: refusing the account matters more than logging it,
--   and the normal path does both.
--
-- ⚠️ THE PROVISIONED PATH IS EXEMPT — deliberately. A staff-created login
--   carries provisioned=true, and staff creating the login on the client's
--   behalf is the REMEDY §80 asks for. Blocking it would block the fix.
--
-- ⚠️ Base is 013's definition, not 005's. Verified:
--   grep -ln "FUNCTION public.handle_new_user" supabase/migrations/*.sql
--   → 005, 013. A function body is text and does not follow later edits, so the
--   whole body below is 013's with one block added.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.signup_requests (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email      text NOT NULL,
  full_name  text,
  -- The contact card that caused the refusal, when the app could resolve it.
  matched_client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending'
           CHECK (status IN ('pending', 'actioned', 'dismissed')),
  notes       text,
  actioned_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  actioned_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.signup_requests IS
  'Someone tried to self-register on an email that is already a contact card. '
  'The account was refused (handle_new_user raises); this is the queue staff '
  'work to verify the person and create the login for them. Meeting 2 §80.';

CREATE INDEX IF NOT EXISTS idx_signup_requests_pending
  ON public.signup_requests (created_at DESC) WHERE status = 'pending';

-- Staff only, in both directions. There is no partner or client branch: this
-- table records that a specific email belongs to a known contact, which is
-- exactly the kind of thing that must not be readable by whoever asks.
ALTER TABLE public.signup_requests ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.signup_requests TO authenticated;

DROP POLICY IF EXISTS signup_requests_staff_all ON public.signup_requests;
CREATE POLICY signup_requests_staff_all ON public.signup_requests FOR ALL TO authenticated
  USING (public.app_is_staff()) WITH CHECK (public.app_is_staff());

DROP TRIGGER IF EXISTS trg_signup_requests_updated_at ON public.signup_requests;
CREATE TRIGGER trg_signup_requests_updated_at
  BEFORE UPDATE ON public.signup_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ----------------------------------------------------------------------------
-- The guard.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_provisioned boolean := COALESCE(
    (NEW.raw_user_meta_data->>'provisioned')::boolean, false);
BEGIN
  -- (a) Account provisioned by an admin/server action (flag set in user_metadata):
  --     adopt the pre-seeded row by email regardless of role. Trusted path.
  IF v_provisioned THEN
    UPDATE public.users
       SET auth_user_id = NEW.id
     WHERE email = NEW.email
       AND auth_user_id IS NULL;
    IF FOUND THEN RETURN NEW; END IF;
  ELSE
    -- (b) Public self-signup: only adopt a pre-seeded NON-PRIVILEGED row.
    UPDATE public.users
       SET auth_user_id = NEW.id
     WHERE email = NEW.email
       AND auth_user_id IS NULL
       AND role IN ('client','attorney','contractor','business_partner','council');
    IF FOUND THEN RETURN NEW; END IF;

    -- (b2) NEW in 057 — no `users` row was adopted, but this email IS on a
    --      contact card. Refuse rather than minting a second, unlinked identity
    --      for a person ConveyClear already knows. Staff verify and provision
    --      the login instead (path (a) above), which is the §80 remedy.
    --
    --      Reached only when (b) found nothing, so a client who already has a
    --      users row signs in normally and never touches this.
    IF EXISTS (
      SELECT 1 FROM public.clients c
       WHERE lower(c.primary_email) = lower(NEW.email)
    ) THEN
      RAISE EXCEPTION 'cc_signup_needs_verification'
        USING HINT = 'This email belongs to an existing ConveyClear contact. '
                     'ConveyClear must verify and create this login.';
    END IF;
  END IF;

  -- (c) No row adopted → create a fresh client profile. Role forced to 'client'.
  INSERT INTO public.users (auth_user_id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    NULLIF(NEW.raw_user_meta_data->>'full_name', ''),
    'client'
  )
  ON CONFLICT (email) DO UPDATE
    SET auth_user_id = EXCLUDED.auth_user_id
    WHERE public.users.auth_user_id IS NULL;

  RETURN NEW;
END;
$$;

COMMIT;

-- ============================================================================
-- VERIFY
--
--   -- a self-signup on an email with NO contact card still works
--   → account created, users row role 'client'
--
--   -- a self-signup on an email that IS a contact card is refused
--   INSERT INTO clients (entity_type, full_name, primary_email)
--   VALUES ('natural_person', 'Test Person', 'collide@example.com');
--   -- then sign up as collide@example.com through the app
--   → ERROR cc_signup_needs_verification, and CRUCIALLY:
--   SELECT count(*) FROM auth.users WHERE email = 'collide@example.com'; → 0
--     (the raise rolled the insert back — if this is 1, the trigger is AFTER
--      INSERT on a path that swallows the exception; check before shipping)
--
--   -- case-insensitivity holds
--   -- sign up as COLLIDE@example.com → still refused
--
--   -- the staff remedy is NOT blocked: provision the same email from
--   -- /admin/users (provisioned=true) → succeeds, adopts the seeded row
--
--   -- an existing client WITH a users row is unaffected (path b adopts first)
--
-- ROLLBACK — restores 013's function verbatim; the table is inert once nothing
-- raises. Body is this one minus the (b2) block.
-- ============================================================================
