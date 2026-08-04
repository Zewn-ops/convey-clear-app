-- 026_property_transfers.sql
-- ============================================================================
-- Meeting 1 (2026-06-29) / Roadmap §3c — "Property Transfers" hub (MVP).
-- ============================================================================
-- A conveyancing attorney runs ONE property transaction that spawns SEVERAL
-- ConveyClear matters (PRC → figures → certificate → COO → refund → MAD). The
-- transfer is the top-level record those matters hang off, so a firm can see the
-- whole transaction in one place instead of hunting matter-by-matter.
--
-- Model:
--   * property_transfers   — the transaction. Carries the reference + property +
--     the four party links (attorney firm, estate-agent firm, seller, buyer).
--   * matters.transfer_id  — NULLABLE. Standalone matters still exist and are
--     the norm; the transfer link is opt-in. ON DELETE SET NULL so removing a
--     transfer never cascades into matters.
--
-- RLS is FIRM-scoped: business_partner_id is the owning (conveyancing attorney)
-- firm and is the partner's read predicate. Staff get full CRUD. Clients get
-- nothing — a transfer spans multiple parties, so exposing it to one of them
-- would leak the counterparty. Client visibility + the estate-agent portal role
-- are v1.2.
--
-- MVP boundary (deferred to v1.2, per the roadmap): per-transfer document
-- groups, a transfer-level activity feed / enquiries, and package pricing.
--
-- Additive + idempotent. Apply via the Supabase SQL Editor (no DB password).
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. property_transfers — one row per property transaction
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.property_transfers (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference               text NOT NULL,          -- the firm's transaction reference
  property_description    text,                   -- 'ERF 123 VALHALLA'
  municipality            text,                   -- COT / COJ / COE / ...
  status                  text NOT NULL DEFAULT 'open'
                            CHECK (status IN ('open', 'registered', 'cancelled', 'on_hold')),

  -- Owning conveyancing-attorney firm. This column IS the partner RLS scope.
  business_partner_id     uuid REFERENCES public.business_partners(id) ON DELETE SET NULL,
  -- Optional estate-agent firm on the same transaction (no portal role yet).
  estate_agent_partner_id uuid REFERENCES public.business_partners(id) ON DELETE SET NULL,

  seller_client_id        uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  buyer_client_id         uuid REFERENCES public.clients(id) ON DELETE SET NULL,

  notes                   text,
  created_by              uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

-- References are matched/typed by humans — collapse case so 'ab1234' can't be
-- filed alongside 'AB1234'.
CREATE UNIQUE INDEX IF NOT EXISTS uq_property_transfers_reference
  ON public.property_transfers (upper(reference));
CREATE INDEX IF NOT EXISTS idx_property_transfers_partner
  ON public.property_transfers(business_partner_id);
CREATE INDEX IF NOT EXISTS idx_property_transfers_status
  ON public.property_transfers(status);

DROP TRIGGER IF EXISTS trg_property_transfers_updated_at ON public.property_transfers;
CREATE TRIGGER trg_property_transfers_updated_at
  BEFORE UPDATE ON public.property_transfers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE public.property_transfers IS
  'A property transaction that groups the several matters it spawns (PRC, COO, refund, ...). Matter linkage is optional via matters.transfer_id.';
COMMENT ON COLUMN public.property_transfers.business_partner_id IS
  'Owning conveyancing-attorney firm. Doubles as the partner RLS scope for this table.';

-- ----------------------------------------------------------------------------
-- 2. matters.transfer_id — optional link up to the transaction
-- ----------------------------------------------------------------------------
ALTER TABLE public.matters
  ADD COLUMN IF NOT EXISTS transfer_id uuid
    REFERENCES public.property_transfers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_matters_transfer_id ON public.matters(transfer_id);

COMMENT ON COLUMN public.matters.transfer_id IS
  'Optional parent property transfer. NULL = standalone matter (still the common case).';

-- ----------------------------------------------------------------------------
-- 3. can_access_transfer — staff, or a partner user of the owning firm.
--    SECURITY DEFINER so the property_transfers read inside it bypasses RLS
--    (same pattern as can_access_client / can_access_matter — no recursion).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_access_transfer(t_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT app_is_staff()
      OR (app_user_partner_id() IS NOT NULL
          AND EXISTS (SELECT 1 FROM public.property_transfers t
                      WHERE t.id = t_id
                        AND t.business_partner_id = app_user_partner_id()));
$$;

-- ----------------------------------------------------------------------------
-- 4. RLS — staff full CRUD; owning firm reads. Writes for partners are NOT
--    granted: transfers are created/edited by staff through service-role routes.
-- ----------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.property_transfers TO authenticated;

ALTER TABLE public.property_transfers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS property_transfers_staff_all ON public.property_transfers;
CREATE POLICY property_transfers_staff_all ON public.property_transfers FOR ALL TO authenticated
  USING (app_is_staff()) WITH CHECK (app_is_staff());

DROP POLICY IF EXISTS property_transfers_read_scoped ON public.property_transfers;
CREATE POLICY property_transfers_read_scoped ON public.property_transfers FOR SELECT TO authenticated
  USING (can_access_transfer(id));

COMMIT;

-- ============================================================================
-- Verification
-- ============================================================================
SELECT to_regclass('public.property_transfers')                AS transfers_table;
SELECT column_name FROM information_schema.columns
  WHERE table_name = 'matters' AND column_name = 'transfer_id';                -- 1 row
SELECT policyname FROM pg_policies WHERE tablename = 'property_transfers';    -- 2 rows
SELECT proname FROM pg_proc WHERE proname = 'can_access_transfer';            -- 1 row
