-- ============================================================================
-- 088 — the transfer request asks for a PARTY, not a name
--
-- Jukka, in person 2026-09-02, on approving a request: "we need to make
-- provision for most of the details when they request … the first name, the
-- surname, the email, the cell phone, the council, all that information."
--
-- And on why a bare name cannot carry it:
--   Zewn:  "we can't do the ID number because if it's a company, which ID
--           number do you put down?"
--   Jukka: "That's what I'm saying. So if they select the seller, they need to
--           have three options. Is it an individual, a business, or a trust?"
--
-- So the entity TYPE is what the request was missing, and everything else hangs
-- off it: an individual has an ID number, a business or a trust has a
-- registration number, and a business also has directors — Jukka, reading a real
-- instruction off his screen: "director name surname of director ID number of
-- director cell phone number of director email address of director."
--
-- WHY THE DETAIL IS WORTH THE FRICTION. Zewn pushed back — "the idea behind the
-- current property transfer request is that it's simple and easy" — and Jukka's
-- answer is the whole reason this migration exists: the details are checked
-- against the FICA documents during approval. "We can have our staff double
-- check that the details that they typed in is actually corresponding with their
-- supporting documents. If not, we can temporarily decline their request … Or
-- let's say they put in a six instead of a nine, we can fix that and approve
-- it." A name with no number cannot be verified against anything.
--
-- ---------------------------------------------------------------------------
-- SHAPE, and why it is not twenty more columns
-- ---------------------------------------------------------------------------
-- Flat columns for the facts that are ONE per party and get queried, searched
-- and CHECKed: entity type, ID number, registration number. JSONB for the two
-- that are genuinely repeating groups — additional email addresses ("in this
-- case, there's three emails for the buyer") and directors, of which a company
-- can have several. Modelling a repeating group as director_1_*, director_2_*
-- is how a schema acquires columns nobody can drop later.
--
-- ---------------------------------------------------------------------------
-- REQUIRED AT SUBMISSION, OPTIONAL WHILE DRAFTING
-- ---------------------------------------------------------------------------
-- Exactly 078's pattern, for exactly 078's reason: a draft that cannot be saved
-- until it is complete is not a draft. Zewn: "we can say that it's required that
-- they enter the email and cell phone number before we approve the transfer. So
-- it'll stay in draft until we have those details."
--
-- ⚠️ The constraints are NOT VALID. Every request lodged before today has a bare
-- name and no type, and validating would refuse to apply against live rows that
-- are already approved. New and edited rows are checked; history is left alone.
--
-- ADDITIVE. Safe to apply before its code — the columns are nullable and the
-- constraints only bite on a row being written as `pending`.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Who each party IS
-- ---------------------------------------------------------------------------
ALTER TABLE public.transfer_requests
  ADD COLUMN IF NOT EXISTS seller_entity_type   text,
  ADD COLUMN IF NOT EXISTS buyer_entity_type    text,
  ADD COLUMN IF NOT EXISTS seller_id_number     text,
  ADD COLUMN IF NOT EXISTS buyer_id_number      text,
  ADD COLUMN IF NOT EXISTS seller_registration_no text,
  ADD COLUMN IF NOT EXISTS buyer_registration_no  text,
  -- Repeating groups. Both default to an empty array rather than NULL, so the
  -- application never has to tell "none" from "not asked".
  ADD COLUMN IF NOT EXISTS seller_extra_emails  jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS buyer_extra_emails   jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS seller_directors     jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS buyer_directors      jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.transfer_requests.seller_entity_type IS
  'individual (natural_person) | business | trust. Decides whether an ID number '
  'or a registration number is the one that must be supplied (088).';
COMMENT ON COLUMN public.transfer_requests.seller_directors IS
  'JSONB array of {name, id_number, cell, email} — a business can have several, '
  'and Jukka reads them off the instruction letter (088).';
COMMENT ON COLUMN public.transfer_requests.seller_extra_emails IS
  'JSONB array of additional addresses. One primary email is asked for inline; '
  'the rest arrive through "Add another email" (088).';

-- The same vocabulary the rest of the schema uses. `natural_person` rather than
-- `individual` on purpose: clients.entity_type has said natural_person since
-- 002, and a request that resolves into a client must not need translating.
ALTER TABLE public.transfer_requests
  DROP CONSTRAINT IF EXISTS transfer_requests_seller_entity_type_check;
ALTER TABLE public.transfer_requests
  ADD CONSTRAINT transfer_requests_seller_entity_type_check CHECK (
    seller_entity_type IS NULL
    OR seller_entity_type IN ('natural_person', 'business', 'trust')
  );

ALTER TABLE public.transfer_requests
  DROP CONSTRAINT IF EXISTS transfer_requests_buyer_entity_type_check;
ALTER TABLE public.transfer_requests
  ADD CONSTRAINT transfer_requests_buyer_entity_type_check CHECK (
    buyer_entity_type IS NULL
    OR buyer_entity_type IN ('natural_person', 'business', 'trust')
  );

-- ---------------------------------------------------------------------------
-- 2. What a SUBMITTED request must carry
-- ---------------------------------------------------------------------------
-- Read as: while drafting, anything goes. On submission, a party that has been
-- NAMED must be complete — name, type, email, cell, and the identifying number
-- its type implies.
--
-- 🔴 "A PARTY THAT HAS BEEN NAMED", not "both parties". 2026-08-11 recorded
-- "Seller / Buyer: Not supplied" as CORRECT — firms supply what they know, and a
-- form that will not submit without the buyer's ID is a form nobody uses. What
-- changed is not that parties became mandatory; it is that a HALF-CAPTURED party
-- is no longer accepted, because half a party cannot be checked against a FICA
-- document.
ALTER TABLE public.transfer_requests
  DROP CONSTRAINT IF EXISTS transfer_requests_seller_complete;
ALTER TABLE public.transfer_requests
  ADD CONSTRAINT transfer_requests_seller_complete CHECK (
    status = 'draft'
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
    status = 'draft'
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

-- The council. Zewn, in the meeting: "We know we need council." It has been
-- optional since 055 and every service in the registry is keyed by it, so a
-- request without one cannot resolve a single document requirement.
ALTER TABLE public.transfer_requests
  DROP CONSTRAINT IF EXISTS transfer_requests_municipality_required;
ALTER TABLE public.transfer_requests
  ADD CONSTRAINT transfer_requests_municipality_required CHECK (
    status = 'draft'
    OR (municipality IS NOT NULL AND btrim(municipality) <> '')
  ) NOT VALID;

COMMIT;

-- ============================================================================
-- VERIFY (run after COMMIT)
--
--   -- a draft may still be as empty as it likes
--   INSERT INTO transfer_requests (firm_id, status, property_description)
--   VALUES ('<firm>', 'draft', NULL);                       -- expect: OK
--
--   -- a submitted request with a half-captured seller is refused
--   UPDATE transfer_requests SET status = 'pending', seller_name = 'Go Property'
--    WHERE id = '<that row>';
--   -- expect: transfer_requests_seller_complete violated
--
--   -- complete it and it goes through
--   UPDATE transfer_requests
--      SET seller_email = 'a@b.co.za', seller_cell = '0820000000',
--          seller_entity_type = 'business', seller_registration_no = '2020/1/07',
--          municipality = 'COJ', suggested_reference = 'X1', status = 'pending',
--          property_description = 'ERF 1'
--    WHERE id = '<that row>';                               -- expect: OK
--
--   -- history is untouched
--   SELECT count(*) FROM transfer_requests WHERE status <> 'draft';
--   -- same before and after; the constraints are NOT VALID by design
-- ============================================================================
