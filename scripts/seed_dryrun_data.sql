-- ============================================================================
-- ConveyClear — DRY-RUN SEED DATA (2026-06-19)
-- ============================================================================
-- PURPOSE: Populate the (wiped) live DB with one of each major artifact so the
--          full-feature dry run has something to click: a partner firm, a COO
--          partner-managed matter (buyer+seller parties), a BC matter, a PRC/RCF
--          matter, an enquiry thread, and a council POC linked to a matter.
--
-- RUN (VPS pooler — DB pw lives in /root/.supabase-backup.env, NOT here):
--   psql "postgresql://postgres.yhgriqagrhyblhmloctc:[PASSWORD]@aws-0-eu-west-1.pooler.supabase.com:5432/postgres?sslmode=require" -f seed_dryrun_data.sql
--   (or paste into Supabase Dashboard → SQL Editor)
--
-- SAFE TO RE-RUN: every row uses a fixed `dd000000-…` UUID (or a fixed email),
-- and the script DELETEs those first → idempotent. To remove ALL dry-run data,
-- run the "TEARDOWN" block at the bottom.
--
-- ⚠️ LOGINS ARE NOT SEEDED HERE (auth.users is owned by Supabase). This seeds the
-- public.users PROFILE rows for a test client + test partner. To get working
-- logins: Supabase → Authentication → Users → Add user, with the EXACT emails
-- below + a password + "Auto confirm". The handle_new_user() trigger links
-- auth_user_id on first sign-in and PRESERVES the seeded role. Swap the emails
-- to inboxes YOU control if you want to test password-reset / invite emails.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 0. Clean any prior run of this seed (FK-safe order)
-- ----------------------------------------------------------------------------
DELETE FROM public.matter_council_pocs WHERE matter_id::text   LIKE 'dd000000-%';
DELETE FROM public.council_pocs        WHERE id::text          LIKE 'dd000000-%';
DELETE FROM public.enquiry_messages    WHERE enquiry_id::text  LIKE 'dd000000-%';
DELETE FROM public.enquiries           WHERE id::text          LIKE 'dd000000-%';
DELETE FROM public.matter_parties      WHERE id::text          LIKE 'dd000000-%';
DELETE FROM public.matters             WHERE id::text          LIKE 'dd000000-%';
DELETE FROM public.clients             WHERE id::text          LIKE 'dd000000-%';
DELETE FROM public.business_partners   WHERE id::text          LIKE 'dd000000-%';
-- (client/partner PROFILE rows are upserted by email below, not deleted, so a
--  linked auth_user_id survives a re-run.)

-- ----------------------------------------------------------------------------
-- 1. Partner firm (the COO matter is managed by this firm; no client login)
-- ----------------------------------------------------------------------------
INSERT INTO public.business_partners (id, name, partner_type, primary_email, primary_cell, physical_address, active)
VALUES (
  'dd000000-0000-0000-0000-000000000f01',
  'Sterling & Hayes Attorneys',
  'law_firm',
  'reception@sterlinghayes.co.za',
  '+27 12 555 0101',
  '14 Hatfield Square, Pretoria, 0083',
  true
);

-- ----------------------------------------------------------------------------
-- 2. Clients (for the BC + PRC matters that DO have a client account)
-- ----------------------------------------------------------------------------
-- Client A — natural person, owns the BC matter
INSERT INTO public.clients (id, entity_type, full_name, id_number, primary_email, primary_cell, physical_address)
VALUES (
  'dd000000-0000-0000-0000-0000000c0001',
  'natural_person',
  'Thabo Molefe',
  '8503125012083',
  'dryrun.client@example.com',
  '+27 82 555 0102',
  'Shop 5, Brooklyn Mall, Pretoria, 0181'
);

-- Client B — trust, owns the PRC/RCF matter
INSERT INTO public.clients (id, entity_type, business_name, registration_no, primary_email, primary_cell, physical_address)
VALUES (
  'dd000000-0000-0000-0000-0000000c0002',
  'trust',
  'Khumalo Family Trust',
  'IT001234/2020',
  'trustees@khumalotrust.co.za',
  '+27 83 555 0103',
  'Erf 88, Menlo Park, Pretoria, 0081'
);

-- ----------------------------------------------------------------------------
-- 3. Test LOGIN profiles (create matching Supabase Auth users to activate — see header)
-- ----------------------------------------------------------------------------
-- Client login → sees Client A's BC matter on /dashboard
INSERT INTO public.users (email, full_name, role, client_id, active)
VALUES ('dryrun.client@example.com', 'Thabo Molefe', 'client',
        'dd000000-0000-0000-0000-0000000c0001', true)
