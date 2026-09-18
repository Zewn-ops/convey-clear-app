-- ============================================================================
-- 099 — the firm can tell us the sale price when it asks for a transfer
-- ============================================================================
-- WHY
--   077 put purchase_price on property_transfers because the Bert Smith cover
--   sheet leads with it, and it shows on every transfer card. But it could only
--   ever be typed by ConveyClear, on the admin form, AFTER the transfer existed.
--
--   The attorney is the one who knows the number. They have the sale agreement
--   in front of them when they lodge the request; we do not. So every transfer
--   arrived with a blank price and somebody here had to go and ask for it.
--
--   Zewn, 2026-09-18, walking the request form: "I don't see anywhere that we
--   can input the sale price as an attorney when setting up / requesting a prop
--   trf."
--
-- WHAT IT DOES
--   transfer_requests gains the column, and the request → draft-transfer path
--   carries it across (src/lib/transfer-from-request.ts).
--
--   NULLABLE, and no CHECK beyond non-negative. A price is often not final when
--   the instruction is lodged — a sale can be renegotiated after the offer and
--   before registration — so a required field here would collect a confident
--   wrong number instead of an honest blank. The firm can set it later on the
--   transfer itself, which is the other half of this change.
--
-- NUMERIC(12,2) to match property_transfers.purchase_price exactly. A different
-- width would round on the way across, which is the kind of quiet difference
-- 066 is the standing warning about.
-- ============================================================================

BEGIN;

ALTER TABLE public.transfer_requests
  ADD COLUMN IF NOT EXISTS purchase_price NUMERIC(12,2);

ALTER TABLE public.transfer_requests
  DROP CONSTRAINT IF EXISTS transfer_requests_purchase_price_nonneg;
ALTER TABLE public.transfer_requests
  ADD CONSTRAINT transfer_requests_purchase_price_nonneg
  CHECK (purchase_price IS NULL OR purchase_price >= 0);

COMMENT ON COLUMN public.transfer_requests.purchase_price IS
  'Sale price as the firm lodged it (099). Copied onto the draft transfer when '
  'the request creates it. Nullable: the figure is often not final at '
  'instruction, and a required field would collect a guess.';

COMMIT;

-- ============================================================================
-- VERIFY (run after COMMIT)
--
--   -- 1. The column exists and every existing request is unaffected.
--   SELECT count(*) AS requests, count(purchase_price) AS with_price
--     FROM public.transfer_requests;
--
--   -- 2. Same type as the column it feeds, or the value changes in transit.
--   SELECT table_name, numeric_precision, numeric_scale
--     FROM information_schema.columns
--    WHERE column_name = 'purchase_price'
--      AND table_name IN ('transfer_requests', 'property_transfers');
--   -- expect two rows, both 12 / 2
--
-- THEN, IN THE APP: as the firm, request a transfer with a price. Approve it as
-- staff and confirm the figure appears on the transfer without being retyped.
--
-- ROLLBACK
--   ALTER TABLE public.transfer_requests
--     DROP CONSTRAINT IF EXISTS transfer_requests_purchase_price_nonneg,
--     DROP COLUMN IF EXISTS purchase_price;
-- ============================================================================
