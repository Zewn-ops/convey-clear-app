-- 029_matters_firm_denorm.sql
-- ============================================================================
-- Firm-searchable matters — denormalise the firm name + code onto matters.
-- ============================================================================
-- The matters-list search box builds ONE PostgREST `.or()` over top-level
-- matter columns (lib/matters-query.ts: title/municipality/partner_file_ref).
-- PostgREST cannot `.or()` across an embedded table, so "search matters by firm"
-- has no way in without either an RPC (join in SQL) or denormalisation.
--
-- We denormalise: matters carries a cached copy of its firm's name + abbrev,
-- kept in sync by trigger. Search then stays the same fast top-level `.or()`.
--
-- These columns are a SEARCH CACHE, not a source of truth and NOT a permission
-- surface. Row visibility is still governed entirely by RLS on matters +
-- can_access_matter(); business_partners(name, abbreviation) remains the value
-- rendered in the UI. Nothing reads firm_name/firm_abbrev except the search
-- filter. That is why the sync functions are SECURITY DEFINER: the trigger must
-- refresh the cache regardless of whether the writing role could itself read
-- the business_partners row, and it grants no access it didn't already have.
--
-- No trigram/GIN index: matters is tiny and the filter is ILIKE '%q%', which a
-- btree wouldn't serve anyway. Add pg_trgm here if the table ever grows.
-- ============================================================================

BEGIN;

-- 1. The cached columns. NULL when a matter has no business_partner_id
--    (portal-native / client-only matters), same as the embed renders "—".
ALTER TABLE public.matters ADD COLUMN IF NOT EXISTS firm_name   TEXT;
ALTER TABLE public.matters ADD COLUMN IF NOT EXISTS firm_abbrev TEXT;

COMMENT ON COLUMN public.matters.firm_name IS
  'DENORMALISED search cache of business_partners.name for this matter''s firm. '
  'Maintained by trigger; do not write directly. Source of truth = business_partners.';
COMMENT ON COLUMN public.matters.firm_abbrev IS
  'DENORMALISED search cache of business_partners.abbreviation. Trigger-maintained.';

-- 2. Forward sync: whenever a matter''s firm link is set or changed, refresh its
--    cached firm fields from business_partners. BEFORE trigger = writes NEW in
--    place, no second UPDATE. A NULL business_partner_id clears both columns.
CREATE OR REPLACE FUNCTION public.matters_set_firm_denorm()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.business_partner_id IS NULL THEN
    NEW.firm_name   := NULL;
    NEW.firm_abbrev := NULL;
  ELSE
    SELECT bp.name, bp.abbreviation
      INTO NEW.firm_name, NEW.firm_abbrev
      FROM public.business_partners bp
     WHERE bp.id = NEW.business_partner_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_matters_firm_denorm ON public.matters;
CREATE TRIGGER trg_matters_firm_denorm
  BEFORE INSERT OR UPDATE OF business_partner_id ON public.matters
  FOR EACH ROW EXECUTE FUNCTION public.matters_set_firm_denorm();

-- 3. Reverse sync: renaming a firm (or changing its code) must propagate to every
--    matter already pointing at it. Only fires when the relevant fields change.
CREATE OR REPLACE FUNCTION public.business_partners_sync_matter_firm()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.matters
     SET firm_name   = NEW.name,
         firm_abbrev = NEW.abbreviation
   WHERE business_partner_id = NEW.id
     AND (firm_name IS DISTINCT FROM NEW.name
       OR firm_abbrev IS DISTINCT FROM NEW.abbreviation);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bp_sync_matter_firm ON public.business_partners;
CREATE TRIGGER trg_bp_sync_matter_firm
  AFTER UPDATE OF name, abbreviation ON public.business_partners
  FOR EACH ROW EXECUTE FUNCTION public.business_partners_sync_matter_firm();

-- 4. Backfill existing matters from their current firm link.
UPDATE public.matters m
   SET firm_name   = bp.name,
       firm_abbrev = bp.abbreviation
  FROM public.business_partners bp
 WHERE m.business_partner_id = bp.id
   AND (m.firm_name IS DISTINCT FROM bp.name
     OR m.firm_abbrev IS DISTINCT FROM bp.abbreviation);

COMMIT;

-- Verify (run after COMMIT):
--   SELECT count(*) FILTER (WHERE business_partner_id IS NOT NULL AND firm_name IS NULL)
--     FROM matters;   -- expect 0: every firm-linked matter has a cached name