ON CONFLICT (email) DO UPDATE
  SET client_id = EXCLUDED.client_id, role = 'client', active = true;

-- Partner login → sees Sterling & Hayes' COO matter on /partner
INSERT INTO public.users (email, full_name, role, business_partner_id, active)
VALUES ('dryrun.partner@sterlinghayes.co.za', 'Sarah Hayes', 'business_partner',
        'dd000000-0000-0000-0000-000000000f01', true)
ON CONFLICT (email) DO UPDATE
  SET business_partner_id = EXCLUDED.business_partner_id, role = 'business_partner', active = true;

-- ----------------------------------------------------------------------------
-- 4. Matters — one COO (partner-managed), one BC, one PRC/RCF
-- ----------------------------------------------------------------------------
-- COO: partner-managed, NO client account; buyer/seller live in matter_parties.
INSERT INTO public.matters
  (id, client_id, business_partner_id, service_id, title, municipality,
   current_stage, current_phase, status, priority, partner_file_ref, deadline)
VALUES (
  'dd000000-0000-0000-0000-00000000d001',
  NULL,
  'dd000000-0000-0000-0000-000000000f01',
  (SELECT id FROM public.services WHERE code = 'COO'),
  'COT_COO_VELA HOLDINGS_ERF 1234 WATERKLOOF',
  'COT',
  'docs_pending', '2', 'open', 'standard',
  'SH-2026-0417',
  (now() + interval '21 days')::date
);

-- BC: client-owned, fresh referral awaiting review.
INSERT INTO public.matters
  (id, client_id, service_id, title, municipality, service_notes,
   current_stage, current_phase, status, priority, deadline)
VALUES (
  'dd000000-0000-0000-0000-00000000d002',
  'dd000000-0000-0000-0000-0000000c0001',
  (SELECT id FROM public.services WHERE code = 'BC'),
  'COT_BC_THABO MOLEFE_SHOP 5 BROOKLYN MALL',
  'COT',
  'Trading Licence (TL) — restaurant',
  'inquiry', '1', 'new', 'standard',
  (now() + interval '30 days')::date
);

-- PRC / RCF: client-owned trust, in initiation.
INSERT INTO public.matters
  (id, client_id, service_id, title, municipality,
   service_subtype, service_data,
   current_stage, current_phase, status, priority, deadline)
VALUES (
  'dd000000-0000-0000-0000-00000000d003',
  'dd000000-0000-0000-0000-0000000c0002',
  (SELECT id FROM public.services WHERE code = 'RCF'),
  'COJ_RCF_KHUMALO FAMILY TRUST_ERF 88 MENLO PARK',
  'COJ',
  'RCF',
  '{"rates_account_no":"4001234567","query_ref":"COJ-RC-99812","property":"ERF 88 MENLO PARK"}'::jsonb,
  'initiation', '1', 'open', 'priority',
  (now() + interval '14 days')::date
);

-- ----------------------------------------------------------------------------
-- 5. COO parties — seller (shown first) + buyer, under the one COO matter
-- ----------------------------------------------------------------------------
-- Seller (natural person): account closure + deposit refund side
INSERT INTO public.matter_parties
  (id, matter_id, role, entity_type, full_name, id_number, email, cell, physical_address, notes)
VALUES (
  'dd000000-0000-0000-0000-0000000a0001',
  'dd000000-0000-0000-0000-00000000d001',
  'seller', 'natural_person',
  'Pieter van der Merwe', '7208155034082',
  'pieter.vdm@example.com', '+27 82 555 0201',
  'Erf 1234, Waterkloof, Pretoria, 0181',
  'Seller — Open Rates Account closure. Refund handled by partner.'
);

-- Buyer (business, with contact person): open-rates-account side
INSERT INTO public.matter_parties
  (id, matter_id, role, entity_type, business_name, registration_no,
   contact_name, contact_email, contact_cell, physical_address)
VALUES (
  'dd000000-0000-0000-0000-0000000a0002',
  'dd000000-0000-0000-0000-00000000d001',
  'buyer', 'business',
  'Vela Holdings (Pty) Ltd', '2021/445566/07',
  'Lerato Nkosi', 'lerato@velaholdings.co.za', '+27 83 555 0202',
  'Erf 1234, Waterkloof, Pretoria, 0181'
);

