-- ============================================================================
-- 086 — removing a party is ConveyClear's act, not the firm's
--
-- Zewn, 2026-09-02, on the attorney's transfer page: "you can allow the
-- attorney to edit the parties details but not to delete the party from the
-- matter."
--
-- 050 gave transfer_parties four policies that all route through
-- can_access_transfer(), reads and writes alike, on the reasoning that "the firm
-- working a transfer captures its parties". That is right for INSERT and UPDATE
-- and wrong for DELETE:
--
--   · A party is the record of who the transaction was between. Correcting a
--     cell number is bookkeeping; removing the seller is a claim about the deal.
--   · syncTransferFromParty() writes property_transfers.seller_client_id /
--     buyer_client_id off the back of a removal, so a firm deleting a party
--     silently edits the transfer's own columns — the exact write the route has
--     always refused a partner for doing directly (see the note above
--     callerProfile in api/transfer-parties).
--   · There is no undo. An inline capture that is deleted takes its name, email
--     and cell with it, and nothing else in the app holds them.
--
-- So DELETE narrows to staff. The firm keeps INSERT and UPDATE, which is what
-- "edit the parties details but not delete" asks for, and the app hides the bin
-- on the partner portal to match. This is the boundary; that is presentation.
--
-- ADDITIVE AND SAFE TO APPLY ANY TIME — it only ever refuses more than before,
-- and staff (app_is_staff(), which includes super_admin) are unaffected via the
-- existing transfer_parties_staff_all FOR ALL policy. Applying it before its
-- code merely means the partner bin button fails with a 403 instead of being
-- hidden, which is the correct outcome either way.
-- ============================================================================

BEGIN;

-- Was: USING (public.can_access_transfer(transfer_id)) — any firm on the
-- transfer. Now nobody: staff already delete through transfer_parties_staff_all,
-- and a policy that grants nothing extra is clearer than one that looks like it
-- might. Dropping the policy outright would say the same thing, but leaving it
-- named keeps 050's four-policy shape readable and makes the narrowing visible
-- to anyone diffing the schema.
DROP POLICY IF EXISTS transfer_parties_delete ON public.transfer_parties;
CREATE POLICY transfer_parties_delete ON public.transfer_parties FOR DELETE TO authenticated
  USING (public.app_is_staff());

COMMENT ON POLICY transfer_parties_delete ON public.transfer_parties IS
  'Staff only (086). A firm captures and corrects parties but does not remove '
  'them: removal rewrites who the transaction was between and resyncs the '
  'transfer''s own seller/buyer columns.';

COMMIT;

-- ============================================================================
-- VERIFY (run after COMMIT)
--
--   -- one DELETE policy, and it asks app_is_staff()
--   SELECT polname, pg_get_expr(polqual, polrelid) AS using_expr
--     FROM pg_policy
--    WHERE polrelid = 'public.transfer_parties'::regclass
--      AND polcmd = 'd';
--   -- expect: transfer_parties_staff_all  → app_is_staff()
--   --         transfer_parties_delete     → app_is_staff()
--
--   -- INSERT and UPDATE are untouched: both still can_access_transfer()
--   SELECT polname, polcmd, pg_get_expr(polqual, polrelid)
--     FROM pg_policy
--    WHERE polrelid = 'public.transfer_parties'::regclass
--    ORDER BY polname;
-- ============================================================================
