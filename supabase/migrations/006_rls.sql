-- ============================================================================
-- ConveyClear — Migration 006: Row-Level Security (closes the P0 hole)
-- ============================================================================
-- Created: 2026-05-29 (Day 10). 32-day plan Week 1 Day 4 work.
-- Target:  Supabase project yhgriqagrhyblhmloctc (eu-west-1)
--
-- WHY: Audit 2026-05-29 found RLS off on all 22 tables AND anon/authenticated
-- holding ALL (incl. DELETE/TRUNCATE) on sensitive tables → DB open via the
-- public anon key. See SECURITY.md §0. This migration:
--   1. Revokes table privileges from `anon` (no public API surface — the public
--      onboarding flow goes through n8n, which uses its own DB connection).
--   2. Revokes TRUNCATE (RLS-BYPASSING) from authenticated everywhere.
--   3. Enables RLS on all 22 tables (default-deny).
--   4. Adds role-scoped policies via SECURITY DEFINER helper functions.
--
-- BYPASS NOTES: `postgres` (n8n's direct connection) and `service_role`
-- (Next.js server-side) BYPASS RLS — so n8n + server admin queries are
-- unaffected. RLS only constrains anon + authenticated (browser) sessions.
--
-- WRITE MODEL (intentional, least-privilege): non-staff get READ scoping +
-- the ability to POST to the activity feed on matters they can access. All
-- other writes are staff / service-role / n8n. Direct client uploads can be
-- granted later when the portal upload feature is built.
--
-- Idempotent: DROP POLICY IF EXISTS before each CREATE; ENABLE RLS is a no-op
-- if already on. Safe to re-run.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 0. Grant lockdown
-- ----------------------------------------------------------------------------
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
-- TRUNCATE is NOT governed by RLS row policies — must be revoked explicitly.
REVOKE TRUNCATE, TRIGGER, REFERENCES ON ALL TABLES IN SCHEMA public FROM authenticated;
-- Future tables created in public: deny anon by default.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;

-- ----------------------------------------------------------------------------
-- 1. Helper functions (SECURITY DEFINER → read users bypassing RLS; no recursion)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.app_current_user_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT id FROM public.users WHERE auth_user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.app_user_role()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT role FROM public.users WHERE auth_user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.app_user_client_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT client_id FROM public.users WHERE auth_user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.app_user_partner_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT business_partner_id FROM public.users WHERE auth_user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.app_is_staff()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT COALESCE(
    (SELECT role IN ('admin','staff_services','staff_ops','staff_delivery')
       FROM public.users WHERE auth_user_id = auth.uid()),
    false);
$$;

CREATE OR REPLACE FUNCTION public.app_is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT COALESCE(
    (SELECT role = 'admin' FROM public.users WHERE auth_user_id = auth.uid()),
    false);
$$;

-- Can the current user see this client? (staff | own client | their partner's client)
CREATE OR REPLACE FUNCTION public.can_access_client(c_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT app_is_staff()
      OR (c_id IS NOT NULL AND c_id = app_user_client_id())
      OR (app_user_partner_id() IS NOT NULL
          AND EXISTS (SELECT 1 FROM public.clients c
                      WHERE c.id = c_id AND c.business_partner_id = app_user_partner_id()));
$$;

-- Can the current user see this matter? (staff | own | partner's client | council-subscribed)
CREATE OR REPLACE FUNCTION public.can_access_matter(m_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT app_is_staff()
      OR EXISTS (
           SELECT 1 FROM public.matters m WHERE m.id = m_id AND (
               m.client_id = app_user_client_id()
            OR (app_user_partner_id() IS NOT NULL
                AND m.client_id IN (SELECT id FROM public.clients
                                    WHERE business_partner_id = app_user_partner_id()))
           ))
      OR EXISTS (SELECT 1 FROM public.matter_subscribers s
                 WHERE s.matter_id = m_id AND s.user_id = app_current_user_id());
$$;

-- ----------------------------------------------------------------------------
-- 2. Enable RLS on all 22 tables (default-deny)
-- ----------------------------------------------------------------------------
ALTER TABLE public.clients              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matters              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.power_of_attorneys   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matter_activities    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matter_subscribers   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matter_stages        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_requests    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.communications       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_labels       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.properties           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_links     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_partners    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.council_email_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.municipalities       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_types       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_templates      ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 3. Policies
--    Convention: <table>_staff_all = staff full CRUD; <table>_read_* = scoped read.
--    All policies target the `authenticated` role (anon has no grants).
-- ----------------------------------------------------------------------------

-- helper macro-ish: every table gets a staff_all policy
-- (written out explicitly per table for clarity)

-- clients -------------------------------------------------------------------
DROP POLICY IF EXISTS clients_staff_all ON public.clients;
CREATE POLICY clients_staff_all ON public.clients FOR ALL TO authenticated
  USING (app_is_staff()) WITH CHECK (app_is_staff());
DROP POLICY IF EXISTS clients_read_scoped ON public.clients;
CREATE POLICY clients_read_scoped ON public.clients FOR SELECT TO authenticated
  USING (can_access_client(id));

-- matters -------------------------------------------------------------------
DROP POLICY IF EXISTS matters_staff_all ON public.matters;
CREATE POLICY matters_staff_all ON public.matters FOR ALL TO authenticated
  USING (app_is_staff()) WITH CHECK (app_is_staff());
DROP POLICY IF EXISTS matters_read_scoped ON public.matters;
CREATE POLICY matters_read_scoped ON public.matters FOR SELECT TO authenticated
  USING (can_access_matter(id));

-- documents -----------------------------------------------------------------
DROP POLICY IF EXISTS documents_staff_all ON public.documents;
CREATE POLICY documents_staff_all ON public.documents FOR ALL TO authenticated
  USING (app_is_staff()) WITH CHECK (app_is_staff());
DROP POLICY IF EXISTS documents_read_scoped ON public.documents;
CREATE POLICY documents_read_scoped ON public.documents FOR SELECT TO authenticated
  USING (can_access_matter(matter_id));

-- power_of_attorneys --------------------------------------------------------
DROP POLICY IF EXISTS poa_staff_all ON public.power_of_attorneys;
CREATE POLICY poa_staff_all ON public.power_of_attorneys FOR ALL TO authenticated
  USING (app_is_staff()) WITH CHECK (app_is_staff());
DROP POLICY IF EXISTS poa_read_scoped ON public.power_of_attorneys;
CREATE POLICY poa_read_scoped ON public.power_of_attorneys FOR SELECT TO authenticated
  USING (can_access_client(client_id) OR (matter_id IS NOT NULL AND can_access_matter(matter_id)));

-- invoices ------------------------------------------------------------------
DROP POLICY IF EXISTS invoices_staff_all ON public.invoices;
CREATE POLICY invoices_staff_all ON public.invoices FOR ALL TO authenticated
  USING (app_is_staff()) WITH CHECK (app_is_staff());
DROP POLICY IF EXISTS invoices_read_scoped ON public.invoices;
CREATE POLICY invoices_read_scoped ON public.invoices FOR SELECT TO authenticated
  USING (can_access_matter(matter_id));

-- matter_activities (activity feed) -----------------------------------------
DROP POLICY IF EXISTS activities_staff_all ON public.matter_activities;
CREATE POLICY activities_staff_all ON public.matter_activities FOR ALL TO authenticated
  USING (app_is_staff()) WITH CHECK (app_is_staff());
DROP POLICY IF EXISTS activities_read_scoped ON public.matter_activities;
CREATE POLICY activities_read_scoped ON public.matter_activities FOR SELECT TO authenticated
  USING (can_access_matter(matter_id));
-- non-staff may POST to a matter they can access (their own authored 'post')
DROP POLICY IF EXISTS activities_post ON public.matter_activities;
CREATE POLICY activities_post ON public.matter_activities FOR INSERT TO authenticated
  WITH CHECK (can_access_matter(matter_id)
              AND author_id = app_current_user_id()
              AND activity_type = 'post');

-- matter_subscribers --------------------------------------------------------
DROP POLICY IF EXISTS subscribers_staff_all ON public.matter_subscribers;
CREATE POLICY subscribers_staff_all ON public.matter_subscribers FOR ALL TO authenticated
  USING (app_is_staff()) WITH CHECK (app_is_staff());
DROP POLICY IF EXISTS subscribers_self ON public.matter_subscribers;
CREATE POLICY subscribers_self ON public.matter_subscribers FOR SELECT TO authenticated
  USING (user_id = app_current_user_id());

-- matter_stages (read for matter viewers) -----------------------------------
DROP POLICY IF EXISTS stages_staff_all ON public.matter_stages;
CREATE POLICY stages_staff_all ON public.matter_stages FOR ALL TO authenticated
  USING (app_is_staff()) WITH CHECK (app_is_staff());
DROP POLICY IF EXISTS stages_read_scoped ON public.matter_stages;
CREATE POLICY stages_read_scoped ON public.matter_stages FOR SELECT TO authenticated
  USING (can_access_matter(matter_id));

-- document_requests ---------------------------------------------------------
DROP POLICY IF EXISTS docreq_staff_all ON public.document_requests;
CREATE POLICY docreq_staff_all ON public.document_requests FOR ALL TO authenticated
  USING (app_is_staff()) WITH CHECK (app_is_staff());
DROP POLICY IF EXISTS docreq_read_scoped ON public.document_requests;
CREATE POLICY docreq_read_scoped ON public.document_requests FOR SELECT TO authenticated
  USING (can_access_matter(matter_id));

-- contacts ------------------------------------------------------------------
DROP POLICY IF EXISTS contacts_staff_all ON public.contacts;
CREATE POLICY contacts_staff_all ON public.contacts FOR ALL TO authenticated
  USING (app_is_staff()) WITH CHECK (app_is_staff());
DROP POLICY IF EXISTS contacts_read_scoped ON public.contacts;
CREATE POLICY contacts_read_scoped ON public.contacts FOR SELECT TO authenticated
  USING (can_access_client(client_id));

-- properties (visible if on a matter you can access) ------------------------
DROP POLICY IF EXISTS properties_staff_all ON public.properties;
CREATE POLICY properties_staff_all ON public.properties FOR ALL TO authenticated
  USING (app_is_staff()) WITH CHECK (app_is_staff());
DROP POLICY IF EXISTS properties_read_scoped ON public.properties;
CREATE POLICY properties_read_scoped ON public.properties FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.matters m
                 WHERE m.property_id = properties.id AND can_access_matter(m.id)));

-- business_partners (partner sees own org; staff all) -----------------------
DROP POLICY IF EXISTS partners_staff_all ON public.business_partners;
CREATE POLICY partners_staff_all ON public.business_partners FOR ALL TO authenticated
  USING (app_is_staff()) WITH CHECK (app_is_staff());
DROP POLICY IF EXISTS partners_self ON public.business_partners;
CREATE POLICY partners_self ON public.business_partners FOR SELECT TO authenticated
  USING (id = app_user_partner_id());

-- users (own row read; staff read all; admin writes) ------------------------
DROP POLICY IF EXISTS users_self_read ON public.users;
CREATE POLICY users_self_read ON public.users FOR SELECT TO authenticated
  USING (auth_user_id = auth.uid() OR app_is_staff());
DROP POLICY IF EXISTS users_admin_all ON public.users;
CREATE POLICY users_admin_all ON public.users FOR ALL TO authenticated
  USING (app_is_admin()) WITH CHECK (app_is_admin());

-- Staff-only tables (no non-staff access at all) ----------------------------
-- tasks, communications, contact_labels, onboarding_links, council_email_routes
DROP POLICY IF EXISTS tasks_staff_all ON public.tasks;
CREATE POLICY tasks_staff_all ON public.tasks FOR ALL TO authenticated
  USING (app_is_staff()) WITH CHECK (app_is_staff());

DROP POLICY IF EXISTS comms_staff_all ON public.communications;
CREATE POLICY comms_staff_all ON public.communications FOR ALL TO authenticated
  USING (app_is_staff()) WITH CHECK (app_is_staff());

DROP POLICY IF EXISTS contactlabels_staff_all ON public.contact_labels;
CREATE POLICY contactlabels_staff_all ON public.contact_labels FOR ALL TO authenticated
  USING (app_is_staff()) WITH CHECK (app_is_staff());

DROP POLICY IF EXISTS onboardlinks_staff_all ON public.onboarding_links;
CREATE POLICY onboardlinks_staff_all ON public.onboarding_links FOR ALL TO authenticated
  USING (app_is_staff()) WITH CHECK (app_is_staff());

DROP POLICY IF EXISTS councilroutes_staff_all ON public.council_email_routes;
CREATE POLICY councilroutes_staff_all ON public.council_email_routes FOR ALL TO authenticated
  USING (app_is_staff()) WITH CHECK (app_is_staff());

-- Reference/config: read for any authenticated user; writes staff-only -------
-- services
DROP POLICY IF EXISTS services_read ON public.services;
CREATE POLICY services_read ON public.services FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS services_staff_write ON public.services;
CREATE POLICY services_staff_write ON public.services FOR ALL TO authenticated
  USING (app_is_staff()) WITH CHECK (app_is_staff());
-- municipalities
DROP POLICY IF EXISTS munis_read ON public.municipalities;
CREATE POLICY munis_read ON public.municipalities FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS munis_staff_write ON public.municipalities;
CREATE POLICY munis_staff_write ON public.municipalities FOR ALL TO authenticated
  USING (app_is_staff()) WITH CHECK (app_is_staff());
-- document_types
DROP POLICY IF EXISTS doctypes_read ON public.document_types;
CREATE POLICY doctypes_read ON public.document_types FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS doctypes_staff_write ON public.document_types;
CREATE POLICY doctypes_staff_write ON public.document_types FOR ALL TO authenticated
  USING (app_is_staff()) WITH CHECK (app_is_staff());
-- email_templates: staff-only (may contain internal content)
DROP POLICY IF EXISTS emailtpl_staff_all ON public.email_templates;
CREATE POLICY emailtpl_staff_all ON public.email_templates FOR ALL TO authenticated
  USING (app_is_staff()) WITH CHECK (app_is_staff());

COMMIT;

-- ============================================================================
-- 4. Verification
-- ============================================================================
-- Expect: all 22 tables rls_enabled = t
SELECT count(*) FILTER (WHERE relrowsecurity) AS rls_on,
       count(*)                               AS total_tables
FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind='r';

-- Expect: anon has NO privileges on sensitive tables (0 rows)
SELECT grantee, table_name FROM information_schema.role_table_grants
WHERE table_schema='public' AND grantee='anon'
  AND table_name IN ('clients','documents','matters','power_of_attorneys','users');

-- Expect: authenticated has NO TRUNCATE anywhere (0 rows)
SELECT count(*) AS authenticated_truncate_grants
FROM information_schema.role_table_grants
WHERE table_schema='public' AND grantee='authenticated' AND privilege_type='TRUNCATE';

-- Policy count by table
SELECT tablename, count(*) AS policies FROM pg_policies
WHERE schemaname='public' GROUP BY tablename ORDER BY tablename;
