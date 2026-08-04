-- ============================================================================
-- STAGING ONLY — extra fixtures on top of seed_dryrun_data.sql
-- ============================================================================
-- Two jobs the base seed does not do:
--
--   1. Give the firm CLIENTS. The base seed's COO matter has no client_id, so
--      a partner impersonation test shows "clients visible: 0" and the
--      firm -> client RLS path is never actually exercised. That is precisely
--      the path P1's membership change rewrites, so it needs a fixture.
--
--   2. Spread matters across PHASES and AGES, so the redesigned cards have
--      something to render: a progress bar stuck at one value and a single
--      "open 0 workdays" chip proves nothing about the design.
--
-- ⚠️ NEVER run against production. Every row uses a fixed ee000000-… UUID and
-- is deleted first, so it is idempotent and removable.
--
--   ./scripts/staging-bootstrap.sh extra
-- ============================================================================

BEGIN;

DELETE FROM public.matters WHERE id::text LIKE 'ee000000%';
DELETE FROM public.clients WHERE id::text LIKE 'ee000000%';

-- Clients that belong to the firm, which is what makes the partner portal
-- non-empty and what the RLS test needs.
INSERT INTO public.clients (id, entity_type, full_name, business_name, primary_email, business_partner_id)
SELECT 'ee000000-0000-0000-0000-00000000c001', 'natural_person', 'Pieter van Wyk', NULL,
       'pieter.vanwyk@example.co.za', f.id FROM public.firms f LIMIT 1;
INSERT INTO public.clients (id, entity_type, full_name, business_name, primary_email, business_partner_id)
SELECT 'ee000000-0000-0000-0000-00000000c002', 'business', NULL, 'Brookfield Props (Pty) Ltd',
       'admin@brookfieldprops.co.za', f.id FROM public.firms f LIMIT 1;
INSERT INTO public.clients (id, entity_type, full_name, business_name, primary_email, business_partner_id)
SELECT 'ee000000-0000-0000-0000-00000000c003', 'trust', NULL, 'Van Wyk Family Trust',
       'trust@vanwyk.co.za', f.id FROM public.firms f LIMIT 1;

-- Matters spread across the COO pipeline and across time, so the phase bar,
-- the workdays chip and the amber "stalled" threshold all have live cases.
-- created_at is backdated deliberately: workdaysSince() is the whole point.
INSERT INTO public.matters
  (id, client_id, service_id, business_partner_id, title, status, current_phase, municipality, created_at)
SELECT v.id, v.client_id, s.id, f.id, v.title, v.status, v.phase, v.muni, v.created
FROM (VALUES
  ('ee000000-0000-0000-0000-00000000a001'::uuid,'ee000000-0000-0000-0000-00000000c001'::uuid,
   'COT_COO_PIETER VAN WYK_ERF 445 LYNNWOOD','open','new_instruction','COT', now() - interval '3 days'),
  ('ee000000-0000-0000-0000-00000000a002'::uuid,'ee000000-0000-0000-0000-00000000c002'::uuid,
   'COT_COO_BROOKFIELD PROPS_ERF 12 HATFIELD','open','onboarding','COT', now() - interval '26 days'),
  ('ee000000-0000-0000-0000-00000000a003'::uuid,'ee000000-0000-0000-0000-00000000c003'::uuid,
   'COJ_COO_VAN WYK FAMILY TRUST_ERF 903 PARKVIEW','open','operations','COJ', now() - interval '119 days'),
  ('ee000000-0000-0000-0000-00000000a004'::uuid,'ee000000-0000-0000-0000-00000000c001'::uuid,
   'COT_COO_PIETER VAN WYK_ERF 77 GARSFONTEIN','on_hold','operations','COT', now() - interval '64 days'),
  ('ee000000-0000-0000-0000-00000000a005'::uuid,'ee000000-0000-0000-0000-00000000c002'::uuid,
   'COE_COO_BROOKFIELD PROPS_ERF 5 BEDFORDVIEW','won','successful','COE', now() - interval '201 days')
) AS v(id, client_id, title, status, phase, muni, created)
CROSS JOIN LATERAL (SELECT id FROM public.services WHERE code='COO' LIMIT 1) s
CROSS JOIN LATERAL (SELECT id FROM public.firms LIMIT 1) f;

-- Activity, so the "last update" chip is not permanently blank.
INSERT INTO public.matter_activities (matter_id, activity_type, author_label, body, created_at)
SELECT m.id, 'post', 'ConveyClear',
       'Rates figures requested from the municipality.', m.created_at + interval '2 days'
  FROM public.matters m WHERE m.id::text LIKE 'ee000000%';
INSERT INTO public.matter_activities (matter_id, activity_type, author_label, body, created_at)
SELECT m.id, 'post', 'ConveyClear',
       'Following up with the council on outstanding figures.', now() - interval '5 days'
  FROM public.matters m WHERE m.id::text LIKE 'ee000000%' AND m.status = 'open';

COMMIT;

-- ============================================================================
-- VERIFY
--   SELECT current_phase, status, count(*) FROM matters
--    WHERE id::text LIKE 'ee000000%' GROUP BY 1,2 ORDER BY 1;
--
-- TEARDOWN
--   DELETE FROM matters WHERE id::text LIKE 'ee000000%';
--   DELETE FROM clients WHERE id::text LIKE 'ee000000%';
-- ============================================================================
