-- ============================================================================
-- 078 — a transfer request can be left half-written and finished later
-- ============================================================================
-- Zewn, 2026-08-31: "we need to let them leave requests in a draft state if
-- they cant finish it in one go", and on which object he meant: "its the prop
-- trf requests. so if they get halfway with a request and want to return later
-- they can draft it and finish it later on."
--
-- 🟢 055 ANTICIPATED THIS EXACT MIGRATION. Its comment on the missing firm
--   UPDATE policy reads:
--
--     "a firm editing its own pending request is a reasonable future feature,
--      but it must not be able to edit one that has already been decided, and
--      that is a second predicate best written when the feature is actually
--      wanted."
--
--   The feature is now wanted, so here is that second predicate — narrower
--   than 055 imagined, because a DRAFT is the only state a firm may edit. Once
--   submitted, a request is out of the firm's hands exactly as before.
--
-- WHAT A DRAFT IS
--   The firm's own working copy. Not a request yet: nobody at ConveyClear has
--   been asked to do anything, and the row carries whatever half of the form
--   has been filled in.
--
-- 🔒 STAFF DO NOT SEE DRAFTS, AND THAT IS A POLICY CHANGE, NOT A FILTER.
--   055's read policy is `app_is_staff() OR firm_id = app_user_partner_id()`,
--   so without this staff would read every firm's unfinished notes -- and the
--   admin queue, which splits rows into "pending" and "everything else", would
--   file them under DECIDED. A `WHERE` clause in the page would fix the
--   display and not the exposure; PostgREST is reachable directly. So the
--   policy itself excludes drafts from the staff branch -- BOTH of them.
--   055's staff policy is `FOR ALL`, which includes SELECT, and permissive
--   policies are OR'd, so narrowing only the read policy would have changed
--   nothing at all.
--
-- WHY THE REQUIRED FIELDS BECOME CONDITIONAL
--   `property_description` is NOT NULL and 061 requires `suggested_reference`.
--   Both are right for a SUBMITTED request and both are wrong for a draft --
--   the whole point is stopping halfway. They become conditional on status:
--   still mandatory the moment the request is submitted, absent while it is a
--   draft. A draft that cannot be saved until it is complete is not a draft.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. The new state
-- ---------------------------------------------------------------------------

ALTER TABLE public.transfer_requests
  DROP CONSTRAINT IF EXISTS transfer_requests_status_check;

ALTER TABLE public.transfer_requests
  ADD CONSTRAINT transfer_requests_status_check
  CHECK (status IN ('draft', 'pending', 'approved', 'declined'));

-- A draft has no outcome, exactly like a pending request. 055's coherence
-- check is restated with the draft branch added rather than loosened.
ALTER TABLE public.transfer_requests
  DROP CONSTRAINT IF EXISTS transfer_requests_outcome_coherent;

ALTER TABLE public.transfer_requests
  ADD CONSTRAINT transfer_requests_outcome_coherent CHECK (
    (status = 'draft'
       AND reviewed_at IS NULL AND transfer_id IS NULL)
 OR (status = 'pending'
       AND reviewed_at IS NULL AND transfer_id IS NULL)
 OR (status = 'approved'
       AND reviewed_at IS NOT NULL AND transfer_id IS NOT NULL)
 OR (status = 'declined'
       AND reviewed_at IS NOT NULL)
  );

-- ---------------------------------------------------------------------------
-- 2. Required at submission, optional while drafting
-- ---------------------------------------------------------------------------

ALTER TABLE public.transfer_requests
  ALTER COLUMN property_description DROP NOT NULL;

ALTER TABLE public.transfer_requests
  DROP CONSTRAINT IF EXISTS transfer_requests_property_required;

ALTER TABLE public.transfer_requests
  ADD CONSTRAINT transfer_requests_property_required CHECK (
    status = 'draft'
    OR (property_description IS NOT NULL
        AND btrim(property_description) <> '')
  );

-- 061 made the reference mandatory and NOT VALID, because five historical rows
-- predate it. Restated the same way, for the same reason: the old rows are
-- still there and must not block this migration.
ALTER TABLE public.transfer_requests
  DROP CONSTRAINT IF EXISTS transfer_requests_reference_required;

ALTER TABLE public.transfer_requests
  ADD CONSTRAINT transfer_requests_reference_required CHECK (
    status = 'draft'
    OR (suggested_reference IS NOT NULL
        AND btrim(suggested_reference) <> '')
  ) NOT VALID;

-- ---------------------------------------------------------------------------
-- 3. Policies
-- ---------------------------------------------------------------------------

-- 🔒 Staff read everything EXCEPT another firm's drafts. A firm still reads
-- its own, drafts included -- they are its working copies.
DROP POLICY IF EXISTS transfer_requests_read ON public.transfer_requests;
CREATE POLICY transfer_requests_read ON public.transfer_requests
  FOR SELECT TO authenticated
  USING (
    (public.app_is_staff() AND status <> 'draft')
    OR firm_id = public.app_user_partner_id()
  );

-- A firm may create a draft as well as submit outright.
DROP POLICY IF EXISTS transfer_requests_firm_insert
  ON public.transfer_requests;
CREATE POLICY transfer_requests_firm_insert ON public.transfer_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    public.app_user_partner_id() IS NOT NULL
    AND firm_id = public.app_user_partner_id()
    AND status IN ('draft', 'pending')
  );

