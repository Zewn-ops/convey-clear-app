-- ============================================================================
-- 089 — sending a request BACK, instead of turning it down
--
-- Jukka, in person 2026-09-02, on what happens between a request arriving and
-- being approved:
--
--   "They need to submit the FICA documents for the seller and the buyer, right?
--    Because then we can actually do something during our send-for-approval time
--    period. We can have our staff double check that the details that they typed
--    in is actually corresponding with their supporting documents. If not, we can
--    TEMPORARILY DECLINE their request and give a reason to say that information
--    is not reflecting correctly. Or let's say they put in a six instead of a
--    nine, we can fix that and we can just approve it."
--
-- 🔴 "TEMPORARILY DECLINE" IS NOT `declined`. 055 made declining terminal on
-- purpose — the firm is told why and the request is over. What Jukka described
-- is the opposite: the request is alive, the firm is expected to act, and it
-- comes back. Filing that as `declined` would be a lie in the record and, worse,
-- a dead end in the portal: 078's UPDATE policy lets a firm edit a `draft` and
-- nothing else, so a declined request can never be corrected. The attorney would
-- have to lodge a second request and re-type everything.
--
-- Hence a fourth live state. `changes_requested` is a request that has been
-- READ, has a reason attached, and is back with the firm.
--
-- WHY NOT JUST FLIP IT BACK TO `draft`
--   1. 078's coherence CHECK says a draft has no reviewer and no transfer. A
--      returned request has both — it was reviewed, and since 083 its draft
--      transfer already exists. Bending draft to fit would delete the record of
--      who looked at it.
--   2. Staff cannot SEE drafts (078, deliberately — a draft is the firm's
--      private working copy). A returned request must stay visible to staff:
--      ConveyClear asked for the change and has to be able to see whether it
--      came back.
--   3. "Nobody has sent this yet" and "we sent it back to you" are different
--      sentences to put in front of an attorney.
--
-- ADDITIVE. The new state is opt-in — nothing writes it until the code does, and
-- every existing row keeps the status it has.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. The state
-- ---------------------------------------------------------------------------
ALTER TABLE public.transfer_requests
  DROP CONSTRAINT IF EXISTS transfer_requests_status_check;

ALTER TABLE public.transfer_requests
  ADD CONSTRAINT transfer_requests_status_check
  CHECK (status IN ('draft', 'pending', 'changes_requested', 'approved', 'declined'));

-- 🔴 A SECOND SILENT REFUSAL, FOUND WHILE WRITING THIS, AND FIXED HERE.
--
-- 078 says a `pending` request has `transfer_id IS NULL`. 083, three migrations
-- later, made a SUBMITTED request create its transfer immediately in draft — so
-- the partner route writes that id back onto a row that is already `pending`,
-- and this constraint has been rejecting the write with a 23514 ever since. The
-- route logs the failure and carries on (it is deliberately best-effort), so
-- nothing surfaced; approval then falls through to the "adopt an existing
-- unlinked draft by reference" path, which was built on 2026-09-01 as a REPAIR
-- for rows written during a bug and has quietly been the normal case since.
--
-- Same shape as the 409 that day and as 085 the day after: a rule written for
-- one version of a flow, still refusing a later one, in silence. The fix is to
-- say what is now true — a submitted request owns a draft transfer.
--
-- The `changes_requested` branch below MUST carry a reviewer, a review time and
-- a reason: being sent back without being told why is the failure this state
-- exists to prevent. Its `transfer_id` is unconstrained for the same reason as
-- pending's — a request returned today has one, one returned from before 083
-- does not, and both are legitimate.
ALTER TABLE public.transfer_requests
  DROP CONSTRAINT IF EXISTS transfer_requests_outcome_coherent;

ALTER TABLE public.transfer_requests
  ADD CONSTRAINT transfer_requests_outcome_coherent CHECK (
    (status = 'draft'
       AND reviewed_at IS NULL AND transfer_id IS NULL)
    -- No transfer_id clause: since 083 a submitted request has a draft transfer.
 OR (status = 'pending'
       AND reviewed_at IS NULL)
 OR (status = 'changes_requested'
       AND reviewed_at IS NOT NULL
       AND reviewed_by IS NOT NULL
       AND decline_reason IS NOT NULL
       AND btrim(decline_reason) <> '')
 OR (status = 'approved'
       AND reviewed_at IS NOT NULL AND transfer_id IS NOT NULL)
 OR (status = 'declined'
       AND reviewed_at IS NOT NULL)
  ) NOT VALID;

