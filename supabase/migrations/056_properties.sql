-- ============================================================================
-- 056 — properties: the property as an entity in its own right
-- ============================================================================
-- Decision, Meeting 2 (2026-08-06), Decisions §44 + Details §106: "Property
-- Transfers" is the central data node and "Properties" is a linked entity
-- holding the detail — rates accounts, building plans, compliance certificates.
-- §98 adds a Properties tab in the client portal, entity-scoped.
--
-- INERT. The columns and the FK are added; nothing reads them yet. Per the
-- house 042/043 pattern, the surfaces that consume this ship separately.
--
-- ============================================================================
-- 🔴 REWRITTEN 2026-08-11 — `properties` ALREADY EXISTS. This is an ALTER.
-- ============================================================================
-- The first draft of this file opened with `CREATE TABLE IF NOT EXISTS
-- public.properties`, on the belief that the entity was net-new. It is not:
--
--   001_schema.sql:245  CREATE TABLE properties (...)
--   001_schema.sql:279  matters.property_id REFERENCES properties(id)
--   001_schema.sql:542  'properties' asserted in expected_tables
--   006_rls.sql:225-231 properties_staff_all + properties_read_scoped
--
-- So the CREATE was a silent no-op and the next statement — a COMMENT on the
-- new client_id column — failed with 42703, rolling the whole migration back.
-- It never applied anywhere.
--
-- 📌 How the miss happened, because it generalises: the check that declared
-- this net-new grepped for `location_id|CREATE TABLE.*locations` — the name the
-- PLAN used, not the name this migration creates. When a migration renames a
-- concept, grep for the new name too. `IF NOT EXISTS` then converts that
-- mistake from a loud failure into a table of the wrong shape.
--
-- RECONCILIATION — additive, Zewn's call 2026-08-11. 001's columns are LEFT IN
-- PLACE rather than merged, because both databases hold 0 rows and the fast
-- path to a testable staging environment was worth more than a tidy table:
--
--   001 has            056 adds           overlap
--   -------            --------           -------
--   street_address     address            ⚠️ same field, twice
--   premises_name      label              ⚠️ same field, twice
--   municipality_id    municipality       ⚠️ FK vs free text — the FK is better
--   property_type      —                  kept, nothing new uses it
--   erf_number, notes  —                  shared, no conflict
--
-- ⚠️ KNOWN DEBT, settle before this reaches production: the new app code writes
-- only the 056 columns, so the 001 ones stay permanently NULL and a later
-- reader cannot tell which pair is authoritative. The merge is a DROP COLUMN on
-- street_address + premises_name and a swap of `municipality` for
-- `municipality_id` in PropertyForm.tsx and /api/admin/properties — cheap while
-- the table is empty, and it stays cheap only while that is true.
-- ============================================================================
--
-- ⚠️ NAMING — this SUBSUMES the `locations` table planned in
-- REDESIGN_SECTION1_PLAN.md (planned as 050, never built).
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
--   🔴 Still flagged for Zewn: this overrides a written plan's naming.
--   Section 3 can still say "locations" in the UI for retail clients — the
--   noun in the schema does not have to be the noun on the screen.
--
-- ⚠️ NO BACKFILL from transfers, deliberately. property_transfers
-- .property_description is free text ("ERF 345", "12 Oak Ave"). Parsing it into
-- structured erf/address would manufacture false precision, and creating one
-- property per transfer would manufacture DUPLICATES — two transfers on the
-- same erf are exactly the case this entity exists to unify. Staff link them,
-- which is a judgement the database cannot make.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- The new columns. Every one IF NOT EXISTS so a partial earlier attempt or a
-- re-run costs nothing.
-- ----------------------------------------------------------------------------
ALTER TABLE public.properties
  -- The owning entity, WHEN KNOWN. Nullable on purpose, against the plan's
  -- `client_id not null`: a property is often captured during intake before
  -- anyone has decided which client record owns it, and ownership changes on
  -- every transfer — which is the point of the whole system. Forcing a value
  -- here would force a wrong one.
  ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,

  ADD COLUMN IF NOT EXISTS label   text,     -- 'ERF 123 Valhalla' / 'Seattle Menlyn'
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS municipality text,
  ADD COLUMN IF NOT EXISTS province     text,  -- drives the §7 geofence rules later
  ADD COLUMN IF NOT EXISTS suburb       text,

  -- The council reference staff actually chase. Matters already stash a rates
  -- account in service_data.rates_account_no; the property is its real home,
  -- because the account follows the PROPERTY, not the matter. Existing matter
  -- values are left where they are — moving them is a separate, verifiable step.
  ADD COLUMN IF NOT EXISTS rates_account_no text,
  ADD COLUMN IF NOT EXISTS title_deed_no    text,

  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.users(id) ON DELETE SET NULL;

-- `label` is NOT NULL in the model the app writes against, but it cannot be
-- added as NOT NULL to a table that might hold rows. Backfill first, then
-- constrain. Both databases are empty today, so this UPDATE touches 0 rows —
-- it exists so the migration is still correct if that stops being true.
UPDATE public.properties
   SET label = coalesce(premises_name, street_address, erf_number, 'Property')
 WHERE label IS NULL;

