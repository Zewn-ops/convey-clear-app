-- ============================================================================
-- 037 — Firm administrator: a firm manages its own banking, trust & BP numbers
--
-- Meeting 2 (2026-07-16): "The firm administrator feature is set to include the
-- capability for firms to input and edit their own specific details, including
-- trust banking information and municipality BP numbers." Distinct from the
-- standard business-partner user.
--
-- DESIGN CHOICES
--
--   1. is_firm_admin is a FLAG on users, NOT a new role. A firm-admin IS a
--      business_partner with elevated rights over their OWN firm's details;
--      making it a role would force every existing partner RLS predicate to
--      learn about it. The flag unlocks exactly one surface and changes nothing
--      else.
--
--   2. Banking lives in its OWN table, not on business_partners. The existing
--      `partners_self` policy lets ANY partner user SELECT their whole firm row
--      (id = app_user_partner_id()). Putting account numbers there would expose
--      them to every employee of the firm, not just its admin. A separate table
--      with its own policy keeps trust-account numbers firm-admin-only even
--      inside the firm — which is the point of a distinct admin role.
--
--   3. Writes are NOT granted to partners by RLS. Every partner mutation in this
--      app is authorised in a service-role route (see /api/partner/*), and this
--      is no different: the RLS below grants a firm-admin SELECT on their own
--      firm's rows (so the edit form can load), and the save route
--      (/api/partner/firm) does the write after re-checking is_firm_admin.
--
-- ⚠️ THE BANKING FIELD SET IS A PROPOSAL. A SA conveyancing firm holds a
--    business account AND a section-86(4) trust account; the columns below cover
--    both. Confirm the exact fields with Jukka before this is treated as final —
--    adding/renaming a column here is cheap, migrating populated account data is
--    not.
--
-- Additive, idempotent, single transaction. Applied manually (Supabase SQL
-- editor) like every migration in this folder.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. The flag + a helper that answers "is the caller a firm-admin, of a firm".
-- ----------------------------------------------------------------------------
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_firm_admin boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.users.is_firm_admin IS
  'A business_partner user with rights over their OWN firm''s banking/trust/BP '
  'details (migration 037). Not a role — all partner RLS still applies. Set by '
  'ConveyClear staff on the user-management screen.';

-- app_user_partner_id() already returns the caller's firm (006). This adds the
-- admin test. SECURITY DEFINER + fixed search_path, mirroring app_is_staff().
CREATE OR REPLACE FUNCTION public.app_is_firm_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users u
     WHERE u.auth_user_id = auth.uid()
       AND u.is_firm_admin
       AND u.business_partner_id IS NOT NULL
  );
$$;

-- ----------------------------------------------------------------------------
-- 2. firm_banking — one row per firm. SENSITIVE (account numbers).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.firm_banking (
  business_partner_id  uuid PRIMARY KEY
                         REFERENCES public.business_partners(id) ON DELETE CASCADE,
  -- Business (operating) account
  bank_name            text,
  account_name         text,
  account_number       text,
  branch_code          text,
  account_type         text,
  -- Trust account — conveyancers hold client funds in a separate trust account.
  trust_bank_name      text,
  trust_account_name   text,
  trust_account_number text,
  trust_branch_code    text,
  updated_by           uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at           timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.firm_banking IS
  'A firm''s banking + trust-account details (migration 037). Sensitive: '
  'readable/writable by ConveyClear staff and the firm''s OWN firm-admin only — '
  'NOT by regular partner users of the same firm, NOT by any other firm.';

DROP TRIGGER IF EXISTS trg_firm_banking_updated_at ON public.firm_banking;
CREATE TRIGGER trg_firm_banking_updated_at
  BEFORE UPDATE ON public.firm_banking
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 3. firm_bp_numbers — the council-assigned BP number, one per municipality.
--    A firm has a different BP number at COT, COJ, COE, … (used on clearance
--    applications), so this is one-to-many, not a column on the firm.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.firm_bp_numbers (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_partner_id uuid NOT NULL REFERENCES public.business_partners(id) ON DELETE CASCADE,
  municipality        text NOT NULL,
  bp_number           text NOT NULL,
  updated_by          uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_partner_id, municipality)
);

COMMENT ON TABLE public.firm_bp_numbers IS
  'A firm''s council-assigned BP (business partner) number per municipality '
  '(migration 037). Same access rules as firm_banking.';

DROP TRIGGER IF EXISTS trg_firm_bp_numbers_updated_at ON public.firm_bp_numbers;
CREATE TRIGGER trg_firm_bp_numbers_updated_at
  BEFORE UPDATE ON public.firm_bp_numbers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 4. RLS — staff full; the firm's OWN firm-admin reads; nobody else anything.
--    Writes for the firm-admin go through the service-role save route, so no
--    partner INSERT/UPDATE policy is granted (matches every partner mutation).
-- ----------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.firm_banking     TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.firm_bp_numbers  TO authenticated;

ALTER TABLE public.firm_banking    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.firm_bp_numbers ENABLE ROW LEVEL SECURITY;

-- The firm-admin's own firm. app_is_firm_admin() guarantees the caller is an
-- admin AND app_user_partner_id() is theirs, so a regular partner user (flag
-- false) matches nothing here even for their own firm.
DROP POLICY IF EXISTS firm_banking_staff_all ON public.firm_banking;
CREATE POLICY firm_banking_staff_all ON public.firm_banking FOR ALL TO authenticated
  USING (app_is_staff()) WITH CHECK (app_is_staff());

DROP POLICY IF EXISTS firm_banking_admin_read ON public.firm_banking;
CREATE POLICY firm_banking_admin_read ON public.firm_banking FOR SELECT TO authenticated
  USING (app_is_firm_admin() AND business_partner_id = app_user_partner_id());

DROP POLICY IF EXISTS firm_bp_numbers_staff_all ON public.firm_bp_numbers;
CREATE POLICY firm_bp_numbers_staff_all ON public.firm_bp_numbers FOR ALL TO authenticated
  USING (app_is_staff()) WITH CHECK (app_is_staff());

DROP POLICY IF EXISTS firm_bp_numbers_admin_read ON public.firm_bp_numbers;
CREATE POLICY firm_bp_numbers_admin_read ON public.firm_bp_numbers FOR SELECT TO authenticated
  USING (app_is_firm_admin() AND business_partner_id = app_user_partner_id());

COMMIT;

-- ----------------------------------------------------------------------------
-- Verification (run after COMMIT)
-- ----------------------------------------------------------------------------
-- Column + tables exist:
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'users' AND column_name = 'is_firm_admin';
--   SELECT tablename FROM pg_tables
--    WHERE tablename IN ('firm_banking', 'firm_bp_numbers');
--
-- Helper exists:
--   SELECT proname FROM pg_proc WHERE proname = 'app_is_firm_admin';
--
-- Make a firm-admin (do this for the demo firm's user):
--   UPDATE users SET is_firm_admin = true
--    WHERE email = '<the firm''s admin user email>' AND business_partner_id IS NOT NULL;
--
-- A regular partner user (is_firm_admin=false) must read ZERO banking rows even
-- for their own firm — confirm the admin_read policy really gates on the flag.
