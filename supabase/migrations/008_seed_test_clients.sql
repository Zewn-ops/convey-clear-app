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

COMMIT;

-- Verify:
-- SELECT u.id, u.email, u.role, u.client_id, u.auth_user_id,
--        c.full_name, c.business_name
-- FROM public.users u
-- LEFT JOIN public.clients c ON c.id = u.client_id
-- WHERE u.role = 'client';
