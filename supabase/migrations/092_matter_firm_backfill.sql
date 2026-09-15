-- ============================================================================
-- 092 — give a matter the firm its transfer already names
-- ============================================================================
-- WHY
--   matters.business_partner_id was never written until 2026-09-02. Every
--   matter created inside a property transfer before that lands with a NULL
--   firm, and on production today that is 18 of 26.
--
--   Those matters are not INVISIBLE to the firm — 087 added a branch to
--   can_access_matter that reaches them through the transfer's grant, which is
--   why nobody noticed. What they are is UNCOUNTABLE. Every screen that scopes
--   by the column disagrees with every screen that scopes by access:
--
--     /admin/matters?firm=…      8 matters
--     /admin/firms/<id>          "Matters (8)" beside "Property transfers (14)"
--     /partner/matters          15 matters
--
--   for one firm, at one moment. The firm filter is the one staff reach for
--   when a firm asks "what do you have of ours", and it under-reports by two
--   thirds.
--
-- WHAT IT DOES
--   Copies the firm DOWN from the transfer, for matters that have a transfer
--   and no firm of their own. Nothing else: a standalone matter with no firm
--   stays null, because there is nothing truthful to copy — its client carries
--   no firm either (ConveyClear owns the client database; a firm does not claim
--   a client by typing a name).
--
--   trg_matters_firm_denorm fires on UPDATE OF business_partner_id and refreshes
--   matters.firm_name / firm_abbrev from firms. It is SECURITY DEFINER with no
--   staff guard, and 046 rewrote it for the business_partners → firms rename and
--   left a compatibility view, so it runs cleanly from the SQL editor. No
--   trigger disabling needed here — unlike 072, which had to.
-- ============================================================================

BEGIN;

UPDATE public.matters m
   SET business_partner_id = t.business_partner_id
  FROM public.property_transfers t
 WHERE m.transfer_id = t.id
   AND m.business_partner_id IS NULL
   AND t.business_partner_id IS NOT NULL;

COMMIT;

-- ============================================================================
-- VERIFY (run after COMMIT)
--
--   -- 1. Nothing left to copy. Expect 0.
--   SELECT count(*) FROM public.matters m
--     JOIN public.property_transfers t ON t.id = m.transfer_id
--    WHERE m.business_partner_id IS NULL AND t.business_partner_id IS NOT NULL;
--
--   -- 2. What each firm now holds, and how it compares to its transfers.
--   SELECT f.name,
--          (SELECT count(*) FROM public.matters mm
--            WHERE mm.business_partner_id = f.id)             AS matters,
--          (SELECT count(*) FROM public.property_transfers tt
--            WHERE tt.business_partner_id = f.id)             AS transfers
--     FROM public.firms f ORDER BY f.name;
--
--   -- 3. The denorm trigger did its job — no matter names a firm without
--   --    carrying its cached name. Expect 0 rows.
--   SELECT id, title FROM public.matters
--    WHERE business_partner_id IS NOT NULL AND firm_name IS NULL;
--
--   -- 4. Matters still without a firm, and why (expect: no transfer).
--   SELECT count(*) FILTER (WHERE transfer_id IS NULL) AS standalone,
--          count(*) FILTER (WHERE transfer_id IS NOT NULL) AS should_be_zero
--     FROM public.matters WHERE business_partner_id IS NULL;
--
-- THEN, IN THE APP: /admin/matters, filter by the firm — the count should match
-- what /admin/firms/<id> shows, and both should match the partner's own list.
--
-- ROLLBACK
--   There is no clean automatic rollback: the column was NULL and is now set,
--   and this migration cannot tell the rows it wrote from the rows the app has
--   written since. If it must be undone, do it in the same transaction as the
--   run, or restore from the backup taken before it.
-- ============================================================================
