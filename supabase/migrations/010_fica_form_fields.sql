-- =============================================================================
-- Migration 010 — FICA onboarding form fields (master directory §2)
-- =============================================================================
-- Adds the fields the master-directory FICA form captures that aren't already
-- modelled. Additive + idempotent. Does NOT affect the BC automation.
--
-- Already present (do NOT re-add): clients.person_industry, clients.marketing_opt_in,
-- clients.physical_address, contacts(name/email/cell/id_number/is_primary), power_of_attorneys.
--
-- ⚠️ SECURITY: municipal_username/password are client municipal-portal credentials.
-- Stored to let ConveyClear pull account statements (optional, per master). These are
-- sensitive — TODO before real clients: encrypt at rest (pgcrypto) or move to a secrets
-- vault; restrict via RLS to staff only. Flagged in SECURITY.md.
-- =============================================================================

-- ---- clients: person/role + consents + convenience fields ----
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS person_designation     TEXT,
  ADD COLUMN IF NOT EXISTS num_properties_owned    INTEGER,
  ADD COLUMN IF NOT EXISTS num_businesses_owned    INTEGER,
  ADD COLUMN IF NOT EXISTS popia_consent_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS terms_accepted_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS municipal_username      TEXT,
  ADD COLUMN IF NOT EXISTS municipal_password      TEXT;  -- sensitive, see header

COMMENT ON COLUMN public.clients.municipal_password IS
  'SENSITIVE: client municipal-portal password. Encrypt at rest before production (pgcrypto). Staff-only via RLS.';

-- ---- contacts (linked persons / directors): extra master FICA fields ----
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS work_number  TEXT,
  ADD COLUMN IF NOT EXISTS designation  TEXT,
  ADD COLUMN IF NOT EXISTS is_director  BOOLEAN NOT NULL DEFAULT false;

-- ---- consent audit (POPIA defensibility): record each consent event ----
CREATE TABLE IF NOT EXISTS public.consent_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  matter_id   UUID REFERENCES public.matters(id) ON DELETE SET NULL,
  consent_type TEXT NOT NULL,            -- 'popia' | 'terms' | 'marketing'
  granted     BOOLEAN NOT NULL,
  source      TEXT,                      -- e.g. 'fica_form'
  ip_address  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.consent_events ENABLE ROW LEVEL SECURITY;
-- staff can read/manage all; clients can read their own consent records
DROP POLICY IF EXISTS consent_events_staff_all ON public.consent_events;
CREATE POLICY consent_events_staff_all ON public.consent_events
  FOR ALL USING (app_is_staff());
DROP POLICY IF EXISTS consent_events_self_read ON public.consent_events;
CREATE POLICY consent_events_self_read ON public.consent_events
  FOR SELECT USING (client_id = app_user_client_id());