-- 055's "second predicate", now that the feature is wanted.
--
-- USING sees the OLD row and WITH CHECK the NEW one, which is exactly the
-- shape this rule needs: a firm may edit a row that IS a draft, and may leave
-- it as a draft or submit it. It can never touch a pending, approved or
-- declined request, and it can never move one back to draft -- so submitting
-- is one-way, and a decided request stays decided.
DROP POLICY IF EXISTS transfer_requests_firm_draft_update
  ON public.transfer_requests;
CREATE POLICY transfer_requests_firm_draft_update
  ON public.transfer_requests
  FOR UPDATE TO authenticated
  USING (
    firm_id = public.app_user_partner_id()
    AND status = 'draft'
  )
  WITH CHECK (
    firm_id = public.app_user_partner_id()
    AND status IN ('draft', 'pending')
  );

-- Abandoning a draft is the firm's to do. Deleting a SUBMITTED request is not:
-- ConveyClear has been asked to do something and may already have acted on it.
DROP POLICY IF EXISTS transfer_requests_firm_draft_delete
  ON public.transfer_requests;
CREATE POLICY transfer_requests_firm_draft_delete
  ON public.transfer_requests
  FOR DELETE TO authenticated
  USING (
    firm_id = public.app_user_partner_id()
    AND status = 'draft'
  );

-- 🔴 THIS POLICY IS NOT UNCHANGED, AND THE CHANGE IS THE WHOLE POINT.
--
-- 055 wrote it as `FOR ALL USING (app_is_staff())`. FOR ALL INCLUDES SELECT,
-- and permissive policies are combined with OR -- so narrowing the read policy
-- above achieves nothing on its own: this one would still hand staff every
-- firm's drafts, and the admin queue would file them under "decided".
--
-- So the draft exclusion belongs here too. Staff cannot read, edit or delete a
-- draft: it is the firm's working copy until they send it.
DROP POLICY IF EXISTS transfer_requests_staff_write
  ON public.transfer_requests;
CREATE POLICY transfer_requests_staff_write ON public.transfer_requests
  FOR ALL TO authenticated
  USING (public.app_is_staff() AND status <> 'draft')
  WITH CHECK (public.app_is_staff() AND status <> 'draft');

CREATE INDEX IF NOT EXISTS idx_transfer_requests_firm_drafts
  ON public.transfer_requests (firm_id, updated_at DESC)
  WHERE status = 'draft';

COMMENT ON COLUMN public.transfer_requests.status IS
  'draft = the firm''s own unfinished working copy, invisible to '
  'ConveyClear and editable only by the firm that owns it. pending = '
  'submitted and awaiting review. approved / declined = decided. '
  'Submitting is one-way: no policy allows a row back to draft (078).';

COMMIT;

-- ============================================================================
-- VERIFY
-- ============================================================================
--   As a PARTNER:
--     -- can save a draft with almost nothing filled in
--     INSERT INTO transfer_requests (firm_id, status, property_description)
--     VALUES (public.app_user_partner_id(), 'draft', NULL);   -- 1 row
--
--     -- can edit it, and submit it
--     UPDATE transfer_requests SET property_description = 'ERF 123 Valhalla'
--      WHERE id = '<draft id>';                               -- 1 row
--     UPDATE transfer_requests SET status = 'pending'
--      WHERE id = '<draft id>';                               -- 1 row
--
--     -- CANNOT edit it once submitted, and CANNOT pull it back to draft
--     UPDATE transfer_requests SET notes = 'changed'
--      WHERE id = '<the now-pending id>';                     -- 0 rows
--     UPDATE transfer_requests SET status = 'draft'
--      WHERE id = '<the now-pending id>';                     -- 0 rows
--
--     -- CANNOT submit an incomplete one
--     UPDATE transfer_requests SET status = 'pending'
--      WHERE id = '<a draft with no property_description>';
--     -- ERROR: transfer_requests_property_required
--
--   As STAFF -- the one that matters:
--     SELECT count(*) FROM transfer_requests WHERE status = 'draft';
--     -- expect 0, ALWAYS, however many drafts exist. If this returns rows,
--     -- staff are reading firms' unfinished notes and the admin queue is
--     -- filing them under "decided".
--
--     Run it with a draft KNOWN to exist -- an empty table proves nothing.
--     Create one as a partner first, then run the count as staff.
--
--   Both policies must carry the exclusion, because FOR ALL includes SELECT
--   and permissive policies are OR'd:
--     SELECT polname, polcmd,
--            pg_get_expr(polqual, polrelid) LIKE '%draft%' AS excludes_draft
--       FROM pg_policy
--      WHERE polrelid = 'public.transfer_requests'::regclass
--        AND polname IN ('transfer_requests_read',
--                        'transfer_requests_staff_write');
--     -- expect: excludes_draft = true on BOTH rows
--
-- ============================================================================
-- DOWN
-- ============================================================================
--   ⚠️ Delete or submit every draft first -- the old status CHECK has no
--   'draft' value and will refuse to be added while one exists.
--
--   DROP POLICY IF EXISTS transfer_requests_firm_draft_delete
--     ON transfer_requests;
--   DROP POLICY IF EXISTS transfer_requests_firm_draft_update
--     ON transfer_requests;
--   DROP INDEX IF EXISTS idx_transfer_requests_firm_drafts;
--   -- then restore 055's read + insert policies, 055's coherence check,
--   -- 061's reference constraint, and property_description NOT NULL.
-- ============================================================================
