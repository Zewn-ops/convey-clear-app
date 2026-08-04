-- Migration 008: Seed users rows for demo client accounts
-- Run via VPS pooler: psql "postgresql://postgres.yhgriqagrhyblhmloctc:[PASSWORD]@aws-0-eu-west-1.pooler.supabase.com:5432/postgres?sslmode=require"
--
-- PURPOSE: Creates public.users rows for demo clients so Supabase Auth accounts
-- can be linked via the handle_new_user() trigger (matches by email on first signup).
--
-- After running this migration:
-- 1. Go to Supabase dashboard → Authentication → Users → Invite user (or Add user)
-- 2. Create an account with EXACTLY the email below
-- 3. The trigger auto-links auth_user_id on first login
-- 4. Client logs in → lands on /dashboard → sees Tony Stark's matters
--
-- NOTE: tony@starkindustries.co.za is the demo email. If you'd prefer to test
-- with a real inbox you control, change both the INSERT email here AND create
-- the Supabase auth account with that same email.

BEGIN;

-- ⚠️ REBUILD GUARD added 2026-08-04, when this migration broke the first
-- from-scratch rebuild (the staging project).
--
-- These INSERTs reference clients 1111…/2222… which were created BY HAND in the
-- dashboard on 2026-05-30, not by any migration. So this file was never
-- rebuild-safe: applied to an empty database it dies on fk_users_client_id.
-- The rows it seeds are dead demo data (Tony Stark / S.H.I.E.L.D., wiped from
-- production on 2026-07-28), so the right behaviour on a fresh database is to
-- skip, not to invent the missing clients.
--
-- Guarded rather than deleted: the file is a record of what ran on production.
--
-- Generalisable: a migration history is only proven to rebuild when someone
-- rebuilds from it. Until then it is a list of things that once worked in order.

DO $rebuild_guard$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.clients
                  WHERE id = '11111111-1111-1111-1111-111111111111') THEN
    RAISE NOTICE '008: demo clients absent (fresh database) - skipping demo user seed.';
    RETURN;
  END IF;


-- Tony Stark — natural person, COO Phase 2 demo client
INSERT INTO public.users (email, full_name, role, client_id, active)
VALUES (
  'tony@starkindustries.co.za',
  'Tony Stark',
  'client',
  '11111111-1111-1111-1111-111111111111',  -- clients.id for Tony Stark
  true
)
ON CONFLICT (email) DO UPDATE
  SET client_id = EXCLUDED.client_id,
      role = 'client',
      active = true;

-- S.H.I.E.L.D — business, COO Phase 1 demo client
INSERT INTO public.users (email, full_name, role, client_id, active)
VALUES (
  'legal@shield.co.za',
  'S.H.I.E.L.D (Pty) Ltd',
  'client',
  '22222222-2222-2222-2222-222222222222',  -- clients.id for S.H.I.E.L.D
  true
)
ON CONFLICT (email) DO UPDATE
  SET client_id = EXCLUDED.client_id,
      role = 'client',
      active = true;

END
$rebuild_guard$;

COMMIT;


-- Verify:
-- SELECT u.id, u.email, u.role, u.client_id, u.auth_user_id,
--        c.full_name, c.business_name
-- FROM public.users u
-- LEFT JOIN public.clients c ON c.id = u.client_id
-- WHERE u.role = 'client';