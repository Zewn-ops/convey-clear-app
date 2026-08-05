-- ============================================================================
-- 048 — client_members: one login, several entities
-- ============================================================================
-- Section 1, P1. INERT: this migration creates and backfills, nothing reads it.
-- 049 swaps the RLS helpers over. Split deliberately, per the 042/043 house
-- pattern: prep and enforce never ship in the same migration.
--
-- WHY
--   The redesign spec's "one login, several business entities" needs membership.
--   users.client_id is a single FK, so a person who owns a property personally
--   AND through a company needs two logins today.
--
--   clients is ALREADY the entity table (entity_type ∈ natural_person | business
--   | trust), so this adds membership, not a parallel model. Zewn's framing —
--   "ExamplePerson – Personal" and "ExamplePerson – ExampleBusiness" as
--   subsections of one profile — is exactly this table plus an entity switcher.
--
-- BLAST RADIUS, measured on the live schema rather than assumed:
--   app_user_client_id() is referenced by exactly TWO function bodies
--   (can_access_client, can_access_matter) and ONE policy
--   (consent_events_self_read). Every other policy routes through those
--   SECURITY DEFINER helpers, which exist precisely so that users is not
--   recursed on. That is why multi-entity is a small change and not a rewrite.
--
-- users.client_id IS DELIBERATELY KEPT and kept in sync by the backfill. It
-- stays the "default entity" pointer, so this migration is revertible and so
-- 049 can be rolled back without stranding anyone.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.client_members (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES public.users(id)   ON DELETE CASCADE,
  client_id   uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,

  -- Section 1 enforces owner | member only. The spec's finer set (a viewer who
  -- cannot open the FICA vault) lands with Section 3, where Seattle at ~500
  -- stores brings many staff per entity. Widening a CHECK is one line; adding a
  -- column to a populated membership table later is a backfill, which is the
  -- retroactive work this ordering avoids.
  role        text NOT NULL DEFAULT 'member' CHECK (role IN ('owner','member')),

  -- Which entity this user lands on at login. The switcher changes it.
  is_default  boolean NOT NULL DEFAULT false,

  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT client_members_unique UNIQUE (user_id, client_id)
);

COMMENT ON TABLE public.client_members IS
  'MEMBER — a user''s link to an ENTITY (public.clients). One login may hold '
  'several: a person''s own affairs plus each business or trust they act for. '
  'Glossary locked 2026-08-04: Entity / Firm / Member / Party.';

-- At most one default per user. A partial unique index rather than a trigger:
-- the database refuses a second default instead of quietly picking one.
CREATE UNIQUE INDEX IF NOT EXISTS client_members_one_default
  ON public.client_members (user_id) WHERE is_default;

CREATE INDEX IF NOT EXISTS idx_client_members_user   ON public.client_members (user_id);
CREATE INDEX IF NOT EXISTS idx_client_members_client ON public.client_members (client_id);

DROP TRIGGER IF EXISTS trg_client_members_updated_at ON public.client_members;
CREATE TRIGGER trg_client_members_updated_at
  BEFORE UPDATE ON public.client_members
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Backfill. Idempotent: ON CONFLICT DO NOTHING, so re-running is a no-op.
-- Every existing client user becomes the owner of their current entity, and
-- that entity becomes their default, which reproduces today's behaviour exactly.
-- ---------------------------------------------------------------------------
INSERT INTO public.client_members (user_id, client_id, role, is_default)
SELECT u.id, u.client_id, 'owner', true
  FROM public.users u
 WHERE u.client_id IS NOT NULL
ON CONFLICT (user_id, client_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- The set-returning helper 049 will switch the policies onto.
-- Defined here so it can be tested against real rows before anything reads it.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.app_user_client_ids()
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT cm.client_id
    FROM public.client_members cm
    JOIN public.users u ON u.id = cm.user_id
   WHERE u.auth_user_id = auth.uid();
$$;

COMMENT ON FUNCTION public.app_user_client_ids() IS
  'Every entity the caller is a member of. Replaces the single-value '
  'app_user_client_id() in the RLS helpers as of 049.';

-- ---------------------------------------------------------------------------
-- RLS. Staff manage membership; a user may read their own rows and nothing else.
-- Writes are admin-only on purpose: attaching a person to an entity grants them
-- that entity's whole matter history, so it is not a self-service action.
-- ---------------------------------------------------------------------------
ALTER TABLE public.client_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS client_members_staff_all ON public.client_members;
CREATE POLICY client_members_staff_all ON public.client_members FOR ALL TO authenticated
  USING (app_is_staff()) WITH CHECK (app_is_staff());

DROP POLICY IF EXISTS client_members_self_read ON public.client_members;
CREATE POLICY client_members_self_read ON public.client_members FOR SELECT TO authenticated
  USING (user_id = app_current_user_id());

COMMIT;

-- ============================================================================
-- VERIFY (run after COMMIT)
--
--   -- every client user got exactly one default
--   SELECT count(*) FILTER (WHERE u.client_id IS NOT NULL) AS client_users,
--          (SELECT count(*) FROM client_members WHERE is_default) AS defaults
--     FROM users u;
--   -- the two numbers must match
--
--   -- the backfill reproduces users.client_id exactly
--   SELECT count(*) FROM users u
--    WHERE u.client_id IS NOT NULL
--      AND NOT EXISTS (SELECT 1 FROM client_members cm
--                      WHERE cm.user_id = u.id AND cm.client_id = u.client_id);
--   -- expect 0
--
--   -- the new helper agrees with the old one for every existing user
--   -- (run per user via JWT impersonation; see 049's verification block)
--
-- ROLLBACK
--   DROP FUNCTION IF EXISTS public.app_user_client_ids();
--   DROP TABLE IF EXISTS public.client_members;
--   -- users.client_id was never modified, so nothing else needs undoing.
-- ============================================================================
