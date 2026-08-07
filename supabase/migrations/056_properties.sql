-- ============================================================================
-- 056 — properties: the property as an entity in its own right
-- ============================================================================
-- Decision, Meeting 2 (2026-08-06), Decisions §44 + Details §106: "Property
-- Transfers" is the central data node and "Properties" is a linked entity
-- holding the detail — rates accounts, building plans, compliance certificates.
-- §98 adds a Properties tab in the client portal, entity-scoped.
--
-- INERT. The table and the FK are created; nothing reads them yet. Per the
-- house 042/043 pattern, the surfaces that consume this ship separately.
--
-- ⚠️ NAMING — this SUBSUMES the `locations` table planned in
-- REDESIGN_SECTION1_PLAN.md (planned as 050, never built; verified with
-- `grep -rn "location_id\|CREATE TABLE.*locations" supabase/migrations/*.sql`
-- → no hits anywhere).
--
--   The plan called it `locations` because Section 3 needs one row per retail
--   store (Seattle, ~500). Meeting 2 decided the noun is "Properties", the same
--   way "Property Transfers" was named for how conveyancers speak.
--
--   ONE table, not two. A transferred erf and a leased store are the same
--   shape: a physical place with an address, an erf number and its own
--   documents. Two tables would duplicate all of that and force a guess at
--   insert time about which kind of place this is.
--
--   🔴 Flagged for Zewn 2026-08-07: this overrides a written plan's naming.
--   Section 3 can still say "locations" in the UI for retail clients — the
--   noun in the schema does not have to be the noun on the screen. If that is
--   wrong, it is cheap to rename NOW and expensive after Section 3.
--
-- ⚠️ NO BACKFILL, deliberately. property_transfers.property_description is free
-- text ("ERF 345", "12 Oak Ave"). Parsing it into structured erf/address would
-- manufacture false precision, and creating one property per transfer would
-- manufacture DUPLICATES — two transfers on the same erf are exactly the case
-- this entity exists to unify. Staff link them, which is a judgement the
-- database cannot make.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.properties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The owning entity, WHEN KNOWN. Nullable on purpose, against the plan's
  -- `client_id not null`: a property is often captured during intake before
  -- anyone has decided which client record owns it, and ownership changes on
  -- every transfer — which is the point of the whole system. Forcing a value
  -- here would force a wrong one.
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,

  label text NOT NULL,               -- 'ERF 123 Valhalla' / 'Seattle Menlyn'
  address        text,
  erf_number     text,
  municipality   text,
  province       text,               -- drives the §7 geofence rules later
  suburb         text,

  -- The council reference staff actually chase. Matters already stash a rates
  -- account in service_data.rates_account_no; the property is its real home,
  -- because the account follows the PROPERTY, not the matter. Existing matter
  -- values are left where they are — moving them is a separate, verifiable step.
  rates_account_no text,
  title_deed_no    text,

  notes      text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.properties IS
  'A physical property. Linked FROM property_transfers, and the home for rates '
  'accounts, building plans and compliance certificates (Meeting 2, 2026-08-06). '
  'Subsumes the `locations` table planned in REDESIGN_SECTION1_PLAN.md — one '
  'table serves a transferred erf and a retail store location alike.';

COMMENT ON COLUMN public.properties.client_id IS
  'Current owning entity, when known. Nullable: ownership changes on transfer '
  'and is often unknown at intake.';

CREATE INDEX IF NOT EXISTS idx_properties_client ON public.properties (client_id);
CREATE INDEX IF NOT EXISTS idx_properties_erf ON public.properties (erf_number)
  WHERE erf_number IS NOT NULL;

DROP TRIGGER IF EXISTS trg_properties_updated_at ON public.properties;
CREATE TRIGGER trg_properties_updated_at
  BEFORE UPDATE ON public.properties
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ----------------------------------------------------------------------------
-- The link. Nullable — same reasoning as matters.transfer_id: a transfer can
-- exist before anyone has built its property profile.
-- ----------------------------------------------------------------------------
ALTER TABLE public.property_transfers
  ADD COLUMN IF NOT EXISTS property_id uuid
    REFERENCES public.properties(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_property_transfers_property
  ON public.property_transfers (property_id) WHERE property_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- Access.
-- ----------------------------------------------------------------------------
-- Three ways to reach a property:
--   staff  — everything, as everywhere else;
--   client — the entity that owns it (can_access_client already understands
--            multi-entity membership since 049, so this does not need to know
--            about client_members);
--   firm   — via a transfer it holds a live grant on. Written as EXISTS over
--            property_transfers rather than duplicating grant logic, so 053's
--            expiry rule applies here for free.
CREATE OR REPLACE FUNCTION public.can_access_property(p_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT app_is_staff()
      OR EXISTS (SELECT 1 FROM public.properties p
                  WHERE p.id = p_id
                    AND p.client_id IS NOT NULL
                    AND public.can_access_client(p.client_id))
      OR EXISTS (SELECT 1 FROM public.property_transfers t
                  WHERE t.property_id = p_id
                    AND public.can_access_transfer(t.id));
$$;

COMMENT ON FUNCTION public.can_access_property(uuid) IS
  'Staff, the owning entity, or a firm holding live access to a transfer on '
  'this property. Delegates to can_access_client and can_access_transfer so '
  'multi-entity membership (049) and grant expiry (053) apply without being '
  'restated here.';

ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.properties TO authenticated;

DROP POLICY IF EXISTS properties_read ON public.properties;
CREATE POLICY properties_read ON public.properties FOR SELECT TO authenticated
  USING (public.can_access_property(id));

-- Writes are staff-only, matching property_transfers (026). A client correcting
-- their own erf number after a clearance has been issued is not a self-service
-- action, and a firm editing a property it merely works would rewrite it for
-- everyone else on it.
DROP POLICY IF EXISTS properties_staff_write ON public.properties;
CREATE POLICY properties_staff_write ON public.properties FOR ALL TO authenticated
  USING (public.app_is_staff()) WITH CHECK (public.app_is_staff());

COMMIT;

-- ============================================================================
-- VERIFY
--
--   -- inert on arrival
--   SELECT count(*) FROM properties;                          → 0
--   SELECT count(*) FROM property_transfers WHERE property_id IS NOT NULL; → 0
--
--   -- staff can write, and read back
--   INSERT INTO properties (label, erf_number, municipality)
--   VALUES ('ERF 123 Valhalla', '123', 'COT');
--
--   -- as a CLIENT: sees it only once it belongs to their entity
--   SELECT count(*) FROM properties;                          → 0
--   UPDATE properties SET client_id = '<their client>' WHERE label = 'ERF 123 Valhalla';
--   SELECT count(*) FROM properties;                          → 1
--   -- and still cannot write
--   UPDATE properties SET label = 'nope' WHERE id = '<id>';   → 0 rows
--
--   -- as a PARTNER firm: sees it via a transfer they hold a grant on
--   UPDATE property_transfers SET property_id = '<id>' WHERE id = '<their transfer>';
--   SELECT count(*) FROM properties;                          → 1
--   -- revoke the grant → back to 0, because can_access_transfer says so
--
-- ROLLBACK
--   ALTER TABLE public.property_transfers DROP COLUMN IF EXISTS property_id;
--   DROP TABLE IF EXISTS public.properties;
--   DROP FUNCTION IF EXISTS public.can_access_property(uuid);
-- ============================================================================
