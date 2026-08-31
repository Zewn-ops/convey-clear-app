-- ============================================================================
-- 080 — the buyer details eTshwane actually demands
-- ============================================================================
-- From the handwritten notes transcribed 2026-08-31 (§11 / §5.12), and from the
-- eTshwane "Purchaser details" screenshot taped to the City of Tshwane sheet.
--
-- Zewn: "we also need to expand on the buyer and seller details. specifically
-- the buyer details. in order for us to do an RCA (rates clearance application)
-- for the buyer during a COO, we need a bunch of additional info for COT
-- (etshwane login details provided for reference) because they are reqyuired on
-- the etshwane portal which is the councils official portal."
--
-- 🟢 THE FIELD LIST IS NOT INFERRED. It is the council's own form, photographed
--   with every field ticked or struck by hand:
--
--     KEEP  Purchaser Type · Title · Initials · Surname · Language of
--           Communication · Nationality · ID Type · ID Number · Marital Status
--           · Contact number · Street name · Street number · Suburb · City ·
--           Postal Code
--     DROP  Alternative number · Communication Preference ("only email/sms")
--           · PO Box · PO Box City · PO Box Postal Code
--
--   Surname, ID number and contact number already exist on `clients`
--   (001, 023). Everything below is what is genuinely missing.
--
-- ---------------------------------------------------------------------------
-- 🔴 WHY THE ADDRESS IS SPLIT, WHEN physical_address ALREADY EXISTS
-- ---------------------------------------------------------------------------
--   `clients.physical_address` is one free-text column, and ficaFields() hints
--   "Street, suburb, city". The council portal has five separate boxes and will
--   not take a paragraph. Splitting one on delimiters to fill them is the same
--   guess that 023 made on names and §4.2 had to undo — "12A Oak Avenue,
--   Waterkloof Ridge, Pretoria" has no reliable seam.
--
--   So the parts are their own columns, physical_address stays exactly as it
--   is, and NOTHING IS BACKFILLED FROM IT. A client captured before this keeps
--   the paragraph; a client captured for an RCA gets the parts. Same reasoning
--   as 076 and 079: a guess that is invisible when wrong is worse than a blank.
--
-- ---------------------------------------------------------------------------
-- 🔴 EVERY COLUMN IS NULLABLE, AND NONE IS REQUIRED HERE
-- ---------------------------------------------------------------------------
--   These are required by ONE council, for ONE service stage, for ONE party.
--   Marking them required on `clients` would mark every client in the database
--   incomplete overnight — including the ones on a CoE transfer, where the
--   sheet asks for markedly less of the buyer.
--
--   So the requirement lives where the other per-council differences live:
--   `Council.prc.RCA.fields` in src/lib/councils. The columns exist for
--   everyone; only City of Tshwane asks for them, and only on an RCA.
--
-- 🔒 NOT ADDED, DELIBERATELY: anything resembling the eTshwane login. Zewn's
--   own note says the credentials were provided "for reference" -- to show
--   which fields the portal demands. Council logins already have a home
--   (`municipal_username` / `municipal_password`, sensitive and staff-only,
--   and 074 for the firm's own staff). This migration adds none.
-- ============================================================================

BEGIN;

ALTER TABLE public.clients
  -- Named on the council's own form.
  ADD COLUMN IF NOT EXISTS title           text,
  ADD COLUMN IF NOT EXISTS initials        text,
  ADD COLUMN IF NOT EXISTS nationality     text,
  ADD COLUMN IF NOT EXISTS id_type         text,
  ADD COLUMN IF NOT EXISTS marital_status  text,
  ADD COLUMN IF NOT EXISTS language        text,

  -- The address in the five boxes the portal actually has.
  ADD COLUMN IF NOT EXISTS street_number   text,
  ADD COLUMN IF NOT EXISTS street_name     text,
  ADD COLUMN IF NOT EXISTS suburb          text,
  ADD COLUMN IF NOT EXISTS city            text,
  ADD COLUMN IF NOT EXISTS postal_code     text;

-- The council portal offers a closed list for these two, so a free-text value
-- would fail at submission rather than at capture. Kept deliberately small:
-- these are the options on the form in the photograph.
ALTER TABLE public.clients
  DROP CONSTRAINT IF EXISTS clients_id_type_check;

ALTER TABLE public.clients
  ADD CONSTRAINT clients_id_type_check
  CHECK (id_type IS NULL OR id_type IN ('rsa_id', 'passport'));

ALTER TABLE public.clients
  DROP CONSTRAINT IF EXISTS clients_marital_status_check;

ALTER TABLE public.clients
  ADD CONSTRAINT clients_marital_status_check
  CHECK (
    marital_status IS NULL
    OR marital_status IN ('single', 'married', 'divorced', 'widowed')
  );

COMMENT ON COLUMN public.clients.street_name IS
  'The address in parts, because the eTshwane portal has five separate '
  'boxes and will not take a paragraph. physical_address stays as it is '
  'and is NOT split to fill these -- "12A Oak Avenue, Waterkloof Ridge, '
  'Pretoria" has no reliable seam, and that guess is what 023 made on '
  'names and 4.2 had to undo. Required only for a City of Tshwane RCA; '
  'the requirement lives in src/lib/councils, not on this table.';

COMMENT ON COLUMN public.clients.id_type IS
  'rsa_id or passport -- the two the council form offers. A free-text '
  'value would pass capture and fail at submission to the portal.';

COMMIT;

-- ============================================================================
-- VERIFY
-- ============================================================================
--   SELECT count(*) FROM information_schema.columns
--    WHERE table_name = 'clients'
--      AND column_name IN ('title','initials','nationality','id_type',
--                          'marital_status','language','street_number',
--                          'street_name','suburb','city','postal_code');
--   -- expect: 11
--
--   Nothing was backfilled from physical_address, and that is correct:
--   SELECT count(*) FROM clients WHERE street_name IS NOT NULL;
--   -- expect: 0 immediately after applying
--
--   No existing client became incomplete -- every column is nullable and
--   nothing on this table is newly required:
--   SELECT count(*) FROM clients;   -- unchanged, and all rows still valid
--
--   The closed lists hold:
--   BEGIN;
--     UPDATE clients SET id_type = 'drivers_licence'
--      WHERE id = (SELECT id FROM clients LIMIT 1);
--   ROLLBACK;
--   -- expect: ERROR, clients_id_type_check
--
-- ============================================================================
-- DOWN
-- ============================================================================
--   ALTER TABLE public.clients
--     DROP CONSTRAINT IF EXISTS clients_id_type_check,
--     DROP CONSTRAINT IF EXISTS clients_marital_status_check,
--     DROP COLUMN IF EXISTS title,
--     DROP COLUMN IF EXISTS initials,
--     DROP COLUMN IF EXISTS nationality,
--     DROP COLUMN IF EXISTS id_type,
--     DROP COLUMN IF EXISTS marital_status,
--     DROP COLUMN IF EXISTS language,
--     DROP COLUMN IF EXISTS street_number,
--     DROP COLUMN IF EXISTS street_name,
--     DROP COLUMN IF EXISTS suburb,
--     DROP COLUMN IF EXISTS city,
--     DROP COLUMN IF EXISTS postal_code;
-- ============================================================================
