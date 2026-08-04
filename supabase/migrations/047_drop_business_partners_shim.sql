-- ============================================================================
-- 047 — drop the business_partners compat shim
-- ============================================================================
-- The enforce half of the 046 rename, following the house pattern: inert prep
-- first, enforce second, never both in one migration.
--
-- 🔴 PRECONDITION — do not run this until the app deploy that reads public.firms
-- is live in production. While the shim exists both names work; the moment it
-- goes, any build still calling business_partners gets a PostgREST 404 on every
-- firm query, which is the partner portal, the admin firms pages and the firm
-- column on matters.
--
-- Check before running:
--   1. Vercel shows the firms-rename deploy as ● Ready in Production.
--   2. curl -s -o /dev/null -w "%{http_code}" \
--        "$URL/rest/v1/firms?select=id&limit=0" -H "apikey: $KEY" -H "Authorization: Bearer $KEY"
--      → 200
--   3. Nothing in the running build greps for business_partners:
--        grep -rn 'business_partners' src --include="*.ts" --include="*.tsx"
--      → no matches
-- ============================================================================

BEGIN;

DROP VIEW IF EXISTS public.business_partners;

COMMIT;

-- ============================================================================
-- VERIFY
--   SELECT count(*) FROM information_schema.tables
--    WHERE table_schema='public' AND table_name='business_partners';
--   -- expect 0
--
--   SELECT count(*) FROM public.firms;   -- unchanged from before
--
-- ROLLBACK (restores the shim exactly)
--   CREATE VIEW public.business_partners WITH (security_invoker = true) AS
--     SELECT * FROM public.firms;
--   GRANT SELECT, INSERT, UPDATE, DELETE ON public.business_partners TO authenticated;
-- ============================================================================
