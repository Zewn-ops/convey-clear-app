-- ============================================================================
-- 055 — transfer_requests: an attorney asks, ConveyClear creates
-- ============================================================================
-- Decision, Meeting 2 (2026-08-06) as answered by Zewn 2026-08-07:
-- "ConveyClear creates the transfer, attorney and client upload docs. Attorney
-- is allowed to request the opening of a transfer via a button that lets them
-- fill in basic details we need from them."
--
-- ⚠️ THIS REVERSES A FEATURE BUILT ON 2026-07-16. `POST /api/partner/transfers`
-- let a firm create its own transfer directly — added because Jukka read the
-- missing path as a permission bug. The 08-06 privacy discussion (§84: firms
-- must not reach other firms' contacts, so CC keeps one vetted client database)
-- moves creation back behind ConveyClear. The old route is disabled rather than
-- deleted, so restoring it is a one-line revert if Jukka disagrees on Tuesday.
--
-- WHY PARTY DETAILS ARE FREE TEXT HERE, NOT FOREIGN KEYS
--   The requesting firm cannot create client records — that is the entire point
--   of routing this through ConveyClear. So a request carries what the attorney
--   KNOWS (a name, an email, a phone number) and ConveyClear turns it into real
--   client records at approval, deduping against the existing database. Putting
--   client_id columns here would require the firm to pick from a client list it
--   is not allowed to browse.
--
-- WHY A TABLE AND NOT AN ENQUIRY
--   An enquiry is a conversation; this is a work item with an outcome that
--   creates a row elsewhere. Keeping the resulting transfer_id on the request is
--   what makes "who asked for this transfer, and when" answerable later.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.transfer_requests (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id      uuid NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
  requested_by uuid REFERENCES public.users(id) ON DELETE SET NULL,

  -- What the firm knows about the transaction.
  property_description text NOT NULL,
  municipality         text,
  suggested_reference  text,

  -- Parties as the attorney knows them. ConveyClear resolves these to real
  -- client records at approval (see the note above).
  seller_name  text,
  seller_email text,
  seller_cell  text,
  buyer_name   text,
  buyer_email  text,
  buyer_cell   text,

  notes text,

  status text NOT NULL DEFAULT 'pending'
           CHECK (status IN ('pending', 'approved', 'declined')),

  -- Outcome. transfer_id is the created transfer; decline carries a reason so
  -- the firm is told why rather than watching a request vanish.
  transfer_id     uuid REFERENCES public.property_transfers(id) ON DELETE SET NULL,
  reviewed_by     uuid REFERENCES public.users(id) ON DELETE SET NULL,
  reviewed_at     timestamptz,
  decline_reason  text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- A decided request must say who decided it; an approved one must point at
  -- what it produced. Catches a half-written review.
  CONSTRAINT transfer_requests_outcome_coherent CHECK (
    (status = 'pending'  AND reviewed_at IS NULL AND transfer_id IS NULL)
 OR (status = 'approved' AND reviewed_at IS NOT NULL AND transfer_id IS NOT NULL)
 OR (status = 'declined' AND reviewed_at IS NOT NULL)
  )
);

COMMENT ON TABLE public.transfer_requests IS
  'An attorney firm asking ConveyClear to open a property transfer. Creation '
  'moved behind ConveyClear at Meeting 2 (2026-08-06) so one vetted client '
  'database is maintained without firms reaching each other''s contacts.';

CREATE INDEX IF NOT EXISTS idx_transfer_requests_pending
  ON public.transfer_requests (created_at DESC) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_transfer_requests_firm
  ON public.transfer_requests (firm_id, created_at DESC);

-- ----------------------------------------------------------------------------
-- RLS — a firm sees and creates its OWN requests; only staff review them.
-- ----------------------------------------------------------------------------
ALTER TABLE public.transfer_requests ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transfer_requests TO authenticated;

DROP POLICY IF EXISTS transfer_requests_read ON public.transfer_requests;
CREATE POLICY transfer_requests_read ON public.transfer_requests FOR SELECT TO authenticated
  USING (public.app_is_staff() OR firm_id = public.app_user_partner_id());

-- INSERT only, and only for the caller's own firm. A firm cannot lodge a
-- request in another firm's name — that would put their transaction, and later
-- their transfer grant, under the wrong letterhead.
DROP POLICY IF EXISTS transfer_requests_firm_insert ON public.transfer_requests;
CREATE POLICY transfer_requests_firm_insert ON public.transfer_requests FOR INSERT TO authenticated
  WITH CHECK (
    public.app_user_partner_id() IS NOT NULL
    AND firm_id = public.app_user_partner_id()
    AND status = 'pending'
  );

-- Review is staff-only. Deliberately no firm UPDATE policy: a firm editing its
-- own pending request is a reasonable future feature, but it must not be able
-- to edit one that has already been decided, and that is a second predicate
-- best written when the feature is actually wanted.
DROP POLICY IF EXISTS transfer_requests_staff_write ON public.transfer_requests;
CREATE POLICY transfer_requests_staff_write ON public.transfer_requests FOR ALL TO authenticated
  USING (public.app_is_staff()) WITH CHECK (public.app_is_staff());

DROP TRIGGER IF EXISTS trg_transfer_requests_updated_at ON public.transfer_requests;
CREATE TRIGGER trg_transfer_requests_updated_at
  BEFORE UPDATE ON public.transfer_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMIT;

-- ============================================================================
-- VERIFY
--
--   -- as a partner: can insert for own firm
--   INSERT INTO transfer_requests (firm_id, property_description)
--   VALUES (public.app_user_partner_id(), 'ERF 123 Valhalla');   → 1 row
--
--   -- as a partner: CANNOT insert for another firm
--   INSERT INTO transfer_requests (firm_id, property_description)
--   VALUES ('<other firm>', 'ERF 123');
--   → ERROR: new row violates row-level security policy
--
--   -- as a partner: CANNOT approve one
--   UPDATE transfer_requests SET status = 'approved' WHERE id = '<id>';
--   → 0 rows (no firm UPDATE policy)
--
--   -- as a partner: sees only own firm's requests
--   SELECT count(*) FROM transfer_requests;  → own firm only
--   -- as staff: sees all
--
--   -- the coherence constraint bites
--   UPDATE transfer_requests SET status = 'approved' WHERE id = '<id>';
--   → ERROR: violates check constraint transfer_requests_outcome_coherent
--     (approved with no reviewed_at / transfer_id)
--
-- ROLLBACK
--   DROP TABLE IF EXISTS public.transfer_requests;
-- ============================================================================
