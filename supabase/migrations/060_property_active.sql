-- ============================================================================
-- 060 — a sold property goes INACTIVE, it does not disappear
-- ============================================================================
-- Meeting 2026-08-11, Decisions ("Historical property data management") and
-- Details §92:
--
--   "Properties will be marked as inactive rather than deleted after a sale to
--    ensure historical data remains accessible to the seller."
--
--   "Properties remain associated with an account even after being sold, marked
--    as inactive to preserve historical information for the seller."
--
-- The seller keeps the property in their history — the rates clearance, the COO,
-- the refund — after it is no longer theirs. Deleting the row would take the
-- matters' `property_id` with it and erase exactly the history the decision is
-- protecting.
--
-- WHY A BOOLEAN, NOT A STATUS ENUM
--   `firms.active` is already a plain boolean and the pickers already read it
--   that way (`.eq("active", true)`). A second, differently-shaped "status"
--   vocabulary on a sibling table earns nothing here: the decision names exactly
--   two states. If a third ever arrives it can be added then, against a real
--   requirement rather than a guessed one.
--
-- ⚠️ THE DUPLICATE-COLUMN TRAP ON THIS TABLE
--   `properties` already carries two columns per field — 001's `street_address`,
--   `premises_name`, `municipality_id`, `property_type` alongside 056's
--   `address`, `label`, `municipality` (the additive reconciliation Zewn chose
--   on 2026-08-11). That debt is real and it is capped. This migration adds ONE
--   new concept that 001 does not have in any spelling — verified: 001:245-255
--   has no active, status, sold or archived column — so it does not become a
--   third pair.
--
-- `deactivated_at` rides along because the seller's history view wants "sold
-- when", and deriving it from the transfer later means a join through
-- property_transfers that only works while exactly one transfer points here.
-- ============================================================================

BEGIN;

ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS active          boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS deactivated_at  timestamptz;

COMMENT ON COLUMN public.properties.active IS
  'False once the property is sold (2026-08-11 §92). Never delete a property: '
  'the seller keeps it in their history. Set automatically when a transfer '
  'pointing at it is marked registered, and by hand for sales done off-portal.';

COMMENT ON COLUMN public.properties.deactivated_at IS
  'When it went inactive. NULL while active.';

-- Every existing row predates the decision and none of them are sold — both
-- databases held 0 rows when 056 landed and staging has one hand-made property
-- (ERF 4471 Valhalla, dry run 2026-08-11). The DEFAULT already covers them; this
-- is belt-and-braces for a re-run against a database where the column exists but
-- was added nullable by hand.
UPDATE public.properties SET active = true WHERE active IS NULL;

-- NO INDEX ON `active`, deliberately.
--   Nothing filters on it. The transfer property picker stays UNFILTERED — a
--   sold property gets sold again, and hiding it from the picker would make it
--   unfindable at exactly the moment it is needed, so staff would key in a
--   second row for the same erf. `active` drives how the seller's dashboard
--   GROUPS their properties, which is a sort over rows already scoped by
--   client_id. An index here would be carried on every write and read by
--   nothing.
--
-- A row cannot claim to be active and carry a deactivation date, which is what a
-- half-applied reactivation looks like.
ALTER TABLE public.properties
  DROP CONSTRAINT IF EXISTS properties_deactivated_consistent;
ALTER TABLE public.properties
  ADD CONSTRAINT properties_deactivated_consistent
  CHECK (active = false OR deactivated_at IS NULL);

COMMIT;

-- ============================================================================
-- VERIFY
--
--   -- inert on arrival: everything that exists is still active
--   SELECT count(*) FROM properties WHERE active IS NOT TRUE;            → 0
--   SELECT count(*) FROM properties WHERE deactivated_at IS NOT NULL;    → 0
--
--   -- 001's six columns are untouched by this migration
--   SELECT street_address, premises_name, municipality_id, property_type
--     FROM properties LIMIT 1;                                → no 42703
--
--   -- deactivating is accepted
--   UPDATE properties SET active = false, deactivated_at = now()
--    WHERE label = 'ERF 4471 Valhalla';
--
--   -- the inconsistent half-state is refused → properties_deactivated_consistent
--   UPDATE properties SET active = true WHERE deactivated_at IS NOT NULL;
--
--   -- reactivating properly is accepted
--   UPDATE properties SET active = true, deactivated_at = NULL
--    WHERE label = 'ERF 4471 Valhalla';
--
-- ROLLBACK
--   ALTER TABLE public.properties
--     DROP CONSTRAINT IF EXISTS properties_deactivated_consistent;
--   ALTER TABLE public.properties
--     DROP COLUMN IF EXISTS active,
--     DROP COLUMN IF EXISTS deactivated_at;
--
--   🔴 Do NOT write `DROP TABLE properties` here. 056's first draft did, and it
--   would take 001's table and matters.property_id's FK with it.
-- ============================================================================
