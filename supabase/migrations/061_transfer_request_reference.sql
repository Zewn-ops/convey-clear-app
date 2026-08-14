-- ============================================================================
-- 061 — the firm's transfer reference is MANDATORY, and it is the real one
-- ============================================================================
-- Meeting 2026-08-11, Decisions: "Property Description and Transfer Reference
-- are set as mandatory fields for all property transfer requests", and Details
-- §78: "The participants agreed that property descriptions and transfer
-- references must be mandatory fields for attorneys submitting requests. Zuaan
-- Holl noted that the transfer reference functions as a unique identifier."
--
-- Confirmed by Zewn 2026-08-14: "the transfer reference is their unique code and
-- it is what we use to title the property transfer."
--
-- 🔧 THIS SETTLES A CONTRADICTION IN THE NOTES, IN FAVOUR OF §78.
--   Details §74 and §98 describe ConveyClear staff "assigning a transfer
--   reference" at approve time. Those are narrations of the demo as it worked on
--   the day, not decisions — §78 is the decision, and it is the one that stands.
--   So `suggested_reference` is no longer a suggestion: it is the reference,
--   supplied by the firm, and staff override it only to fix a clash or a typo.
--
-- ⚠️ THE COLUMN NAME NOW UNDERSELLS IT. Renaming `suggested_reference` →
--   `reference` would be honest and Postgres tracks policies and constraints by
--   OID so the rename is cheap — but it touches five call sites the day before a
--   client meeting, for no behavioural gain. Left deliberately, with the comment
--   below carrying the truth. Rename when the branch is not about to be demoed.
--
-- WHY `NOT VALID` AND NOT A PLAIN `NOT NULL`
--   All five rows on staging predate this rule and every one has a NULL
--   reference (four approved, one declined — none pending). A plain NOT NULL
--   fails on apply, and backfilling them would mean inventing a file reference
--   that no firm ever supplied — fabricated data, in the one column whose whole
--   job is to be the firm's real identifier.
--
--   NOT VALID is exactly "from this point forward": every INSERT and UPDATE is
--   checked, the existing rows are left alone and honest. If someone later
--   establishes what those five should have been, backfill and then run
--   `VALIDATE CONSTRAINT` — no second migration shape needed.
--
-- WHY NO UNIQUE CONSTRAINT HERE
--   `property_transfers.reference` is already globally unique, and that is the
--   table where a collision actually matters. Whether the FIRM's code should be
--   unique globally or only per firm is genuinely unresolved — two firms can
--   legitimately both run a file "2026/001" — so the stricter reading must not
--   be frozen into the schema before it is asked. The API pre-checks and returns
--   a sentence naming the clash; the constraint on property_transfers is the
--   backstop. See the note in api/partner/transfer-requests/route.ts.
-- ============================================================================

BEGIN;

ALTER TABLE public.transfer_requests
  DROP CONSTRAINT IF EXISTS transfer_requests_reference_required;

ALTER TABLE public.transfer_requests
  ADD CONSTRAINT transfer_requests_reference_required
  CHECK (suggested_reference IS NOT NULL AND btrim(suggested_reference) <> '')
  NOT VALID;

COMMENT ON COLUMN public.transfer_requests.suggested_reference IS
  'The FIRM''S OWN file reference (e.g. SH-2026-0417) and, since the 2026-08-11 '
  'decision, MANDATORY — it becomes the reference of the transfer created on '
  'approval. Named "suggested" from 055, when the firm only proposed one; the '
  'name is now historical. Staff may override it at approve time to resolve a '
  'clash with an existing transfer, not as a matter of course.';

COMMIT;

-- ============================================================================
-- VERIFY
--
--   -- the five legacy rows are untouched and still readable
--   SELECT count(*) FROM transfer_requests WHERE suggested_reference IS NULL;  → 5
--
--   -- a new request without a reference is REFUSED
--   INSERT INTO transfer_requests (firm_id, property_description)
--   VALUES ('<a firm>', 'ERF 1 Nowhere');
--        → transfer_requests_reference_required
--
--   -- whitespace does not satisfy it either
--   INSERT INTO transfer_requests (firm_id, property_description, suggested_reference)
--   VALUES ('<a firm>', 'ERF 1 Nowhere', '   ');
--        → transfer_requests_reference_required
--
--   -- a real one is accepted
--   INSERT INTO transfer_requests (firm_id, property_description, suggested_reference)
--   VALUES ('<a firm>', 'ERF 1 Nowhere', 'TEST-061');
--
-- ONCE THE LEGACY ROWS ARE BACKFILLED (if they ever are)
--   ALTER TABLE public.transfer_requests
--     VALIDATE CONSTRAINT transfer_requests_reference_required;
--
-- ROLLBACK
--   ALTER TABLE public.transfer_requests
--     DROP CONSTRAINT IF EXISTS transfer_requests_reference_required;
-- ============================================================================
