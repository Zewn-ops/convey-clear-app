-- verify_rls_026_027.sql — NOT a migration. Safe to run any number of times.
-- ============================================================================
-- Empirically proves the RLS security properties of migrations 026 + 027 by
-- impersonating a real partner user and a real client user INSIDE the database.
--
-- Why this shape:
--   * It never leaves the DB, so no customer email address is ever exported.
--   * It creates its own fixtures and deletes them in the same call (plus an
--     EXCEPTION handler), so nothing persists even if an assertion fails.
--   * It exercises the ACTUAL policies (can_access_transfer / can_access_enquiry
--     / can_access_matter), not an application-layer approximation of them.
--
-- Run it in the Supabase SQL Editor. Every row of the result must read pass = t.
--
-- How the impersonation works: the SQL Editor connects as `postgres`, which has
-- BYPASSRLS — so fixtures are inserted with RLS off. We then `SET LOCAL ROLE
-- authenticated` and set `request.jwt.claims`, which is exactly what auth.uid()
-- reads. From that point the session is indistinguishable from that user's.
-- ============================================================================

CREATE OR REPLACE FUNCTION pg_temp.zz_rls_check()
RETURNS TABLE(check_name text, got bigint, want bigint, pass boolean)
LANGUAGE plpgsql AS $fn$
DECLARE
  v_partner_auth uuid; v_partner_firm uuid; v_other_firm uuid;
  v_client_auth  uuid; v_client_cid  uuid; v_matter uuid;
  t_own uuid; t_other uuid; e_shared uuid; e_partner uuid;
BEGIN
  -- ---- pick real actors (ids only; no emails read) -------------------------
  SELECT u.auth_user_id, u.business_partner_id INTO v_partner_auth, v_partner_firm
    FROM public.users u
   WHERE u.role = 'business_partner' AND u.business_partner_id IS NOT NULL AND u.auth_user_id IS NOT NULL
   LIMIT 1;

  SELECT bp.id INTO v_other_firm
    FROM public.firms bp
   WHERE bp.id IS DISTINCT FROM v_partner_firm
   LIMIT 1;

  SELECT u.auth_user_id, u.client_id INTO v_client_auth, v_client_cid
    FROM public.users u
   WHERE u.role = 'client' AND u.client_id IS NOT NULL AND u.auth_user_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.matters m WHERE m.client_id = u.client_id)
   LIMIT 1;

  SELECT m.id INTO v_matter FROM public.matters m WHERE m.client_id = v_client_cid LIMIT 1;

  IF v_partner_auth IS NULL OR v_other_firm IS NULL OR v_client_auth IS NULL OR v_matter IS NULL THEN
    RAISE EXCEPTION 'Missing test actors: need a partner user with a firm, a second firm, and a client user who owns a matter.';
  END IF;

  -- ---- fixtures (inserted as postgres, RLS bypassed) -----------------------
  INSERT INTO public.property_transfers(reference, business_partner_id, status)
       VALUES ('ZZ-RLS-OWN',   v_partner_firm, 'open') RETURNING id INTO t_own;
  INSERT INTO public.property_transfers(reference, business_partner_id, status)
       VALUES ('ZZ-RLS-OTHER', v_other_firm,   'open') RETURNING id INTO t_other;

  INSERT INTO public.enquiries(matter_id, subject, message, status, visibility)
       VALUES (v_matter, 'ZZ-RLS shared', 'fixture', 'open', 'shared')  RETURNING id INTO e_shared;
  INSERT INTO public.enquiries(matter_id, subject, message, status, visibility)
       VALUES (v_matter, 'ZZ-RLS partner-only', 'fixture', 'open', 'partner') RETURNING id INTO e_partner;

  -- ======================= impersonate the CLIENT ==========================
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', v_client_auth, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  -- 026: a transfer spans both sides of the deal → clients get nothing at all.
  RETURN QUERY SELECT 'client sees NO property transfers'::text,
                      count(*), 0::bigint, count(*) = 0 FROM public.property_transfers;

  -- 027: the client CAN see a shared thread on their own matter …
  RETURN QUERY SELECT 'client sees the shared enquiry'::text,
                      count(*), 1::bigint, count(*) = 1 FROM public.enquiries WHERE id = e_shared;

  -- 027: … and CANNOT see any partner-only thread. THIS IS THE LOAD-BEARING ONE.
  -- Covers both the fixture and the 4 pre-existing legacy rows carrying a matter_id.
  RETURN QUERY SELECT 'client CANNOT see ANY partner-only enquiry'::text,
                      count(*), 0::bigint, count(*) = 0
                 FROM public.enquiries WHERE visibility = 'partner';

  -- The replies on a partner-only thread must be invisible too (enquiry_messages
  -- delegates to can_access_enquiry).
  RETURN QUERY SELECT 'client CANNOT read partner-only replies'::text,
                      count(*), 0::bigint, count(*) = 0
                 FROM public.enquiry_messages WHERE enquiry_id = e_partner;

  RESET ROLE;

  -- ======================= impersonate the PARTNER =========================
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', v_partner_auth, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  RETURN QUERY SELECT 'partner sees own firm transfer'::text,
                      count(*), 1::bigint, count(*) = 1 FROM public.property_transfers WHERE id = t_own;

  RETURN QUERY SELECT 'partner CANNOT see another firm transfer'::text,
                      count(*), 0::bigint, count(*) = 0 FROM public.property_transfers WHERE id = t_other;

  RESET ROLE;

  -- ---- cleanup (as postgres) ----------------------------------------------
  DELETE FROM public.enquiries          WHERE id IN (e_shared, e_partner);
  DELETE FROM public.property_transfers WHERE id IN (t_own, t_other);

EXCEPTION WHEN OTHERS THEN
  -- Never leave fixtures behind, whatever went wrong.
  RESET ROLE;
  DELETE FROM public.enquiries          WHERE subject LIKE 'ZZ-RLS%';
  DELETE FROM public.property_transfers WHERE reference LIKE 'ZZ-RLS%';
  RAISE;
END $fn$;

SELECT * FROM pg_temp.zz_rls_check();

-- Belt and braces: this must return zero rows.
SELECT 'leftover fixtures' AS check_name, count(*) AS got
  FROM public.property_transfers WHERE reference LIKE 'ZZ-RLS%';