ALTER TABLE public.properties ALTER COLUMN label SET NOT NULL;

COMMENT ON TABLE public.properties IS
  'A physical property. Linked FROM property_transfers and matters, and the '
  'home for rates accounts, building plans and compliance certificates '
  '(Meeting 2, 2026-08-06). Subsumes the `locations` table planned in '
  'REDESIGN_SECTION1_PLAN.md — one table serves a transferred erf and a retail '
  'store location alike. NOTE: street_address/premises_name/municipality_id are '
  '001-era columns superseded by address/label/municipality; the new app code '
  'writes only the latter. Merge them before this matters.';

COMMENT ON COLUMN public.properties.client_id IS
  'Current owning entity, when known. Nullable: ownership changes on transfer '
  'and is often unknown at intake.';

COMMENT ON COLUMN public.properties.label IS
  'Display name. Supersedes the 001 premises_name column, which is now unused.';

COMMENT ON COLUMN public.properties.address IS
  'Supersedes the 001 street_address column, which is now unused.';

COMMENT ON COLUMN public.properties.municipality IS
  'Free text. The 001 municipality_id FK to municipalities is the better model '
  'and is the one to keep when these are merged.';

CREATE INDEX IF NOT EXISTS idx_properties_client ON public.properties (client_id);
CREATE INDEX IF NOT EXISTS idx_properties_erf ON public.properties (erf_number)
  WHERE erf_number IS NOT NULL;

-- 001 already creates this trigger. Re-created rather than skipped so the file
-- is correct against a database that somehow lacks it.
DROP TRIGGER IF EXISTS trg_properties_updated_at ON public.properties;
CREATE TRIGGER trg_properties_updated_at
  BEFORE UPDATE ON public.properties
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ----------------------------------------------------------------------------
-- The link. Nullable — same reasoning as matters.transfer_id: a transfer can
-- exist before anyone has built its property profile.
--
-- matters.property_id already exists and already points here (001:279). This
-- adds the same edge from the transfer side.
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
--
-- ⚠️ A FOURTH way survives from 006 and is deliberately kept: properties_read_
-- scoped grants read to anyone who can access a MATTER pointing at this
-- property. RLS policies OR together, so real read access is this function OR
-- that one. Kept on Zewn's call 2026-08-11 — matters have linked to properties
-- since 001 and dropping it would silently blank a property a client legitimately
-- reaches through their own matter. can_access_property() does not cover that
-- path and is not meant to.
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
  'restated here. NOT the whole read rule — 006 properties_read_scoped ORs a '
  'matter-based path alongside it.';

-- Already enabled by 006. Repeated because it is idempotent and this file
-- should stand alone.
ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.properties TO authenticated;

DROP POLICY IF EXISTS properties_read ON public.properties;
CREATE POLICY properties_read ON public.properties FOR SELECT TO authenticated
  USING (public.can_access_property(id));

-- Writes are staff-only, matching property_transfers (026). A client correcting
-- their own erf number after a clearance has been issued is not a self-service
-- action, and a firm editing a property it merely works would rewrite it for
-- everyone else on it.
--
-- 006's properties_staff_all is the same rule and is left in place; two
-- identical staff policies OR to the same answer.
DROP POLICY IF EXISTS properties_staff_write ON public.properties;
CREATE POLICY properties_staff_write ON public.properties FOR ALL TO authenticated
  USING (public.app_is_staff()) WITH CHECK (public.app_is_staff());

COMMIT;

-- ============================================================================
-- VERIFY
--
--   -- the new shape landed on the OLD table
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'properties' ORDER BY ordinal_position;
--     → 001's: id, erf_number, street_address, premises_name, municipality_id,
--              property_type, notes, created_at, updated_at
--     → 056's: client_id, label, address, municipality, province, suburb,
--              rates_account_no, title_deed_no, created_by
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
--   🔴 DO NOT `DROP TABLE properties`. It predates this migration, carries
--   matters.property_id's FK, and 001 asserts it exists. Undo the columns only:
--
--   ALTER TABLE public.property_transfers DROP COLUMN IF EXISTS property_id;
--   DROP POLICY IF EXISTS properties_read ON public.properties;
--   DROP POLICY IF EXISTS properties_staff_write ON public.properties;
--   DROP FUNCTION IF EXISTS public.can_access_property(uuid);
--   ALTER TABLE public.properties
--     DROP COLUMN IF EXISTS client_id,        DROP COLUMN IF EXISTS label,
--     DROP COLUMN IF EXISTS address,          DROP COLUMN IF EXISTS municipality,
--     DROP COLUMN IF EXISTS province,         DROP COLUMN IF EXISTS suburb,
--     DROP COLUMN IF EXISTS rates_account_no, DROP COLUMN IF EXISTS title_deed_no,
--     DROP COLUMN IF EXISTS created_by;
--   -- 006's properties_staff_all / properties_read_scoped are untouched throughout.
-- ============================================================================
