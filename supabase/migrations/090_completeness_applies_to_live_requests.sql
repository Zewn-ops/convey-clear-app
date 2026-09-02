-- ============================================================================
-- 090 — completeness is a rule about requests we ACT ON
--
-- 🔴 FOUND BY CLICKING, ten minutes after 088 and 089 went live. Sending a
-- request back for corrections failed with:
--
--     new row for relation "transfer_requests" violates check constraint
--     "transfer_requests_buyer_complete"
--
-- The request in question (`tst1234tst`, lodged during the 2026-09-02 meeting)
-- has a named buyer with no entity type, because it predates 088. Asking the
-- firm to supply that entity type is the entire purpose of the send-back — and
-- the constraint refused it BECAUSE the request is incomplete.
--
-- 088 wrote the exemption as `status = 'draft'`, on the reasoning that a draft
-- is a working copy and everything else has been submitted. That was right when
-- there were four states and only one of them was pre-submission. 089 added a
-- fifth an hour later, and `changes_requested` is the state that exists
-- precisely to hold an incomplete request while the firm fixes it.
--
-- ⚠️ AND IT WAS ALREADY WRONG FOR `declined`, which has existed since 055.
-- Declining an incomplete request would have failed the same way. Nobody hit it
-- because the only declines so far were of complete requests. That is the
-- shape of this bug: a rule written against the state list as it stood, still
-- enforcing itself against a state list that has moved on. The same shape as
-- 085, 087 and 089's `pending`+`transfer_id` fix — four instances in two days.
--
-- SO THE RULE IS RESTATED POSITIVELY, against what it is actually for.
-- Completeness is required of a request ConveyClear is being asked to act on:
--
--   pending   — sitting in the queue, about to be checked against the FICA
--               documents. Jukka's whole reason for the fields.
--   approved  — it became a transfer, so it was good enough to act on.
--
-- and not of one that is with the firm or finished with:
--
--   draft             — never sent.
--   changes_requested — sent back BECAUSE it is not right yet.
--   declined          — we are not acting on it, and never will.
--
-- Naming the two states that require it, rather than the three that do not,
-- means the next state added is exempt by default. That is the safer direction:
-- a new state wrongly exempted shows up as a missing check, while a new state
-- wrongly required shows up as a control that silently refuses to work.
--
-- ADDITIVE AND SAFE. It only ever refuses less than 088 did.
-- ============================================================================

BEGIN;

ALTER TABLE public.transfer_requests
  DROP CONSTRAINT IF EXISTS transfer_requests_seller_complete;

ALTER TABLE public.transfer_requests
  ADD CONSTRAINT transfer_requests_seller_complete CHECK (
    status NOT IN ('pending', 'approved')
    OR seller_name IS NULL
    OR btrim(seller_name) = ''
    OR (
          btrim(coalesce(seller_email, '')) <> ''
      AND btrim(coalesce(seller_cell,  '')) <> ''
      AND seller_entity_type IS NOT NULL
      AND (
            (seller_entity_type = 'natural_person'
             AND btrim(coalesce(seller_id_number, '')) <> '')
         OR (seller_entity_type IN ('business', 'trust')
             AND btrim(coalesce(seller_registration_no, '')) <> '')
      )
    )
  ) NOT VALID;

ALTER TABLE public.transfer_requests
  DROP CONSTRAINT IF EXISTS transfer_requests_buyer_complete;

ALTER TABLE public.transfer_requests
  ADD CONSTRAINT transfer_requests_buyer_complete CHECK (
    status NOT IN ('pending', 'approved')
    OR buyer_name IS NULL
    OR btrim(buyer_name) = ''
    OR (
          btrim(coalesce(buyer_email, '')) <> ''
      AND btrim(coalesce(buyer_cell,  '')) <> ''
      AND buyer_entity_type IS NOT NULL
      AND (
            (buyer_entity_type = 'natural_person'
             AND btrim(coalesce(buyer_id_number, '')) <> '')
         OR (buyer_entity_type IN ('business', 'trust')
             AND btrim(coalesce(buyer_registration_no, '')) <> '')
      )
    )
  ) NOT VALID;

-- Same reasoning for the council: it is required of a request we are asked to
-- act on, not of one sitting with the firm.
ALTER TABLE public.transfer_requests
  DROP CONSTRAINT IF EXISTS transfer_requests_municipality_required;

ALTER TABLE public.transfer_requests
  ADD CONSTRAINT transfer_requests_municipality_required CHECK (
    status NOT IN ('pending', 'approved')
    OR (municipality IS NOT NULL AND btrim(municipality) <> '')
  ) NOT VALID;

COMMIT;

-- ============================================================================
-- VERIFY (run after COMMIT)
--
--   -- the send-back that was refused now goes through
--   UPDATE transfer_requests
--      SET status = 'changes_requested', reviewed_at = now(),
--          reviewed_by = '<staff user id>',
--          decline_reason = 'Buyer needs an entity type and ID number'
--    WHERE suggested_reference = 'tst1234tst';        -- expect: 1 row
--
--   -- and a HALF-CAPTURED party still cannot reach the queue
--   UPDATE transfer_requests SET status = 'pending'
--    WHERE suggested_reference = 'tst1234tst';
--   -- expect: transfer_requests_buyer_complete violated
--
--   -- declining an incomplete request works too (it did not before)
--   SELECT conname, pg_get_constraintdef(oid)
--     FROM pg_constraint
--    WHERE conname IN ('transfer_requests_seller_complete',
--                      'transfer_requests_buyer_complete',
--                      'transfer_requests_municipality_required');
--   -- expect: each begins  CHECK (status <> ALL (ARRAY['pending', 'approved']))
-- ============================================================================
