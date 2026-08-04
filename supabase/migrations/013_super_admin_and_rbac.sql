-- ============================================================================
-- ConveyClear — Migration 013: super_admin role + RBAC consolidation
-- ============================================================================
-- Created: 2026-06-14. Target: Supabase yhgriqagrhyblhmloctc (eu-west-1).
-- Run via the pooler from the VPS host (see CLAUDE.md Supabase connection note).
--
-- WHY: finalising the 5-role model for internal testing —
--   super_admin (Quantra/system owner)  ─ full control, assigns ANY role
--   admin       (Jukka / ConveyClear)   ─ org admin, manages staff + clients
--   staff_*     (Services/Ops/Delivery)  ─ run the pipeline
--   business_partner (law firm / attorney) ─ sees THEIR referred clients' matters
--   client      (property owner / business) ─ sees only own matters
--
-- This migration:
--   1. Adds 'super_admin' to users_role_check.
--   2. Folds super_admin into app_is_staff()  → inherits every staff_all policy.
--   3. Folds super_admin into app_is_admin()  → inherits user-management policy.
--   4. Adds app_is_super_admin() + app_is_partner() helpers.
--   5. Hardens handle_new_user(): self-signup ALWAYS lands 'client'; never adopts
--      a pre-seeded STAFF/ADMIN/SUPER row by email (privilege-escalation guard —
--      staff/partner accounts must be provisioned by an admin, not self-signup).
--   6. Adds a privilege-escalation guard trigger on public.users so a non-super
--      session can never create/elevate an admin or super_admin row. Service-role
--      (n8n / server actions) bypasses RLS but the server action enforces the rule
--      in code; this trigger is defence-in-depth for any authenticated path.
--
-- BYPASS NOTES: postgres (n8n) + service_role (Next.js server) BYPASS RLS, as in
-- migration 006. The guard trigger below intentionally only fires for sessions
-- that have an auth.uid() (browser/authenticated) — service-role has none, so
-- trusted server code is unaffected and must self-police (it does).
--
-- Idempotent. Safe to re-run.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Widen the role CHECK to add super_admin
-- ----------------------------------------------------------------------------
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE public.users ADD CONSTRAINT users_role_check CHECK (role IN (
    'super_admin', 'admin', 'staff_services', 'staff_ops', 'staff_delivery',
    'client', 'attorney', 'contractor', 'business_partner', 'council'
));

-- ----------------------------------------------------------------------------
-- 2. Helper functions (SECURITY DEFINER — read users bypassing RLS)
--    Redefining app_is_staff/app_is_admin to include super_admin makes every
--    existing *_staff_all / users_admin_all policy cover super_admin with no
--    per-table edits.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.app_is_staff()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT COALESCE(
    (SELECT role IN ('super_admin','admin','staff_services','staff_ops','staff_delivery')
       FROM public.users WHERE auth_user_id = auth.uid()),
    false);
$$;

CREATE OR REPLACE FUNCTION public.app_is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT COALESCE(
    (SELECT role IN ('admin','super_admin') FROM public.users WHERE auth_user_id = auth.uid()),
    false);
$$;

CREATE OR REPLACE FUNCTION public.app_is_super_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT COALESCE(
    (SELECT role = 'super_admin' FROM public.users WHERE auth_user_id = auth.uid()),
    false);
$$;

CREATE OR REPLACE FUNCTION public.app_is_partner()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT COALESCE(
    (SELECT role = 'business_partner' FROM public.users WHERE auth_user_id = auth.uid()),
    false);
$$;

-- ----------------------------------------------------------------------------
-- 3. Harden the signup trigger
--    Self-signup must ALWAYS become a fresh 'client'. The old version adopted
--    ANY pre-seeded row by email (incl. staff/admin) on first signup — fine when
--    we control seeding, but a hole if an attacker signs up with a known staff
--    email before that staffer does. New rule: only adopt a pre-seeded row whose
--    role is itself non-privileged (client/attorney/contractor/business_partner/
--    council). Privileged rows (super_admin/admin/staff_*) must be linked by an
--    admin via the user-management flow, never by public signup.
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

-- ----------------------------------------------------------------------------
-- 4. Privilege-escalation guard (defence-in-depth for authenticated sessions)
--    Blocks an authenticated (non-super) session from inserting/elevating a row
--    to admin or super_admin. Service-role (auth.uid() IS NULL) is exempt — the
--    server action that creates privileged users self-enforces who may do so.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_privileged_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Exempt trusted server contexts (no JWT) — service_role / postgres.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- An authenticated caller may only create/keep a privileged role if super_admin.
  IF NEW.role IN ('admin','super_admin') THEN
    IF NOT public.app_is_super_admin() THEN
      RAISE EXCEPTION 'Only a super_admin may assign the % role', NEW.role
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_privileged_role ON public.users;
CREATE TRIGGER trg_guard_privileged_role
  BEFORE INSERT OR UPDATE OF role ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.guard_privileged_role();

COMMIT;

-- ============================================================================
-- 5. Verification
-- ============================================================================
-- role list now includes super_admin
SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'users_role_check';

-- helpers present
SELECT proname FROM pg_proc
WHERE proname IN ('app_is_staff','app_is_admin','app_is_super_admin','app_is_partner','guard_privileged_role')
ORDER BY proname;

-- trigger present
SELECT tgname FROM pg_trigger WHERE tgname = 'trg_guard_privileged_role';