-- ----------------------------------------------------------------------------
-- 6. Enquiry thread (partner → ConveyClear, linked to the COO matter)
-- ----------------------------------------------------------------------------
INSERT INTO public.enquiries
  (id, business_partner_id, matter_id, created_by, subject, message, status)
VALUES (
  'dd000000-0000-0000-0000-0000000e0001',
  'dd000000-0000-0000-0000-000000000f01',
  'dd000000-0000-0000-0000-00000000d001',
  (SELECT id FROM public.users WHERE email = 'dryrun.partner@sterlinghayes.co.za'),
  'Timeline for Erf 1234 Waterkloof clearance',
  'Hi team — could you confirm the expected turnaround on the rates clearance figures for the Waterkloof transfer? Registration is targeted for month-end.',
  'open'
);

INSERT INTO public.enquiry_messages (id, enquiry_id, author_id, author_label, body)
VALUES (
  'dd000000-0000-0000-0000-0000000e0011',
  'dd000000-0000-0000-0000-0000000e0001',
  (SELECT id FROM public.users WHERE email = 'dryrun.partner@sterlinghayes.co.za'),
  'Sterling & Hayes Attorneys',
  'Hi team — could you confirm the expected turnaround on the rates clearance figures for the Waterkloof transfer? Registration is targeted for month-end.'
);

-- ----------------------------------------------------------------------------
-- 7. Council POC (internal, staff-only) + link to the COO matter
-- ----------------------------------------------------------------------------
INSERT INTO public.council_pocs
  (id, first_name, last_name, email, cell, council, department, notes)
VALUES (
  'dd000000-0000-0000-0000-0000000c0c01',
  'Nomsa', 'Dlamini',
  'n.dlamini@tshwane.gov.za', '+27 12 358 0000',
  'COT', 'Rates & Taxes — Clearance Certificates',
  'Best reached mornings. Escalation contact for s118 figures.'
);

INSERT INTO public.matter_council_pocs (id, matter_id, council_poc_id)
VALUES (
  'dd000000-0000-0000-0000-0000000c0c11',
  'dd000000-0000-0000-0000-00000000d001',
  'dd000000-0000-0000-0000-0000000c0c01'
);

COMMIT;

-- ============================================================================
-- VERIFY
-- ============================================================================
SELECT 'business_partners' AS t, count(*) FROM public.business_partners WHERE id::text LIKE 'dd000000-%'
UNION ALL SELECT 'clients',        count(*) FROM public.clients          WHERE id::text LIKE 'dd000000-%'
UNION ALL SELECT 'matters',        count(*) FROM public.matters          WHERE id::text LIKE 'dd000000-%'
UNION ALL SELECT 'matter_parties', count(*) FROM public.matter_parties   WHERE id::text LIKE 'dd000000-%'
UNION ALL SELECT 'enquiries',      count(*) FROM public.enquiries         WHERE id::text LIKE 'dd000000-%'
UNION ALL SELECT 'council_pocs',   count(*) FROM public.council_pocs      WHERE id::text LIKE 'dd000000-%'
UNION ALL SELECT 'users(dryrun)',  count(*) FROM public.users WHERE email IN ('dryrun.client@example.com','dryrun.partner@sterlinghayes.co.za');

-- ============================================================================
-- TEARDOWN (run to wipe ALL dry-run data — uncomment + run as one block)
-- ============================================================================
-- BEGIN;
-- DELETE FROM public.matter_council_pocs WHERE matter_id::text  LIKE 'dd000000-%';
-- DELETE FROM public.council_pocs        WHERE id::text         LIKE 'dd000000-%';
-- DELETE FROM public.enquiry_messages    WHERE enquiry_id::text LIKE 'dd000000-%';
-- DELETE FROM public.enquiries           WHERE id::text         LIKE 'dd000000-%';
-- DELETE FROM public.matter_parties      WHERE id::text         LIKE 'dd000000-%';
-- DELETE FROM public.matters             WHERE id::text         LIKE 'dd000000-%';
-- DELETE FROM public.clients             WHERE id::text         LIKE 'dd000000-%';
-- DELETE FROM public.business_partners   WHERE id::text         LIKE 'dd000000-%';
-- DELETE FROM public.users WHERE email IN ('dryrun.client@example.com','dryrun.partner@sterlinghayes.co.za');
-- COMMIT;
