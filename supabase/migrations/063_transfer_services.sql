-- ============================================================================
-- 063 — the property transfer as an umbrella over six services
-- ============================================================================
-- Meeting 2026-08-24, Details §108–§124. Jukka:
--
--   "a property transfer acts as an umbrella containing multiple sub-services,
--    such as electrical Certificates of Compliance (COC), Municipal Account
--    Disputes (MAD), and building plans, which each function as distinct
--    matters."
--
-- and §114: "a user interface where users can view line items with expandable
-- arrows to reveal related sub-services".
--
-- This migration builds the DATA MODEL only. No UI, no behaviour change to
-- anything that exists today.
--
-- ── WHAT THIS IS NOT ────────────────────────────────────────────────────────
-- 🔴 It does NOT enforce the prerequisite rule. §114 records that EBP,
--    Certificates, MAD and PRC must be complete before Change of Ownership
--    proceeds — but whether the PORTAL enforces that ordering or merely
--    displays it was never said out loud in the meeting. An enforced gate that
--    turns out to be wrong is far more expensive than a displayed one that
--    turns out to be too soft, so the ordering is recorded as data
--    (`blocks_change_of_ownership`) and nothing acts on it yet. Ask Jukka, then
--    build the gate in its own migration if he wants one.
--
-- 🔴 It does NOT invent the third-party attribution list. §124 has Jukka owing
--    that by message (electrical via Flex, gas via Roger Gas were the examples).
--    The column exists; it ships empty.
--
-- ── SHAPE ───────────────────────────────────────────────────────────────────
-- One self-referencing table, two levels deep:
--
--   parent_id IS NULL   → the service line item   (EBP, CERT, PRC, MAD, COO, REFUND, OTHER)
--   parent_id IS NOT NULL → a sub-service under it (Electrical, Floor plans, …)
--
-- A tree rather than two tables because the meeting describes one control —
-- a line item that expands — and because the sub-service lists are per-transfer
-- decisions, not global config: a given transfer may need two of the four
-- building-plan documents and no more.
--
-- `status` carries only the three markers Jukka named, which are statements of
-- INTENT set by staff and drive what ConveyClear actually does (§122).
-- Deliberately NOT a progress vocabulary: progress belongs to the linked matter,
-- which already has phases, and duplicating it here would create two sources of
-- truth for "how far along is this".
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. "Certificates" as a service (§120)
--    The meeting renamed "Certificate of Compliance" to "Certificates", to cover
--    electrical, building standards, environmental and gas. There was no such
--    service row: COC work has been running under the generic services. Added
--    inactive-safe via ON CONFLICT so re-running is harmless.
-- ---------------------------------------------------------------------------
INSERT INTO public.services (code, name, description, active)
VALUES ('CERT', 'Certificates',
        'Inspection-verified compliance certificates: electrical, building standards, environmental, gas.',
        true)
ON CONFLICT (code) DO UPDATE
  SET name = EXCLUDED.name, description = EXCLUDED.description;

-- ---------------------------------------------------------------------------
-- 2. The line items
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.transfer_services (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id   uuid NOT NULL REFERENCES public.property_transfers(id) ON DELETE CASCADE,
  parent_id     uuid REFERENCES public.transfer_services(id) ON DELETE CASCADE,

  -- Top-level rows carry a service code; sub-service rows carry a label.
  service_code  text,
  label         text,

  -- The three markers from §122, verbatim in meaning.
  status        text NOT NULL DEFAULT 'needed',

  -- Set once the line item becomes real work. ON DELETE SET NULL: deleting a
  -- matter must not silently delete the checklist entry that asked for it.
  matter_id     uuid REFERENCES public.matters(id) ON DELETE SET NULL,

  -- §124. Ships empty on purpose — Jukka owes the attribution list.
  third_party   text,

  -- Ordering is per transfer and hand-set, because the municipal sequence is
  -- not alphabetical and not creation order.
  position      integer NOT NULL DEFAULT 0,
  notes         text,

  created_by    uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT transfer_services_status_check
    CHECK (status IN ('needed', 'already_done', 'not_applicable')),

  -- A top-level row is identified by its service code; a sub-service row by its
  -- label. Neither shape is allowed to be anonymous.
  CONSTRAINT transfer_services_identity CHECK (
    (parent_id IS NULL     AND service_code IS NOT NULL) OR
    (parent_id IS NOT NULL AND COALESCE(NULLIF(btrim(label), ''), NULL) IS NOT NULL)
  ),

  -- Two levels, not n. A sub-service cannot itself be a parent; enforced by the
  -- trigger below, which is the only way to express it in Postgres.
  CONSTRAINT transfer_services_no_self CHECK (parent_id IS DISTINCT FROM id)
);

COMMENT ON TABLE public.transfer_services IS
  'Per-transfer service checklist (Meeting 2026-08-24 §108-124). parent_id NULL = '
  'a service line item; parent_id set = a sub-service under it. status carries only '
  'the three staff-set markers Jukka named; progress lives on the linked matter.';

