-- ============================================================================
-- 065 — the attorney's original request stays reachable after approval
-- ============================================================================
-- Zewn, 2026-08-26, walking the dry run:
--
--   "not sure if the information added in the request is visible after we
--    approve the request. We need the request info to be presented to use after
--    the approval. Maybe create a new container just below parties that gives us
--    that info (such as client name cell and email) and we have the option to
--    dismiss it once we have used those details to capture the parties.
--    Otherwise that info disappears and we cant access it again."
--
-- The data was never lost — `transfer_requests` keeps the row and sets
-- `transfer_id` on approval. It was simply never surfaced anywhere: the request
-- queue filters to what is pending, and the transfer page never looked back at
-- where it came from. So the attorney's typed seller and buyer details — often
-- the only contact information anyone has at that point — were reachable only
-- by querying the database by hand.
--
-- This adds the one piece of state the UI needs: whether staff have finished
-- with those details. Dismissal is deliberately a TIMESTAMP and not a boolean,
-- and deliberately not a DELETE:
--
--   · the handover note is provenance. §84 of the same meeting makes the client
--     record canonical and the attorney's input the thing it was derived FROM.
--     Destroying it would destroy the audit trail of who said what.
--   · a timestamp answers "when did we finish with this", which a boolean
--     cannot, and it is reversible — un-dismissing is setting it back to NULL.
--
-- This is also the meeting's next-step §56, "an attorney information section
-- under the parties tab to display details provided by the lawyer" — the same
-- need, arrived at from the other direction.
-- ============================================================================

BEGIN;

ALTER TABLE public.transfer_requests
  ADD COLUMN IF NOT EXISTS details_dismissed_at timestamptz,
  ADD COLUMN IF NOT EXISTS details_dismissed_by uuid REFERENCES public.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.transfer_requests.details_dismissed_at IS
  'When staff marked the attorney-supplied contact details as used up — i.e. the '
  'parties have been captured from them. NULL means still showing on the transfer. '
  'Never destructive: the request row is provenance for where the party data came '
  'from, so it is hidden, not deleted.';

-- Reaching an approved request from its transfer is the whole point, and that
-- lookup is by transfer_id.
CREATE INDEX IF NOT EXISTS idx_transfer_requests_transfer
  ON public.transfer_requests(transfer_id)
  WHERE transfer_id IS NOT NULL;

COMMIT;

-- ============================================================================
-- VERIFY
-- ============================================================================
-- SELECT column_name FROM information_schema.columns
--  WHERE table_name = 'transfer_requests' AND column_name LIKE 'details_%';
