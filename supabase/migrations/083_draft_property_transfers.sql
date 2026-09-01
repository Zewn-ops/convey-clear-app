-- ============================================================================
-- 083 — a transfer request creates the transfer, in DRAFT
-- ============================================================================
-- Jukka meeting, 2026-09-01.
--
--   Zewn: "an attorney sends through a request which creates the property
--   transfer box. It has the documents in. It has the buyer and the seller
--   party. It has that particular attorney linked as the attorney for the
--   transfer. And then instead of us approving it before it gets created, it
--   gets created in a draft state and then we approve it."
--   Jukka: "That's fine. … Perfect."
--
--   The reason, in Zewn's words: "they can send through the request, create the
--   draft transfer as an attorney, and then maybe they're waiting on one or two
--   documents to still come through … before ConveyClear has been able to
--   approve that transfer, they can still go in and upload to that transfer
--   while it's in draft state."
--
-- WHAT CHANGES
--   `property_transfers.status` gains 'draft'. A request now builds the whole
--   transfer immediately — parties, checklist, access grant — and approval flips
--   draft → open instead of being the moment of creation.
--
-- ---------------------------------------------------------------------------
-- 🔴 WHAT A DRAFT MUST NOT DO, AND WHY THIS FILE IS MOSTLY ABOUT THAT
-- ---------------------------------------------------------------------------
-- A draft is a transfer the firm can see and write to BEFORE ConveyClear has
-- agreed to work it. Three things follow, and each is enforced here rather than
-- in the application:
--
--   1. A CLIENT MUST NOT SEE IT. `client_transfers` (062, widened by 077) is a
--      definer view whose WHERE clause is its entire security boundary. A draft
--      is an unapproved instruction from an attorney; showing a seller "your
--      transfer" before we have accepted it announces work we have not agreed
--      to do, on a deal that may never happen. The view now excludes drafts.
--
--   2. IT MUST NOT COUNT AS LIVE WORK. Nothing here enforces that — the admin
--      queue filters in code — but it is the reason `draft` is a status rather
--      than a boolean: every list that already groups by status gets the
--      distinction for free, and a draft cannot be silently treated as open by
--      code that forgot a flag.
--
--   3. THE FIRM'S ACCESS IS THE ORDINARY ONE. Access comes from a
--      `transfer_access_grants` row (052), written when the draft is created.
--      No new policy: a firm reaching its own draft is the same rule as a firm
--      reaching its own transfer, and inventing a second path would be a second
--      thing to get wrong.
--
-- ADDITIVE. Existing rows keep their status; nothing is backfilled. Safe to
-- apply before its code — an unused status value changes no behaviour.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. 'draft' joins the status vocabulary (026)
-- ---------------------------------------------------------------------------
ALTER TABLE public.property_transfers
  DROP CONSTRAINT IF EXISTS property_transfers_status_check;

ALTER TABLE public.property_transfers
  ADD CONSTRAINT property_transfers_status_check
  CHECK (status IN ('draft', 'open', 'registered', 'cancelled', 'on_hold'));

COMMENT ON COLUMN public.property_transfers.status IS
  'draft = requested by a firm and not yet approved by ConveyClear. The '
  'firm may read it and upload to it; a CLIENT cannot see it at all '
  '(client_transfers excludes drafts) and it is not live work. Approval '
  'moves it to open. Added 2026-09-01 on the Jukka call.';

-- ---------------------------------------------------------------------------
-- 2. Clients never see a draft
-- ---------------------------------------------------------------------------
-- Rewritten in full rather than patched: the column list IS the decision about
-- what a client may see (062, 077), so it is restated here so that the next
-- person to widen it has to do so deliberately.
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
  -- 🔒 083. An unapproved instruction from an attorney is not something to
  -- show a seller as "your transfer".
  AND t.status <> 'draft';

COMMENT ON VIEW public.client_transfers IS
  'A client''s own property transfers, limited to the fields agreed for '
  'client visibility (2026-08-11, extended 2026-08-31 with purchase_price, '
  'drafts excluded 2026-09-01). EXCLUDED ON PURPOSE: business_partner_id, '
  'estate_agent_partner_id, designated_member_id, notes, and every '
  'transfer whose status is draft.';

REVOKE ALL ON public.client_transfers FROM PUBLIC;
REVOKE ALL ON public.client_transfers FROM anon;
GRANT SELECT ON public.client_transfers TO authenticated;

COMMIT;

-- VERIFY
--
--   -- the status vocabulary now has five values
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conname = 'property_transfers_status_check';
--
--   -- the view still exposes exactly nine columns, and no draft
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'client_transfers' ORDER BY column_name;
--   SELECT count(*) FROM public.client_transfers WHERE status = 'draft';  -- 0
