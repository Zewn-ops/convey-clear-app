-- ============================================================================
-- 077 — what a transfer page has to answer above the fold
-- ============================================================================
-- From the handwritten notes transcribed 2026-08-31 (§11.6, §11.12, §11.18,
-- §11.21) and the Bert Smith matter cover sheet Zewn photographed.
--
-- Zewn: "the reason i sent you a bert smith matter doc is so you can design the
-- matter and prop trf pages to look like that in terms of layout and
-- information given early on … also we need to make sure we have selling price
-- in there or something of the sort."
--
-- The cover sheet is the firm's own paper index to a transaction, and what it
-- puts at the top is the reference, the two sides, the property and the price.
-- Two of those the portal could not show at all.
--
-- ---------------------------------------------------------------------------
-- 1. purchase_price
-- ---------------------------------------------------------------------------
--   `property_transfers` (026) has never held a price: reference,
--   property_description, municipality, status, the two firm columns, the two
--   client columns, notes, created_by, timestamps. That is the whole table.
--
--   Zewn, asked who may see it: "the sale price can be available to all, its
--   just one number which is purchase price." So NO visibility rule -- staff,
--   the attorney firm and the client all read the same figure, through the
--   policies that already govern the row.
--
--   ⚠️ numeric(14,2), not a float. Money in a float is a rounding bug waiting
--   for a large enough number, and South African property runs to eight
--   figures. The existing money column (matters.deal_value) is numeric(12,2);
--   this is wider because a transfer is the whole transaction rather than one
--   matter's value.
--
-- ---------------------------------------------------------------------------
-- 2. designated_member_id
-- ---------------------------------------------------------------------------
--   Zewn, 2026-08-31: "conveyclear member is one per matter/prop trf. they are
--   the 'designated' member assigned to the matter but other members can also
--   assist if needed."
--
--   Matters have had this since 001 (`current_owner_id`). Transfers have had
--   NOTHING -- no staff owner column at all -- so "who at ConveyClear is on
--   this?" had no answer on the object the whole portal is organised around.
--
--   WHY A COLUMN AND NOT A transfer_parties ROW
--     `transfer_parties` models parties TO THE TRANSACTION, each identified as
--     exactly one of a client, a firm or an inline capture (050). A ConveyClear
--     member is none of those: they are an assignment, not a counterparty.
--     Zewn's rule for that section is "parties should only be targeted toward
--     people making accounts", and the member does have an account -- so the
--     member is DISPLAYED as the fourth block while the column owns the fact.
--
--   ⚠️ DESIGNATION MUST NOT NARROW ACCESS. Other staff can still act; the
--     column records who is responsible, not who is permitted. This is the same
--     warning 059 gives about naming a contact at a firm, and it is why nothing
--     here touches a policy.
-- ============================================================================

BEGIN;

ALTER TABLE public.property_transfers
  ADD COLUMN IF NOT EXISTS purchase_price numeric(14,2),
  ADD COLUMN IF NOT EXISTS designated_member_id uuid
    REFERENCES public.users(id) ON DELETE SET NULL;

-- A negative price is not a discount, it is a typo.
ALTER TABLE public.property_transfers
  DROP CONSTRAINT IF EXISTS property_transfers_purchase_price_check;

ALTER TABLE public.property_transfers
  ADD CONSTRAINT property_transfers_purchase_price_check
  CHECK (purchase_price IS NULL OR purchase_price >= 0);

CREATE INDEX IF NOT EXISTS idx_property_transfers_designated_member
  ON public.property_transfers(designated_member_id)
  WHERE designated_member_id IS NOT NULL;

COMMENT ON COLUMN public.property_transfers.purchase_price IS
  'The purchase price for the transaction. Visible to everyone who '
  'can see the transfer -- staff, the attorney firm and the client '
  'alike (Zewn, 2026-08-31: "the sale price can be available to all, '
  'its just one number which is purchase price"). numeric, never a '
  'float: money in a float is a rounding bug waiting for a large '
  'enough number.';

COMMENT ON COLUMN public.property_transfers.designated_member_id IS
  'The ConveyClear member responsible for this transfer -- one per '
  'transfer, mirroring matters.current_owner_id (001). Designation '
  'does NOT narrow access: other staff can still act, and no policy '
  'reads this column. It records who is responsible, not who is '
  'permitted (Zewn, 2026-08-31: "other members can also assist if '
  'needed").';