COMMENT ON COLUMN public.transfer_services.third_party IS
  'Who renders the service if not the council (§124: Flex for electrical, Roger Gas '
  'for gas were the examples). Ships empty — the attribution list is owed by Jukka.';

CREATE INDEX IF NOT EXISTS idx_transfer_services_transfer ON public.transfer_services(transfer_id);
CREATE INDEX IF NOT EXISTS idx_transfer_services_parent   ON public.transfer_services(parent_id);
CREATE INDEX IF NOT EXISTS idx_transfer_services_matter   ON public.transfer_services(matter_id)
  WHERE matter_id IS NOT NULL;

-- One row per service per transfer at the top level. Sub-services are free to
-- repeat a label under different parents, so the index is partial.
CREATE UNIQUE INDEX IF NOT EXISTS uq_transfer_services_top
  ON public.transfer_services(transfer_id, service_code)
  WHERE parent_id IS NULL;

-- ---------------------------------------------------------------------------
-- 3. Two levels only
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.transfer_services_depth_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.parent_id IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.transfer_services p
                WHERE p.id = NEW.parent_id AND p.parent_id IS NOT NULL) THEN
      RAISE EXCEPTION 'transfer_services is two levels deep: % already has a parent', NEW.parent_id;
    END IF;
    -- A sub-service must live on the same transfer as its parent, or the tree
    -- would silently span transactions.
    IF EXISTS (SELECT 1 FROM public.transfer_services p
                WHERE p.id = NEW.parent_id AND p.transfer_id <> NEW.transfer_id) THEN
      RAISE EXCEPTION 'sub-service transfer_id must match its parent';
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_transfer_services_guard ON public.transfer_services;
CREATE TRIGGER trg_transfer_services_guard
  BEFORE INSERT OR UPDATE ON public.transfer_services
  FOR EACH ROW EXECUTE FUNCTION public.transfer_services_depth_guard();

-- ---------------------------------------------------------------------------
-- 4. The default six (§112), plus Other (§116)
--    A function, not a trigger: instantiating a checklist is a product decision
--    about when, and firing it automatically on every insert would retro-fit
--    line items onto transfers created for other reasons. The UI calls this.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.instantiate_transfer_services(t_id uuid, actor uuid DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  inserted integer;
BEGIN
  -- Order is the municipal sequence Jukka described: everything else clears
  -- before Change of Ownership, and the refund is last because it follows it.
  INSERT INTO public.transfer_services (transfer_id, service_code, position, created_by)
  SELECT t_id, v.code, v.pos, actor
  FROM (VALUES
    ('EBP', 1), ('CERT', 2), ('PRC', 3), ('MAD', 4), ('COO', 5), ('REFUND', 6), ('OTHER', 7)
  ) AS v(code, pos)
  ON CONFLICT (transfer_id, service_code) WHERE parent_id IS NULL DO NOTHING;
  GET DIAGNOSTICS inserted = ROW_COUNT;
  RETURN inserted;
END $$;

COMMENT ON FUNCTION public.instantiate_transfer_services(uuid, uuid) IS
  'Create the default service checklist for a transfer (§112 + the Other tab, §116). '
  'Idempotent. Deliberately not a trigger — when a checklist appears is a product '
  'decision, not a database one.';

-- ---------------------------------------------------------------------------
-- 5. RLS — mirrors transfer access exactly, and adds nothing new
--
--    Staff: everything. Firms and other transfer participants: whatever
--    can_access_transfer() already grants them. Clients: read-only, and only
--    through client_can_view_transfer(), the party-based function 062 added
--    precisely so that widening client sight does not widen it anywhere else.
--
--    Note the asymmetry, which is intentional: clients READ their checklist,
--    they do not write it. §122 has the markers being set by staff, because
--    they drive what ConveyClear does.
-- ---------------------------------------------------------------------------
ALTER TABLE public.transfer_services ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transfer_services TO authenticated;

DROP POLICY IF EXISTS transfer_services_staff_all ON public.transfer_services;
CREATE POLICY transfer_services_staff_all ON public.transfer_services FOR ALL TO authenticated
  USING (app_is_staff()) WITH CHECK (app_is_staff());

DROP POLICY IF EXISTS transfer_services_read ON public.transfer_services;
CREATE POLICY transfer_services_read ON public.transfer_services FOR SELECT TO authenticated
  USING (
    public.can_access_transfer(transfer_id)
    OR public.client_can_view_transfer(transfer_id)
  );

COMMIT;

-- ============================================================================
-- VERIFY
-- ============================================================================
-- SELECT to_regclass('public.transfer_services');                       -- not null
-- SELECT code FROM public.services WHERE code = 'CERT';                 -- one row
-- SELECT public.instantiate_transfer_services('<a transfer id>');       -- 7 first run, 0 after
-- SELECT service_code, status, position FROM public.transfer_services
--   WHERE transfer_id = '<a transfer id>' AND parent_id IS NULL ORDER BY position;
