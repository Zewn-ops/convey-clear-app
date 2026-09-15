-- ============================================================================
-- 098 — a firm can open a matter, and ConveyClear decides whether to take it
-- ============================================================================
-- WHY
--   Today an attorney REQUESTS a service and a ConveyClear admin turns it into
--   a matter by hand. Marlene, Francois and Marina all pushed on this in the
--   same week: clicking a service should land the attorney on a matter page,
--   pre-filled from the transfer, showing the documents that service needs,
--   with somewhere to upload them and somewhere to say what the story is.
--
--   Jukka, 2026-09-15, agreed and drew the boundary: the matter still has to
--   belong to a property transfer ("if any attorney wants to use our service,
--   they'll have to first create a property transfer for that matter to rest
--   under"), because the packaged fee is invoiced per transfer. That rule is
--   enforced in the route, not here — a matter's transfer_id is already the
--   thing every other part of the system hangs off.
--
--   What is NOT decided is whether ConveyClear must accept the work. Marlene
--   was explicit that it lands "in a draft stage" for ConveyClear to approve or
--   reject "based on what was provided". So a firm-created matter is a PROPOSAL
--   until someone here says otherwise.
--
-- 🔴 WHY THIS IS NOT A NEW matters.status VALUE
--   The obvious move is status = 'draft'. Do not. Adding a value to an existing
--   status CHECK is what broke transfer submission on 089 and send-back on 090,
--   twice in one fortnight, because every CHECK and every code path that
--   enumerates the old values has to be found first. The same lesson closed B3
--   on 2026-09-11: the rejected-transfer chip derives from the REQUEST and the
--   stored status stays 'declined'.
--
--   So the review state is its OWN column with its OWN constraint. Nothing that
--   reads matters.status changes meaning, and a matter that has never been
--   through firm review carries NULL — which is every one of the 32 rows on
--   production today.
--
-- WHAT A NULL MEANS
--   "Not a firm submission." A staff-created matter is live the moment it
--   exists and always has been. Only rows a firm submitted carry a state.
-- ============================================================================

BEGIN;

ALTER TABLE public.matters
  ADD COLUMN IF NOT EXISTS firm_review_state TEXT,
  ADD COLUMN IF NOT EXISTS firm_review_note  TEXT,
  ADD COLUMN IF NOT EXISTS firm_review_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS firm_review_by    UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS submitted_by_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL;

-- A fresh constraint on a fresh column: safe in a way that editing
-- matters_status_check is not. NULL passes, which is the whole existing table.
ALTER TABLE public.matters DROP CONSTRAINT IF EXISTS matters_firm_review_state_check;
ALTER TABLE public.matters ADD CONSTRAINT matters_firm_review_state_check
  CHECK (firm_review_state IS NULL
         OR firm_review_state IN ('pending', 'approved', 'rejected'));

CREATE INDEX IF NOT EXISTS idx_matters_firm_review_pending
  ON public.matters (created_at DESC)
  WHERE firm_review_state = 'pending';

COMMENT ON COLUMN public.matters.firm_review_state IS
  'NULL = not a firm submission (every staff-created matter). pending = a firm proposed it and ConveyClear has not answered. approved / rejected = we have. Deliberately NOT a matters.status value — see 098.';
COMMENT ON COLUMN public.matters.firm_review_note IS
  'Why it was rejected, shown to the firm. Marlene: ConveyClear approves or rejects "based on what was provided", so the firm has to be told what was missing.';

-- ---------------------------------------------------------------------------
-- The client must not see a proposal
-- ---------------------------------------------------------------------------
-- can_access_matter reaches a buyer or seller through the transfer. A matter
-- the firm has merely PROPOSED is not work in progress and showing it to the
-- client would promise something ConveyClear has not agreed to do. Staff and
-- the firm both keep full sight of it.
--
-- Written as an addition to the existing read policy rather than a new one:
-- policies for the same command are OR'd, so a second permissive policy could
-- only ever widen access. 093 taught that the hard way — transfer_documents
-- carries a third read policy with no approved_at check that nobody remembered
-- was there.
DROP POLICY IF EXISTS matters_read_scoped ON public.matters;
CREATE POLICY matters_read_scoped ON public.matters FOR SELECT TO authenticated
  USING (
    can_access_matter(id)
    AND (
      firm_review_state IS DISTINCT FROM 'pending'
      OR app_is_staff()
      OR business_partner_id = (SELECT u.business_partner_id
                                  FROM public.users u
                                 WHERE u.id = public.app_current_user_id())
    )
  );

COMMIT;

-- ============================================================================
-- ⚠️ BEFORE RUNNING THIS, CHECK THE POLICY IT REPLACES
--
--   SELECT polname, pg_get_expr(polqual, polrelid) AS using_expr
--     FROM pg_policy WHERE polrelid = 'public.matters'::regclass ORDER BY polname;
--
--   The DROP/CREATE above assumes the existing read policy is named
--   matters_read_scoped and reads exactly `can_access_matter(id)`. If it is
--   named differently or carries more, STOP and adjust — recreating it from a
--   guess would silently widen or narrow who can read every matter in the
--   system. This is the same check 093 required and passed.
--
-- VERIFY (run after COMMIT)
--
--   -- 1. Columns exist, table untouched. Expect 32 matters, 0 with a state.
--   SELECT count(*) AS matters, count(firm_review_state) AS in_review
--     FROM public.matters;
--
--   -- 2. The constraint accepts NULL and the three words, nothing else.
--   SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conrelid = 'public.matters'::regclass
--      AND conname = 'matters_firm_review_state_check';
--
--   -- 3. matters.status is UNCHANGED — this migration must not have touched it.
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conrelid = 'public.matters'::regclass AND conname = 'matters_status_check';
--
-- SMOKE TEST — the only thing that proves the policy:
--   1. As the firm, submit a matter from a transfer. It appears in their list
--      badged "Awaiting ConveyClear review".
--   2. As the BUYER or SELLER on that transfer, confirm it is NOT listed.
--   3. As staff, approve it. Confirm the client now sees it.
--   4. Reject another one with a reason; confirm the firm reads the reason and
--      the client still never sees it.
--
-- ROLLBACK
--   DROP POLICY IF EXISTS matters_read_scoped ON public.matters;
--   CREATE POLICY matters_read_scoped ON public.matters FOR SELECT TO authenticated
--     USING (can_access_matter(id));
--   ALTER TABLE public.matters DROP CONSTRAINT IF EXISTS matters_firm_review_state_check;
--   ALTER TABLE public.matters
--     DROP COLUMN IF EXISTS firm_review_state, DROP COLUMN IF EXISTS firm_review_note,
--     DROP COLUMN IF EXISTS firm_review_at,    DROP COLUMN IF EXISTS firm_review_by,
--     DROP COLUMN IF EXISTS submitted_by_user_id;
-- ============================================================================
