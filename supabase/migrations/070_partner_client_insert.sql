-- ============================================================================
-- 070 — a partner firm may create a client record, inside its own scope
--
-- THE POINT
--   The portal has been inviting attorneys to do something the database
--   forbids, and has done since 2026-08-06.
--
--   Since that date "capture a party" no longer writes contact details onto the
--   party row. It calls findOrCreateClientForParty(), which INSERTs into
--   `clients` — so a captured party becomes a real client record with a FICA
--   vault, reusable on their next matter. That was the right call.
--
--   But `clients` has carried exactly two policies since 006:
--
--     clients_staff_all     FOR ALL     app_is_staff()
--     clients_read_scoped   FOR SELECT  can_access_client(id)
--
--   There is no INSERT policy for anyone who is not staff, and no migration
--   between 006 and here adds one. So an attorney capturing a party who is not
--   already in the system hits RLS, gets 42501, and sees:
--
--       "You cannot create client records here."
--
--   …while the button that opens the form is shown to them unconditionally.
--
--   The rest of the application was already built for this to work. The party
--   route's own comments cite §108 — *an attorney assigning a party who is not
--   in the system creates them as a new client* — and §44, which wants a human
--   to verify that record afterwards. notifyStaffNewClient() exists and fires
--   on exactly this path. That notification has been unreachable for partners
--   for the whole time it has existed, because the INSERT dies first.
--
--   So this migration does not invent a capability. It makes the schema agree
--   with the design the code already implements.
--
-- ⚠️ SECURITY — WHY THIS IS NARROW, AND WHAT IT DELIBERATELY DOES NOT GRANT
--   `business_partner_id` IS the partner read scope: can_access_client() lets a
--   firm see any client stamped with its own id. An unscoped INSERT policy
--   would therefore be an access-granting primitive — a partner could mint a
--   row, or worse stamp one with ANOTHER firm's id, and read it back.
--
--   The WITH CHECK below forces both halves at once:
--
--     * app_user_partner_id() IS NOT NULL
--         — the caller belongs to a firm at all. Plain clients and any
--           unaffiliated user still cannot insert: their partner id is NULL and
--           the check fails.
--     * business_partner_id = app_user_partner_id()
--         — the new row is stamped with the caller's OWN firm, and no other.
--           A partner cannot create a client into a firm they do not belong to,
--           and cannot create an unstamped (NULL) client either.
--
--   What a firm gains is the ability to create client records inside a scope it
--   can already read in full. It reaches nothing it could not reach before.
--
--   NOT GRANTED, on purpose:
--     * UPDATE — a partner cannot edit a client record, including one they
--       created. §44 wants staff to verify it; letting the creator rewrite it
--       afterwards would empty that out.
--     * DELETE — same reason, and destructive besides.
--   Both remain staff-only via clients_staff_all.
--
--   Postgres OR's permissive policies together, so clients_staff_all is
--   untouched: staff keep inserting exactly as before, scoped to nothing.
--
--   One deliberate consequence: the INSERT ... RETURNING id that the party
--   route performs needs SELECT on the new row too. Because the row is stamped
--   with the caller's firm, clients_read_scoped already allows that. The
--   stamping is load-bearing twice.
--
-- ⚠️ PAIRED APPLICATION CHANGE — THIS MIGRATION IS INERT WITHOUT IT
--   api/transfer-parties calls findOrCreateClientForParty() with NO
--   scopeToFirmId, so the insert it builds carries business_partner_id = NULL.
--   Against the policy below that still fails. The route must pass the caller's
--   firm id for non-staff callers, or capture stays broken with a new policy
--   sitting unused behind it. Staff keep passing nothing — they dedupe against
--   everything they can see, which is everything.
--
-- ⚠️ SCOPE NOTE FOR JUKKA — this widens what an attorney can do, and Details
--   §102 says party management should be restricted to ConveyClear members.
--   That question is already open and already live: 050's RLS lets any member
--   of the owning firm add, edit and DELETE parties on production today. This
--   migration does not widen party management; it closes the one gap where the
--   UI offers a capability the database refuses. If §102 is answered by
--   restricting attorneys, this policy comes out with the rollback below and
--   the capture button gets hidden from partners — one change, cleanly undone.
--
-- Additive: creates one policy. No existing row, column or policy changes.
-- ============================================================================

BEGIN;

DROP POLICY IF EXISTS clients_partner_insert ON public.clients;
CREATE POLICY clients_partner_insert ON public.clients FOR INSERT TO authenticated
  WITH CHECK (
    app_user_partner_id() IS NOT NULL
    AND business_partner_id = app_user_partner_id()
  );

COMMENT ON POLICY clients_partner_insert ON public.clients IS
  'A partner firm may create a client record stamped with its OWN firm id, and '
  'no other (070). Created so an attorney capturing a transfer party can make '
  'the client record the capture flow has required since 2026-08-06. INSERT '
  'only — UPDATE and DELETE stay staff-only, because §44 has staff verify the '
  'record afterwards. Requires the caller to pass scopeToFirmId in '
  'findOrCreateClientForParty(), or the row is unstamped and this check fails.';

COMMIT;

-- ============================================================================
-- VERIFY
--   -- 1. The policy exists, is INSERT-only, and carries the scoping check:
--   SELECT polcmd, pg_get_expr(polwithcheck, polrelid) AS with_check
--     FROM pg_policy
--    WHERE polname = 'clients_partner_insert';
--   -- polcmd must be 'a' (INSERT). with_check must mention BOTH
--   -- app_user_partner_id() IS NOT NULL AND business_partner_id = app_user_partner_id()
--
--   -- 2. The three policies now on the table, and no more:
--   SELECT polname, polcmd FROM pg_policy
--    WHERE polrelid = 'public.clients'::regclass ORDER BY polname;
--   -- clients_partner_insert (a) · clients_read_scoped (r) · clients_staff_all (*)
--
--   -- 3. ⚠️ The one that actually matters — prove the scoping REFUSES, as a
--   --    real partner session, not as the service role (which bypasses RLS
--   --    entirely and will happily let all three of these through):
--   --      a) insert stamped with your own firm      -> succeeds
--   --      b) insert stamped with ANOTHER firm's id  -> must be REFUSED (42501)
--   --      c) insert with business_partner_id NULL   -> must be REFUSED (42501)
--   --      d) UPDATE any client                      -> must be REFUSED
--   --      e) DELETE any client                      -> must be REFUSED
--   --    (b) is the one worth being sure of: it is the whole security argument.
--
--   -- 4. Staff are unaffected:
--   --      as staff, insert a client with business_partner_id NULL -> succeeds
--
-- ROLLBACK
--   DROP POLICY IF EXISTS clients_partner_insert ON public.clients;
--   -- Non-lossy: no row is altered by this migration, and rows created under it
--   -- are ordinary client records that survive the policy going away. The only
--   -- effect of rolling back is that partner capture returns to failing with
--   -- 42501 — so hide the capture button from partners in the same change, or
--   -- the dead end comes back with it.
-- ============================================================================
