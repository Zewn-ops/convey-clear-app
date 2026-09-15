-- ============================================================================
-- 091 — grant the firms that were named but never granted
-- ============================================================================
-- WHY
--   052 moved transfer access off property_transfers.business_partner_id and
--   onto transfer_access_grants. 051 backfilled a grant for every transfer that
--   named a firm AT THAT MOMENT, and transfer-from-request.ts writes one for
--   every transfer born from a firm's request.
--
--   Nothing wrote one for a transfer created by STAFF on /admin/property-
--   transfers/new. That form sets business_partner_id and stops, so since 052
--   every staff-created transfer has been:
--
--     · listed on the firm's own admin page  (which reads the COLUMN), and
--     · absent from that firm's portal       (which reads the GRANTS)
--
--   with no error on either screen. Found 2026-09-10 by signing in as Sterling
--   & Hayes: admin showed the firm on 14 transfers, the firm could open 9.
--
--   The code half ships alongside this (src/lib/transfer-grants.ts, called from
--   POST and PATCH of the admin route). This migration repairs the rows that
--   drifted while it was missing. Running it before or after that deploy is
--   equally safe — neither half breaks anything on its own.
--
-- WHAT IT DOES NOT DO
--   Nothing here touches a REVOKED grant. If a firm's access was deliberately
--   ended, the transfer still names it in business_partner_id (051 kept that
--   column as the "current primary firm" pointer), and re-granting it here
--   would silently undo a revocation. Only transfers with NO grant row at all
--   for their named firm are repaired.
-- ============================================================================

BEGIN;

INSERT INTO public.transfer_access_grants (transfer_id, firm_id, granted_at, note)
SELECT t.id,
       t.business_partner_id,
       t.created_at,   -- when access SHOULD have begun, not when this ran (051's reasoning)
       'Backfilled (091): named on the transfer but never granted — created before src/lib/transfer-grants.ts existed.'
  FROM public.property_transfers t
 WHERE t.business_partner_id IS NOT NULL
   AND NOT EXISTS (
         SELECT 1
           FROM public.transfer_access_grants g
          WHERE g.transfer_id = t.id
            AND g.firm_id     = t.business_partner_id
       )
ON CONFLICT DO NOTHING;

COMMIT;

-- ============================================================================
-- VERIFY (run after COMMIT)
--
--   -- 1. Nothing left un-granted. Expect 0 rows.
--   SELECT t.reference, t.status, t.business_partner_id
--     FROM public.property_transfers t
--    WHERE t.business_partner_id IS NOT NULL
--      AND NOT EXISTS (SELECT 1 FROM public.transfer_access_grants g
--                       WHERE g.transfer_id = t.id
--                         AND g.firm_id = t.business_partner_id
--                         AND g.revoked_at IS NULL
--                         AND (g.expires_at IS NULL OR g.expires_at > now()));
--
--   -- 2. What this run repaired, and for whom.
--   SELECT f.name, count(*) AS granted
--     FROM public.transfer_access_grants g
--     JOIN public.firms f ON f.id = g.firm_id
--    WHERE g.note LIKE 'Backfilled (091)%'
--    GROUP BY f.name;
--
--   -- 3. No transfer ends up with two live grants to the same firm.
--   SELECT transfer_id, firm_id, count(*)
--     FROM public.transfer_access_grants
--    WHERE revoked_at IS NULL
--    GROUP BY transfer_id, firm_id HAVING count(*) > 1;   -- expect 0 rows
--
-- THEN, IN THE APP: sign in as the partner firm. /partner/transfers should show
-- every transfer /admin/firms/<id> lists for it — 14, not 9.
--
-- ROLLBACK (removes only what this migration inserted)
--   DELETE FROM public.transfer_access_grants
--    WHERE note LIKE 'Backfilled (091)%';
-- ============================================================================