-- ---------------------------------------------------------------------------
-- 3. The client sees the price too
-- ---------------------------------------------------------------------------
-- 🔴 THIS PUBLISHES A COLUMN TO CLIENTS, DELIBERATELY, ON AN EXPLICIT
--    DECISION.
--
--   `client_transfers` (062) is a column-limited definer view, and its own
--   comment says: "Adding a column here publishes it to clients; do not widen
--   without checking it against the decision." So here is the decision, in
--   Zewn's words, 2026-08-31:
--
--     "the sale price can be available to all, its just one number which is
--      purchase price"
--
--   Asked specifically who may see it, having been shown that both sides of a
--   transfer read the same page.
--
--   ⚠️ WHAT IS STILL EXCLUDED, AND WHY IT MUST STAY EXCLUDED: the other
--   party, the firm columns, notes, created_by -- and now
--   designated_member_id, which is internal staffing rather than something the
--   client is owed. The view's WHERE clause remains the entire security
--   boundary. The list below is the complete set of columns a client may read;
--   it grows only on a decision like this one.

DROP VIEW IF EXISTS public.client_transfers;

CREATE VIEW public.client_transfers
WITH (security_invoker = off) AS
SELECT
  t.id,
  -- the firm's file reference; how everyone names it
  t.reference,
  t.property_description,
  t.municipality,
  t.status,
  -- reading the property itself stays gated by 056
  t.property_id,
  t.purchase_price,        -- 077, on Zewn's explicit decision (above)
  t.created_at,
  t.updated_at
FROM public.property_transfers t
WHERE public.client_can_view_transfer(t.id);

COMMENT ON VIEW public.client_transfers IS
  'A client''s own property transfers, limited to the fields agreed for '
  'client visibility (2026-08-11, extended 2026-08-31 with '
  'purchase_price). EXCLUDED ON PURPOSE: business_partner_id, '
  'estate_agent_partner_id, seller_client_id, buyer_client_id, notes, '
  'created_by, designated_member_id -- the other party, the internal '
  'firm detail and who at ConveyClear is assigned. Adding a column '
  'here publishes it to clients; do not widen without checking it '
  'against the decision.';

REVOKE ALL ON public.client_transfers FROM PUBLIC;
REVOKE ALL ON public.client_transfers FROM anon;
GRANT SELECT ON public.client_transfers TO authenticated;

COMMIT;

-- ============================================================================
-- VERIFY
-- ============================================================================
--   SELECT column_name, data_type, numeric_precision, numeric_scale
--     FROM information_schema.columns
--    WHERE table_name = 'property_transfers'
--      AND column_name IN ('purchase_price', 'designated_member_id');
--   -- expect: 2 rows; purchase_price numeric(14,2)
--
--   A negative price is refused:
--   BEGIN;
--     UPDATE property_transfers SET purchase_price = -1
--      WHERE id = (SELECT id FROM property_transfers LIMIT 1);
--   ROLLBACK;
--   -- expect: ERROR, property_transfers_purchase_price_check
--
--   Nothing reads designated_member_id for access. This must return 0 rows,
--   now and after any future migration:
--   SELECT polname FROM pg_policy
--    WHERE polrelid = 'public.property_transfers'::regclass
--      AND pg_get_expr(polqual, polrelid) LIKE '%designated_member_id%';
--
--   The client view gained the price and NOTHING else. Compare this list
--   against the comment on the view:
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'client_transfers' ORDER BY column_name;
--   -- expect exactly: created_at, id, municipality, property_description,
--   --   property_id, purchase_price, reference, status, updated_at
--   -- If designated_member_id or any *_client_id appears here, STOP.
--
-- ============================================================================
-- DOWN
-- ============================================================================
--   DROP INDEX IF EXISTS idx_property_transfers_designated_member;
--   ALTER TABLE public.property_transfers
--     DROP CONSTRAINT IF EXISTS property_transfers_purchase_price_check,
--     DROP COLUMN IF EXISTS purchase_price,
--     DROP COLUMN IF EXISTS designated_member_id;
-- ============================================================================
