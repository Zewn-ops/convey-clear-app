-- ============================================================================
-- 052 — can_access_transfer() reads the grants
-- ============================================================================
-- 🔴 THE BEHAVIOUR-CHANGING ONE. 051 is inert; this is the flip.
--
-- PRECONDITIONS — 051's backfill verified row for row, in BOTH directions:
--   every business_partner_id pointer has a live grant   (else access NARROWS)
--   every live grant has a matching pointer              (else access WIDENS)
-- The second is the dangerous one and is the easier to forget.
--
-- WHAT CHANGES
--   A firm reaches a transfer because a LIVE GRANT says so, not because a
--   column happens to match. Same set today, by construction — the backfill
--   made the grants mirror the pointers exactly — so this flip is invisible on
--   the day it runs and only diverges once someone revokes.
--
--   Staff access is untouched.
--
-- WHAT IT UNLOCKS
--   Revocation that survives a reopened transfer. Inferring "closed, therefore
--   no access" from status would hand the attorney their access back the moment
--   a registered transfer was reopened. A revoked_at row does not move.
--
--   Two firms on one transfer, and a firm replaced mid-transaction with both
--   periods on the record.
--
-- ⚠️ can_access_transfer() is defined ONLY in 026 — checked before rewriting,
-- because 049 shipped an access regression by rebuilding a function from 006
-- when 014 had redefined it. Verify before every such rewrite:
--   grep -ln "FUNCTION public.<name>" supabase/migrations/*.sql
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.can_access_transfer(t_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT app_is_staff()
      OR (app_user_partner_id() IS NOT NULL
          AND EXISTS (SELECT 1 FROM public.transfer_access_grants g
                      WHERE g.transfer_id = t_id
                        AND g.firm_id = app_user_partner_id()
                        AND g.revoked_at IS NULL));
$$;

COMMENT ON FUNCTION public.can_access_transfer(uuid) IS
  'Staff, or a firm holding a LIVE grant on this transfer. Reads '
  'transfer_access_grants as of 052; property_transfers.business_partner_id is '
  'no longer consulted for access, though it is still written as the current '
  'primary-firm pointer.';

COMMIT;

-- ============================================================================
-- VERIFY — by impersonation against a baseline captured BEFORE running this.
--
--   partner: transfers, transfer_parties and transfer_documents counts must be
--            IDENTICAL to the pre-052 numbers. Any movement means the backfill
--            was short, not that the policy is wrong.
--   staff:   unchanged.
--
-- Then prove the thing the migration exists for:
--
--   -- revoke, and watch the transfer leave that firm's view
--   UPDATE transfer_access_grants SET revoked_at = now(), revoked_reason = 'test'
--    WHERE transfer_id = '<id>' AND revoked_at IS NULL;
--   -- re-count as the partner: one fewer transfer, and its parties and
--   -- documents go with it, because both route through this same helper
--
--   -- and that reopening does NOT restore it
--   UPDATE property_transfers SET status = 'open' WHERE id = '<id>';
--   -- re-count: still hidden. That is the whole point.
--
-- ROLLBACK — restores 026 verbatim. Safe while 051's table exists.
--   CREATE OR REPLACE FUNCTION public.can_access_transfer(t_id uuid)
--   RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
--     SELECT app_is_staff()
--         OR (app_user_partner_id() IS NOT NULL
--             AND EXISTS (SELECT 1 FROM public.property_transfers t
--                         WHERE t.id = t_id
--                           AND t.business_partner_id = app_user_partner_id()));
--   $$;
-- ============================================================================