COMMENT ON COLUMN public.transfer_requests.decline_reason IS
  'Why a request was declined (055) or sent back for changes (089). The same '
  'column because it answers the same question — what the firm is being told — '
  'and status says which of the two happened.';

-- ---------------------------------------------------------------------------
-- 2. Who may do what with it
-- ---------------------------------------------------------------------------

-- Reading. 078's rule, plus: a returned request is NOT a private draft, so the
-- staff exclusion must not swallow it. Only `draft` stays hidden from staff.
DROP POLICY IF EXISTS transfer_requests_read ON public.transfer_requests;
CREATE POLICY transfer_requests_read ON public.transfer_requests
  FOR SELECT TO authenticated
  USING (
    (public.app_is_staff() AND status <> 'draft')
    OR firm_id = public.app_user_partner_id()
  );

-- 🔴 THE POLICY THAT MAKES THE STATE USEFUL. 078 let a firm edit a `draft` and
-- move it to `draft` or `pending`. A returned request needs exactly the same
-- freedom — correct it and send it back — and nothing more: it may become
-- `pending` again, or stay where it is while they gather the document.
--
-- What a firm still cannot do, unchanged: touch a `pending` request (we may
-- already be acting on it), reopen an `approved` or `declined` one, or move
-- anything INTO `changes_requested`. Returning a request is ConveyClear's act,
-- and the WITH CHECK is what says so.
DROP POLICY IF EXISTS transfer_requests_firm_draft_update
  ON public.transfer_requests;
CREATE POLICY transfer_requests_firm_draft_update
  ON public.transfer_requests
  FOR UPDATE TO authenticated
  USING (
    firm_id = public.app_user_partner_id()
    AND status IN ('draft', 'changes_requested')
  )
  WITH CHECK (
    firm_id = public.app_user_partner_id()
    AND status IN ('draft', 'pending')
  );

-- Deleting stays draft-only. A request ConveyClear has read and responded to is
-- not the firm's to erase, even when the answer was "fix this".
DROP POLICY IF EXISTS transfer_requests_firm_draft_delete
  ON public.transfer_requests;
CREATE POLICY transfer_requests_firm_draft_delete
  ON public.transfer_requests
  FOR DELETE TO authenticated
  USING (
    firm_id = public.app_user_partner_id()
    AND status = 'draft'
  );

COMMIT;

-- ============================================================================
-- VERIFY (run after COMMIT)
--
--   -- the state exists and demands a reason
--   UPDATE transfer_requests SET status='changes_requested', reviewed_at=now(),
--          reviewed_by='<staff user id>', decline_reason=NULL
--    WHERE id='<a pending request>';
--   -- expect: transfer_requests_outcome_coherent violated
--
--   -- with a reason, it goes through
--   UPDATE transfer_requests SET status='changes_requested', reviewed_at=now(),
--          reviewed_by='<staff user id>',
--          decline_reason='ID number does not match the certified copy'
--    WHERE id='<a pending request>';                        -- expect: OK
--
--   -- the firm can now edit it and send it back (impersonate the firm)
--   UPDATE transfer_requests SET seller_id_number='...', status='pending'
--    WHERE id='<that row>';                                 -- expect: 1 row
--
--   -- and staff can still SEE it while it sits with the firm (impersonate staff)
--   SELECT status FROM transfer_requests WHERE id='<that row>';
--
--   -- what must still be refused, as the firm:
--   UPDATE transfer_requests SET status='changes_requested' WHERE id='<own draft>';
--   -- expect: 0 rows (WITH CHECK)
--
--   -- 🔴 AND THE ONE THAT WAS SILENTLY FAILING. Submit a request as a firm,
--   -- then check the link the route writes immediately afterwards:
--   SELECT id, status, transfer_id FROM transfer_requests
--    ORDER BY created_at DESC LIMIT 1;
--   -- BEFORE 089: transfer_id NULL on every pending row, because the write was
--   --             refused by the old constraint and only logged.
--   -- AFTER  089: transfer_id set. Approval then takes the fast path instead of
--   --             the adopt-by-reference repair.
-- ============================================================================
