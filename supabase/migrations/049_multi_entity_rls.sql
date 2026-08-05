-- ============================================================================
-- 049 — switch the RLS helpers to membership
-- ============================================================================
-- 🔴 THE BEHAVIOUR-CHANGING ONE. 048 is inert; this is the flip.
--
-- Deliberately tiny — two function bodies and one policy — so it can be read in
-- full before running. All the machinery is in 048.
--
-- PRECONDITIONS
--   1. 048 applied and its backfill verified: every user with a client_id has a
--      matching client_members row, and exactly one default.
--   2. Equivalence proven per user by JWT impersonation:
--        app_user_client_id()  ==  the single member of app_user_client_ids()
--      for every user who has exactly one membership. Anything else means the
--      backfill is short and this migration will widen or narrow access.
--
-- WHAT CHANGES
--   can_access_client and can_access_matter stop asking "is this THE user's
--   client" and start asking "is this ONE OF the user's entities". For a user
--   with a single membership the two are identical, which is why the backfill
--   makes this flip invisible on the day it runs.
--
--   Staff, partner-firm and matter-subscriber access are untouched. Only the
--   client-side branch of each helper moves.
--
-- app_user_client_id() IS KEPT, now returning the DEFAULT entity rather than
-- users.client_id. Nothing in the RLS path depends on it after this, but the
-- app still calls it, and keeping it means 048 + 049 can be rolled back
-- together without touching application code.
-- ============================================================================

BEGIN;

-- The shim. Same signature, same meaning for a single-entity user; now sourced
-- from membership so the switcher and the policies cannot disagree.
CREATE OR REPLACE FUNCTION public.app_user_client_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT cm.client_id
    FROM public.client_members cm
    JOIN public.users u ON u.id = cm.user_id
   WHERE u.auth_user_id = auth.uid()
   ORDER BY cm.is_default DESC, cm.created_at ASC
   LIMIT 1;
$$;

-- ---------------------------------------------------------------------------
-- can_access_client — the client branch becomes a set membership test.
-- Body is otherwise byte-identical to 006.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_access_client(c_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT app_is_staff()
      OR (c_id IS NOT NULL AND c_id IN (SELECT app_user_client_ids()))
      OR (app_user_partner_id() IS NOT NULL
          AND EXISTS (SELECT 1 FROM public.clients c
                      WHERE c.id = c_id AND c.business_partner_id = app_user_partner_id()));
$$;

-- ---------------------------------------------------------------------------
-- can_access_matter — the client branch becomes a set membership test.
--
-- ⚠️ BASED ON 014, NOT 006. Migration 014 redefined this function and added the
-- firm branch below (m.business_partner_id = app_user_partner_id()), which is
-- how a partner reaches a matter assigned straight to their firm with no client
-- attached. Rewriting from 006 silently dropped it, and staging caught it as a
-- partner losing one of six matters.
--
-- Generalisable: a function body is text, and CREATE OR REPLACE takes the whole
-- body. Before redefining one in a migration, find the LATEST definition in the
-- history, not the first:
--   grep -ln "FUNCTION public.<name>" supabase/migrations/*.sql
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_access_matter(m_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT app_is_staff()
      OR EXISTS (
           SELECT 1 FROM public.matters m WHERE m.id = m_id AND (
               m.client_id IN (SELECT app_user_client_ids())
            OR (app_user_partner_id() IS NOT NULL
                AND m.business_partner_id = app_user_partner_id())
            OR (app_user_partner_id() IS NOT NULL
                AND m.client_id IN (SELECT id FROM public.clients
                                    WHERE business_partner_id = app_user_partner_id()))
           ))
      OR EXISTS (SELECT 1 FROM public.matter_subscribers s
                 WHERE s.matter_id = m_id AND s.user_id = app_current_user_id());
$$;

-- ---------------------------------------------------------------------------
-- The one policy that named the helper directly rather than going through
-- can_access_*. A client should see consent recorded for ANY entity they act
-- for, not only their default one.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS consent_events_self_read ON public.consent_events;
CREATE POLICY consent_events_self_read ON public.consent_events FOR SELECT TO authenticated
  USING (client_id IN (SELECT app_user_client_ids()));

COMMIT;

-- ============================================================================
-- VERIFY — by impersonation, not by reading the policy text.
--
--   -- pick a user, then:
--   SELECT auth_user_id AS uid FROM users WHERE email='<email>' \gset
--   BEGIN;
--     SET LOCAL role authenticated;
--     SELECT set_config('request.jwt.claims',
--       '{"sub":"' || :'uid' || '","role":"authenticated"}', true);
--     SELECT count(*) FROM matters;   -- compare against the pre-049 number
--     SELECT count(*) FROM clients;
--   COMMIT;
--
-- The five cases that matter:
--   staff              — sees everything, unchanged
--   client, 1 entity   — IDENTICAL counts to before 049. If these moved, the
--                        backfill was wrong, not the policy
--   client, 2 entities — sees the union, and nothing beyond it
--   partner            — unchanged; this migration does not touch that branch
--   NO membership      — sees nothing. The case most worth checking, because a
--                        helper that returns an empty set must deny, not allow
--
-- ROLLBACK — restores 006 exactly. Safe while 048's table still exists.
--   CREATE OR REPLACE FUNCTION public.app_user_client_id()
--   RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
--     SELECT client_id FROM public.users WHERE auth_user_id = auth.uid();
--   $$;
--   -- then re-run 006's can_access_client body and 014's can_access_matter body
--   -- verbatim (014 is the latest pre-049 definition of can_access_matter),
--   -- and restore the policy:
--   DROP POLICY IF EXISTS consent_events_self_read ON public.consent_events;
--   CREATE POLICY consent_events_self_read ON public.consent_events FOR SELECT TO authenticated
--     USING (client_id = app_user_client_id());
-- ============================================================================
