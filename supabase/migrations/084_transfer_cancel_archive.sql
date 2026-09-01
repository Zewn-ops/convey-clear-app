-- =====================================================================
-- 084 — cancelling and archiving a transfer
-- =====================================================================
-- Zewn, 2026-09-01, after cleaning test data by hand:
--   "there's no way to delete or cancel a transfer in the app ... the
--   moment a real firm mistypes a reference, staff will be stuck and
--   I'll be writing SQL against live client data."
--
-- api/admin/property-transfers has always said there is no DELETE, and
-- that stays true. A transfer carries matters, documents, a conversation
-- and a firm's access; deleting one is not tidying, it is destroying a
-- record that a client and an attorney also remember. So the answer is
-- a STATE, not a delete.
--
-- ---------------------------------------------------------------------
-- 🔴 CANCELLED AND ARCHIVED ARE DIFFERENT EVENTS. Conflating them is
--    how the record ends up lying.
-- ---------------------------------------------------------------------
--   CANCELLED — the transaction died. The sale fell through, the parties
--     walked. It genuinely happened, and the firm and the client should
--     go on seeing it, with the reason. It stops being live work; it
--     does not stop being true.
--
--   ARCHIVED — the transfer should never have existed. A typo, a
--     duplicate, a test. There is nothing for a client to be told about
--     because from their side nothing ever happened. Staff keep it (so
--     the audit trail survives) and everyone else stops seeing it.
--
--   'cancelled' already existed and was settable from a dropdown on the
--   Edit screen, with no reason recorded and no effect on any list.
--   'archived' is new. Both now carry a reason and a timestamp.
--
-- ADDITIVE. No existing row changes. Safe to apply before its code — an
-- unused status value and three null columns change no behaviour.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. 'archived' joins the vocabulary (026, extended by 083)
-- ---------------------------------------------------------------------
ALTER TABLE public.property_transfers
  DROP CONSTRAINT IF EXISTS property_transfers_status_check;

ALTER TABLE public.property_transfers
  ADD CONSTRAINT property_transfers_status_check
  CHECK (status IN (
    'draft', 'open', 'registered', 'cancelled', 'on_hold', 'archived'
  ));

-- ---------------------------------------------------------------------
-- 2. Why, and when, and by whom
-- ---------------------------------------------------------------------
-- A status change that loses a transaction from every working list is
-- not something to record as a bare enum. 055 already learned this with
-- decline_reason: the reason is the only part anyone asks about later.
ALTER TABLE public.property_transfers
  ADD COLUMN IF NOT EXISTS status_reason     text,
  ADD COLUMN IF NOT EXISTS status_changed_at timestamptz,
  ADD COLUMN IF NOT EXISTS status_changed_by uuid
    REFERENCES public.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.property_transfers.status_reason IS
  'Why this transfer was cancelled or archived, in the words of the '
  'staff member who did it. Shown to the firm on a cancellation; '
  'staff-only on an archive, because an archived transfer is not '
  'shown to the firm or client at all.';

-- ---------------------------------------------------------------------
-- 3. What each audience sees
-- ---------------------------------------------------------------------
-- 🔒 A client sees a CANCELLED transfer and does not see an ARCHIVED
--    one. Losing a sale is news they are owed; a transfer that was
--    opened by mistake is not a thing that happened to them.
--
-- Restated in full rather than patched, because this view's column list
-- and WHERE clause together are the entire client boundary (062, 077,
-- 083). The next person to widen it should have to do so deliberately.
DROP VIEW IF EXISTS public.client_transfers;

CREATE VIEW public.client_transfers
WITH (security_invoker = off) AS
SELECT
  t.id,
  t.reference,
  t.property_description,
  t.municipality,
  t.status,
  t.property_id,
  t.purchase_price,
  t.created_at,
  t.updated_at
FROM public.property_transfers t
WHERE public.client_can_view_transfer(t.id)
  AND t.status NOT IN ('draft', 'archived');

COMMENT ON VIEW public.client_transfers IS
  'A client''s own property transfers, limited to the fields agreed '
  'for client visibility (2026-08-11; purchase_price 2026-08-31; '
  'drafts excluded 083; archived excluded 084). EXCLUDED ON PURPOSE: '
  'business_partner_id, estate_agent_partner_id, '
  'designated_member_id, notes, status_reason, and every transfer '
  'whose status is draft or archived.';

REVOKE ALL ON public.client_transfers FROM PUBLIC;
REVOKE ALL ON public.client_transfers FROM anon;
GRANT SELECT ON public.client_transfers TO authenticated;

-- ---------------------------------------------------------------------
-- 4. The firm does not see an archived transfer either
-- ---------------------------------------------------------------------
-- Access comes from a grant row (052). Rather than deleting the grant —
-- which would be indistinguishable from a revocation and would lose the
-- fact that the firm once had access — the partner-side reads filter on
-- status in the application. Recorded here so the decision is findable:
-- an archived transfer keeps its grant and stops being listed.
--
-- ⚠️ NOT a security boundary. A firm that kept the URL can still open an
-- archived transfer, exactly as it could a cancelled one. That is
-- deliberate: it is their transaction, and hiding a record from the
-- people it belongs to is a different product decision from tidying a
-- work queue. If that ever needs to change, it changes in RLS, not in a
-- list filter.

COMMIT;

-- VERIFY
--
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conname = 'property_transfers_status_check';
--
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'client_transfers' ORDER BY column_name;
--   -- 9 columns, unchanged
--
--   SELECT count(*) FROM public.client_transfers
--    WHERE status IN ('draft', 'archived');   -- 0
