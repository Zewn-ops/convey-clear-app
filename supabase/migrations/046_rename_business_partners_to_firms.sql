-- ============================================================================
-- 046 — rename business_partners → firms
-- ============================================================================
-- Glossary locked 2026-08-04: Entity = a clients row (person, company, trust) ·
-- Firm = an attorney/conveyancer/estate-agent practice · Member = a user's link
-- to an entity · Party = a role played on a transfer.
--
-- "business_partners" collided with the redesign spec's "Businesses", which are
-- client data entities with no login. Two different things one word apart, in a
-- spec that is about to drive the schema.
--
-- WHAT FOLLOWS THE RENAME AUTOMATICALLY (Postgres tracks these by OID, not name)
--   foreign keys · indexes · RLS policies · triggers · view definitions
--   Nothing below re-creates them. FK constraint names live on the REFERENCING
--   table, so hints like property_transfers_business_partner_id_fkey are
--   unchanged and the app must keep using them verbatim.
--
-- WHAT DOES *NOT* FOLLOW  ⚠️
--   plpgsql / SQL function BODIES are stored as text, not parsed. Exactly one
--   function in this schema selects from the table by name:
--   public.matters_set_firm_denorm() (migration 029). Left alone it would raise
--   "relation public.business_partners does not exist" on every matter insert
--   or firm re-assignment — and stay silent until someone created a matter.
--   It is re-created below. Verified by scanning every function body in 001-045;
--   it is the only one.
--
-- COLUMNS ARE NOT RENAMED. users.business_partner_id, clients.business_partner_id,
-- matters.business_partner_id, property_transfers.{business_partner_id,
-- estate_agent_partner_id} all keep their names, as does app_user_partner_id().
-- The table is the noun that collided; renaming the columns is a second, larger
-- job with no functional gain.
--
-- DEPLOY ORDER — this migration is safe to run BEFORE the app deploy.
-- The compat view at the end keeps the old name working, so the database and
-- the Vercel deploy do not have to flip in the same second. Sequence:
--   1. run 046            → both names work
--   2. deploy the app     → app uses public.firms
--   3. run 047            → drops the shim
-- ============================================================================

BEGIN;

-- A view without security_invoker runs with the OWNER's rights and would bypass
-- RLS on firms entirely. Refuse to build the shim if the server cannot enforce it.
DO $guard$
BEGIN
  IF current_setting('server_version_num')::int < 150000 THEN
    RAISE EXCEPTION
      'PostgreSQL 15+ required for security_invoker views (found %). Without it the compat view would bypass RLS on firms.',
      current_setting('server_version');
  END IF;
END
$guard$;

ALTER TABLE public.business_partners RENAME TO firms;

COMMENT ON TABLE public.firms IS
  'FIRM — an attorney, conveyancer or estate-agent practice whose users log in. '
  'NOT a client entity: those are public.clients (natural_person | business | trust), '
  'which have no login of their own. Renamed from business_partners in 046; the '
  '*_business_partner_id columns that point here deliberately keep their names.';

-- ---------------------------------------------------------------------------
-- The one function body that does not follow the rename.
-- Identical to 029 except the table name; kept BEFORE-trigger so the write lands
-- in place with no second UPDATE.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.matters_set_firm_denorm()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.business_partner_id IS NULL THEN
    NEW.firm_name   := NULL;
    NEW.firm_abbrev := NULL;
  ELSE
    SELECT f.name, f.abbreviation
      INTO NEW.firm_name, NEW.firm_abbrev
      FROM public.firms f
     WHERE f.id = NEW.business_partner_id;
  END IF;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Stale names. All of these kept working through the rename; they just read
-- wrong now, and the point of this migration is the noun.
-- ---------------------------------------------------------------------------
ALTER FUNCTION public.business_partners_sync_matter_firm() RENAME TO firms_sync_matter_firm;
ALTER TRIGGER trg_bp_sync_matter_firm          ON public.firms RENAME TO trg_firms_sync_matter_firm;
ALTER TRIGGER trg_business_partners_updated_at ON public.firms RENAME TO trg_firms_updated_at;
ALTER POLICY  partners_staff_all               ON public.firms RENAME TO firms_staff_all;
ALTER POLICY  partners_self                    ON public.firms RENAME TO firms_self;

-- ---------------------------------------------------------------------------
-- TEMPORARY compat shim — dropped by 047.
-- security_invoker makes RLS on firms apply to the CALLER, so the view grants
-- no access the table would not. A simple view over one table is auto-updatable,
-- so writes from a not-yet-deployed build keep working too.
-- ---------------------------------------------------------------------------
CREATE VIEW public.business_partners WITH (security_invoker = true) AS
  SELECT * FROM public.firms;

COMMENT ON VIEW public.business_partners IS
  'TEMPORARY compat shim for the 046 rename so the database and the app deploy '
  'need not flip together. DROP VIA 047 once the deploy is confirmed. If this '
  'still exists weeks from now, something was forgotten.';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.business_partners TO authenticated;

COMMIT;

-- ============================================================================
-- VERIFY (run after COMMIT)
--
--   -- table renamed, shim present
--   SELECT table_name, table_type FROM information_schema.tables
--    WHERE table_schema='public' AND table_name IN ('firms','business_partners');
--   -- expect: firms = BASE TABLE, business_partners = VIEW
--
--   -- the function no longer names the old table
--   SELECT prosrc ~ 'business_partners' AS still_broken
--     FROM pg_proc WHERE proname='matters_set_firm_denorm';
--   -- expect: false
--
--   -- policies came across
--   SELECT polname FROM pg_policy WHERE polrelid='public.firms'::regclass ORDER BY 1;
--   -- expect: firms_self, firms_staff_all
--
--   -- the denorm trigger still works end to end (the thing that would break silently)
--   --   pick a real firm id, then:
--   -- UPDATE firms SET name = name WHERE id = '<id>';        -- reverse sync fires
--   -- SELECT firm_name FROM matters WHERE business_partner_id = '<id>';
--
-- ROLLBACK
--   BEGIN;
--   DROP VIEW public.business_partners;
--   ALTER TABLE public.firms RENAME TO business_partners;
--   ALTER FUNCTION public.firms_sync_matter_firm() RENAME TO business_partners_sync_matter_firm;
--   ALTER TRIGGER trg_firms_sync_matter_firm ON public.business_partners RENAME TO trg_bp_sync_matter_firm;
--   ALTER TRIGGER trg_firms_updated_at       ON public.business_partners RENAME TO trg_business_partners_updated_at;
--   ALTER POLICY  firms_staff_all            ON public.business_partners RENAME TO partners_staff_all;
--   ALTER POLICY  firms_self                 ON public.business_partners RENAME TO partners_self;
--   -- and re-run 029's matters_set_firm_denorm() body verbatim
--   COMMIT;
-- ============================================================================
