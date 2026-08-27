-- ============================================================================
-- 067 — Supporting transfer documents: say WHOSE document it is
--
-- THE POINT
--   Zewn, 2026-08-27: "we need like a list of other documents like we have on
--   the matters ... then they can specify the type of document. is it a buyer ID
--   or a seller ID or is it a Power of attorney or is it a proof of residence."
--
--   Yesterday's `0b82292` gave the supporting-documents bar three choices:
--   `seller_document`, `buyer_document`, `other`. That answers "whose is it"
--   and throws away "what is it" — a seller's certified ID and a seller's proof
--   of address are the same row to the portal, so the list could not be read at
--   a glance and nothing could ever be checked off. Attorneys therefore had one
--   honest option, `other`, which is the failure it was meant to prevent.
--
--   The two questions are independent, so they get two fields. `document_type`
--   goes back to meaning what the document IS — and reuses the vocabulary the
--   FICA vault already speaks (`id_certified`, `poa`, `proof_of_address`, …), so
--   a document uploaded straight onto the transfer and the same document pulled
--   from a vault are labelled identically. `party_role` says whose it is.
--
-- WHY A ROLE AND NOT A PARTY ID
--   `transfer_parties` rows are richer and would be the tidier FK, but they are
--   created by ConveyClear when it vets the parties (§88), and this list exists
--   precisely so an attorney can upload BEFORE that happens. A role can be
--   answered on the spot by the person holding the file. It also matches the
--   08-24 decision to model a main seller and a main buyer rather than every
--   co-party equally — the same simplification, in the same place.
--
--   NULL is a real answer, not a missing one: the offer to purchase and the
--   municipal account belong to the transaction, not to either side.
--
-- Additive, idempotent, single transaction.
-- ============================================================================

BEGIN;

ALTER TABLE public.transfer_documents
  ADD COLUMN IF NOT EXISTS party_role text;

-- NULL passes a CHECK, which is the behaviour wanted here: "not party-specific"
-- is a legitimate state, so only a WRONG role is rejected.
ALTER TABLE public.transfer_documents
  DROP CONSTRAINT IF EXISTS transfer_documents_party_role_check;
ALTER TABLE public.transfer_documents
  ADD CONSTRAINT transfer_documents_party_role_check
  CHECK (party_role IN ('seller', 'buyer'));

COMMENT ON COLUMN public.transfer_documents.party_role IS
  'Whose document this is on the transaction: seller | buyer | NULL for one that '
  'belongs to the transaction itself (offer to purchase, municipal account). '
  'Deliberately a role and not a transfer_parties FK — attorneys upload before '
  'ConveyClear has vetted and created the party rows.';

-- ----------------------------------------------------------------------------
-- Retire the two-day-old placeholder vocabulary.
--
-- `seller_document` / `buyer_document` shipped on 2026-08-26 and were only ever
-- a way of saying "whose". Now that there is a field for that, they carry their
-- answer across and become `other`, which is what they always meant: a document
-- of unstated kind. Nothing is lost and nothing needs re-uploading.
-- ----------------------------------------------------------------------------
UPDATE public.transfer_documents
   SET party_role = 'seller', document_type = 'other'
 WHERE document_type = 'seller_document';

UPDATE public.transfer_documents
   SET party_role = 'buyer', document_type = 'other'
 WHERE document_type = 'buyer_document';

COMMIT;

-- ============================================================================
-- VERIFY
--   SELECT document_type, party_role, count(*)
--     FROM public.transfer_documents GROUP BY 1, 2 ORDER BY 1, 2;
--   -- no rows may remain with document_type in ('seller_document','buyer_document')
--
-- ROLLBACK
--   ALTER TABLE public.transfer_documents DROP COLUMN IF EXISTS party_role;
--   -- The document_type rewrite is NOT reversible: 'other' is where both values
--   -- already meant to land. Nothing reads the old two.
-- ============================================================================
