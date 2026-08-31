-- ============================================================================
-- 079 — which director is the representative
-- ============================================================================
-- From the handwritten notes transcribed 2026-08-31 (§11 / §5.14).
--
-- Zewn: "for business entities, we need to make provisions for up to 3
-- directors with the ability to select one of them as the representative", and
-- immediately after: "then the representative is the only one that needs to be
-- vetted (Proof of residence, Cert ID etc)".
--
-- 🟢 HALF OF THIS ALREADY EXISTS. Directors are modelled: `contacts.is_director`
--   (010), read per client by lib/fica.ts, written by the FICA capture route.
--   Nothing here rebuilds that.
--
-- ---------------------------------------------------------------------------
-- 1. is_representative -- and why the partial unique index IS the feature
-- ---------------------------------------------------------------------------
--   "Representative" exists today only in the DOCUMENT vocabulary:
--   `id_certified_representative` ("Representative's Certified ID") is required
--   of a business seller by prcRcfDocs() and by the transfer doc types. So the
--   portal has been asking for the representative's certified ID without ever
--   recording WHICH director that is.
--
--   The constraint is the point, not tidiness. Zewn's second sentence makes the
--   flag decide whose documents are required; with two directors flagged, or
--   none, "is this business FICA-complete" has no answer. A partial unique
--   index on (client_id) WHERE is_representative makes at most one per client
--   representable at all.
--
--   ⚠️ NO CAP OF THREE IN THE DATABASE. Zewn asked for "up to 3 directors", and
--   three is right for the FORM -- it is what a screen should offer. CIPC does
--   not cap directors at three, so a CHECK here would eventually refuse a
--   legitimate company, and a constraint is expensive to undo once rows exist.
--   Three slots in the UI, no ceiling underneath.
--
-- ---------------------------------------------------------------------------
-- 2. first_name / last_name -- a round trip that mangles real names
-- ---------------------------------------------------------------------------
--   `contacts.name` is one column. The FICA capture route writes
--   `${full_name} ${surname}` into it, and toDirectors() splits it back on
--   whitespace, taking the LAST word as the surname. So a director captured
--   correctly as (Jan | van der Merwe) is stored as "Jan van der Merwe" and
--   read back as (Jan van der | Merwe).
--
--   The form already collects the two halves. Only the storage merges them.
--   This is the same defect §4.2 fixed for transfer parties, and the same one
--   023 created for clients by splitting full_name once.
--
--   ⚠️ EXISTING ROWS ARE NOT BACKFILLED. Splitting them here would be the same
--   guess that caused the problem, made permanent -- and this migration has no
--   better source than the string it would be guessing from. The columns stay
--   NULL on old rows and toDirectors() falls back to the split for them, so
--   nothing changes for existing data while every new capture stores the halves
--   exactly as typed. Same reasoning as 076 on doc_class.
--
-- ---------------------------------------------------------------------------
-- 🔴 WHAT THIS MIGRATION DELIBERATELY DOES NOT DO
-- ---------------------------------------------------------------------------
--   It does not change what FICA requires of a business.
--
--   Zewn's "the representative is the only one that needs to be vetted" REDUCES
--   what is collected on a business client -- today client-fica.ts allows one
--   ID per director. That is a compliance position for the firm to hold, not a
--   detail to infer from a note: the transcription itself records it as
--   "Jukka's call to record, not ours to infer".
--
--   So the flag is recorded and surfaced, and the completeness rule is left
--   exactly as it is until Jukka confirms. Nothing silently collects less.
-- ============================================================================

BEGIN;

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS is_representative boolean
    NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name  text;

-- At most one representative per client. THE constraint of this migration:
-- without it the flag cannot answer the question it exists to answer.
CREATE UNIQUE INDEX IF NOT EXISTS uq_contacts_one_representative
  ON public.contacts (client_id)
  WHERE is_representative;

-- Only a director can represent the company.
ALTER TABLE public.contacts
  DROP CONSTRAINT IF EXISTS contacts_representative_is_director;

ALTER TABLE public.contacts
  ADD CONSTRAINT contacts_representative_is_director
  CHECK (NOT is_representative OR is_director);

COMMENT ON COLUMN public.contacts.is_representative IS
  'The one director who represents this business (Zewn, 2026-08-31). At '
  'most one per client -- uq_contacts_one_representative -- because the '
  'flag decides whose certified ID and proof of residence are required, '
  'and two flagged or none leaves that question unanswerable. The '
  'document type id_certified_representative has existed since before '
  'this column: the portal asked for the representative''s ID without '
  'recording who that was.';

COMMENT ON COLUMN public.contacts.first_name IS
  'The name in halves, so it stops being guessed. The capture route used '
  'to merge first + surname into `name` and toDirectors() split it back '
  'on whitespace, turning (Jan | van der Merwe) into (Jan van der | '
  'Merwe). NULL on rows predating 079 -- deliberately not backfilled, '
  'since splitting them is the same guess -- and readers fall back to '
  'splitting `name` for those.';

COMMIT;

-- ============================================================================
-- VERIFY
-- ============================================================================
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'contacts'
--      AND column_name IN ('is_representative','first_name','last_name');
--   -- expect: 3 rows
--
--   Only one representative per client:
--   BEGIN;
--     UPDATE contacts SET is_representative = true
--      WHERE client_id = '<a client with two directors>';
--   ROLLBACK;
--   -- expect: ERROR, uq_contacts_one_representative
--
--   A non-director cannot be the representative:
--   BEGIN;
--     UPDATE contacts SET is_representative = true, is_director = false
--      WHERE id = '<any contact>';
--   ROLLBACK;
--   -- expect: ERROR, contacts_representative_is_director
--
--   Nothing was backfilled, and that is correct:
--   SELECT count(*) FROM contacts WHERE first_name IS NOT NULL;
--   -- expect: 0 immediately after applying
--
-- ============================================================================
-- DOWN
-- ============================================================================
--   DROP INDEX IF EXISTS uq_contacts_one_representative;
--   ALTER TABLE public.contacts
--     DROP CONSTRAINT IF EXISTS contacts_representative_is_director,
--     DROP COLUMN IF EXISTS is_representative,
--     DROP COLUMN IF EXISTS first_name,
--     DROP COLUMN IF EXISTS last_name;
-- ============================================================================
