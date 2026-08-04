-- ============================================================================
-- ConveyClear — Migration 005: Supabase Auth wiring + Business Partner model
-- ============================================================================
-- Created: 2026-05-29 (Day 10) — 32-day plan Week 1 Day 2 work (slipped).
-- Target:  Supabase project yhgriqagrhyblhmloctc (eu-west-1)
-- Run via: Supabase dashboard → SQL Editor, OR psql through the pooler.
--
-- Two things:
--   1. Link Supabase Auth (auth.users) → master public.users table.
--      Strategy (chosen 2026-05-29): users.auth_user_id FK + link-by-email.
--      Seeded staff exist in public.users BEFORE they have login accounts;
--      on first signup the trigger links their auth account to the existing
--      row by email. Brand-new public signups get a fresh 'client' row.
--      RLS (later) maps the session via: users.auth_user_id = auth.uid().
--
--   2. Business Partner model (new requirement 2026-05-29): external legal
--      partners (attorneys, conveyancers, law firms, agents) who log in to
--      see THEIR clients' matters. A client optionally links to one partner.
--
-- Idempotent / guarded throughout. Additive — no drops of data.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. business_partners — external legal/partner entity (the "firm").
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS business_partners (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name          TEXT        NOT NULL,                 -- firm / partner name
    partner_type  TEXT        NOT NULL DEFAULT 'attorney'
                              CHECK (partner_type IN ('attorney', 'conveyancer',
                                     'law_firm', 'estate_agent', 'other')),
    primary_email TEXT,
    primary_cell  TEXT,
    physical_address TEXT,
    notes         TEXT,
    active        BOOLEAN     NOT NULL DEFAULT true,
    created_by    UUID        REFERENCES users(id) ON DELETE SET NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
DROP TRIGGER IF EXISTS trg_business_partners_updated_at ON business_partners;
CREATE TRIGGER trg_business_partners_updated_at
    BEFORE UPDATE ON business_partners
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ----------------------------------------------------------------------------
-- 2. Link columns
-- ----------------------------------------------------------------------------
-- A partner USER belongs to a partner org (mirrors users.client_id).
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS business_partner_id UUID
  REFERENCES business_partners(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_users_business_partner ON users(business_partner_id);

-- A CLIENT optionally links to the partner who referred / manages them.
-- This is the "client → business partner" connection.
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS business_partner_id UUID
  REFERENCES business_partners(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_clients_business_partner ON clients(business_partner_id);

-- Supabase Auth link. UNIQUE so one auth account maps to one profile.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS auth_user_id UUID UNIQUE
  REFERENCES auth.users(id) ON DELETE SET NULL;

-- ----------------------------------------------------------------------------
-- 3. Widen the role CHECK
--    + 'business_partner' (new requirement) and 'council' (32-day plan §2,
--      needed for Day 17 council login persona). Existing roles kept.
-- ----------------------------------------------------------------------------
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN (
    'admin', 'staff_services', 'staff_ops', 'staff_delivery',
    'client', 'attorney', 'contractor', 'business_partner', 'council'
));

-- ----------------------------------------------------------------------------
-- 4. Auth → profile trigger
--    SECURITY DEFINER so it bypasses RLS and can write public.users.
--    Role is FORCED to 'client' on new inserts — never trust client-supplied
--    signup metadata for role (privilege-escalation guard). Staff / partner /
--    attorney / council are seeded or promoted by an admin afterward.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- (a) Pre-seeded user (e.g. staff) signing up for the first time:
  --     link the auth account to the existing row, matched by email.
  UPDATE public.users
     SET auth_user_id = NEW.id
   WHERE email = NEW.email
     AND auth_user_id IS NULL;

  IF NOT FOUND THEN
    -- (b) Brand-new public signup → create a client profile.
    INSERT INTO public.users (auth_user_id, email, full_name, role)
    VALUES (
      NEW.id,
      NEW.email,
      NULLIF(NEW.raw_user_meta_data->>'full_name', ''),
      'client'
    )
    ON CONFLICT (email) DO UPDATE
      SET auth_user_id = EXCLUDED.auth_user_id
      WHERE public.users.auth_user_id IS NULL;  -- only adopt if still unlinked
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

COMMIT;

-- ============================================================================
-- 5. Verification
-- ============================================================================
-- Expect: business_partners table present
SELECT table_name FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'business_partners';

-- Expect: users.auth_user_id, users.business_partner_id, clients.business_partner_id
SELECT table_name, column_name FROM information_schema.columns
  WHERE (table_name = 'users'   AND column_name IN ('auth_user_id','business_partner_id'))
     OR (table_name = 'clients' AND column_name = 'business_partner_id')
  ORDER BY table_name, column_name;

-- Expect: role list now includes business_partner + council
SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'users_role_check';

-- Expect: trigger on_auth_user_created present on auth.users
SELECT tgname FROM pg_trigger WHERE tgname = 'on_auth_user_created';
