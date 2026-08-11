-- ============================================================================
-- 059 — the PERSON at the firm, not just the firm
-- ============================================================================
-- Zewn, 2026-08-11, testing on staging:
--
--   "doesn't help that we add a firm but don't know who from the firm is
--    working on the property transfer"
--
--   and, on the estate agent specifically: "it's one of the estate agents
--   handling the matter, not the entire agency."
--
-- Both are the same gap. `transfer_parties` identifies a party as EXACTLY ONE
-- of a client, a firm, or an inline capture (`transfer_parties_one_identity`,
-- 050:66), so there is no way to say "Sterling & Hayes, and Sarah Hayes is the
-- conveyancer on this one".
--
-- WHY NOT A SECOND PARTY ROW
--   A named conveyancer is not another party to the transaction — she is the
--   firm's party, with a face. Modelling her as her own row would mean two
--   `conveyancing_attorney` rows meaning one appointment, and every consumer
--   would have to know which was which.
--
-- WHY BOTH A USER FK AND FREE TEXT — the asymmetry is real, not laziness:
--   attorney firms have portal users (`users.business_partner_id`), so their
--   people are records and can be PICKED. Estate agencies have no portal role
--   at all (026:44), so their agents are not users and there is nothing to
--   point at. One column each, and the CHECK below stops both being set.
--
-- ⚠️ A named contact does NOT narrow access. `can_access_transfer()` grants to
--   the whole firm via a grant row (051/052); naming Sarah does not shut out
--   her colleagues, and nothing here changes that. If "only the named person
--   sees it" is ever wanted, it is a separate decision with its own migration —
--   do not infer it from this column.
-- ============================================================================

BEGIN;

ALTER TABLE public.transfer_parties
  -- The individual, when they are a portal user (attorney firms).
  ADD COLUMN IF NOT EXISTS contact_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,

  -- The individual, when they are not (estate agents, and any firm whose people
  -- have no login yet). Deliberately separate from the inline-capture columns
  -- above: those mean "this party has no record at all", which is a different
  -- statement from "this firm has a record and this is our contact there".
  ADD COLUMN IF NOT EXISTS contact_name  text,
  ADD COLUMN IF NOT EXISTS contact_email text,
  ADD COLUMN IF NOT EXISTS contact_cell  text;

COMMENT ON COLUMN public.transfer_parties.contact_user_id IS
  'The individual at this firm handling the transfer, when they hold a portal '
  'login. Does NOT narrow access — the grant is still firm-wide.';
COMMENT ON COLUMN public.transfer_parties.contact_name IS
  'The individual at this firm, when they have no login (estate agents). Not '
  'the same as the inline-capture full_name, which means the party itself has '
  'no record.';

-- A named contact only means anything on a firm party. On a client or an inline
-- capture the party IS the person, so a second name here would be ambiguous.
ALTER TABLE public.transfer_parties
  DROP CONSTRAINT IF EXISTS transfer_parties_contact_needs_firm;
ALTER TABLE public.transfer_parties
  ADD CONSTRAINT transfer_parties_contact_needs_firm CHECK (
    firm_id IS NOT NULL
    OR (contact_user_id IS NULL
        AND contact_name  IS NULL
        AND contact_email IS NULL
        AND contact_cell  IS NULL)
  );

-- Pick one way of naming them, not both — otherwise two spellings of the same
-- person drift apart and nobody knows which the firm actually reads.
ALTER TABLE public.transfer_parties
  DROP CONSTRAINT IF EXISTS transfer_parties_contact_one_way;
ALTER TABLE public.transfer_parties
  ADD CONSTRAINT transfer_parties_contact_one_way CHECK (
    contact_user_id IS NULL OR contact_name IS NULL
  );

CREATE INDEX IF NOT EXISTS idx_transfer_parties_contact_user
  ON public.transfer_parties (contact_user_id) WHERE contact_user_id IS NOT NULL;

COMMIT;

-- ============================================================================
-- VERIFY
--
--   -- inert on arrival: nothing is named yet
--   SELECT count(*) FROM transfer_parties WHERE contact_user_id IS NOT NULL
--                                            OR contact_name IS NOT NULL;  → 0
--
--   -- a named attorney on a firm party is accepted
--   UPDATE transfer_parties SET contact_user_id = '<a user at that firm>'
--    WHERE role = 'conveyancing_attorney' AND firm_id IS NOT NULL;
--
--   -- a named agent by hand is accepted
--   UPDATE transfer_parties SET contact_name = 'Sarah Nkosi'
--    WHERE role = 'estate_agent' AND firm_id IS NOT NULL;
--
--   -- both at once is refused           → transfer_parties_contact_one_way
--   -- a contact on a CLIENT party is refused → transfer_parties_contact_needs_firm
--   UPDATE transfer_parties SET contact_name = 'nope' WHERE client_id IS NOT NULL;
--
-- ROLLBACK
--   ALTER TABLE public.transfer_parties
--     DROP CONSTRAINT IF EXISTS transfer_parties_contact_needs_firm,
--     DROP CONSTRAINT IF EXISTS transfer_parties_contact_one_way,
--     DROP COLUMN IF EXISTS contact_user_id,
--     DROP COLUMN IF EXISTS contact_name,
--     DROP COLUMN IF EXISTS contact_email,
--     DROP COLUMN IF EXISTS contact_cell;
-- ============================================================================
