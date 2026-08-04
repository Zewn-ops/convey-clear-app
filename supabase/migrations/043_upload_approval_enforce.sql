-- ============================================================================
-- 043 — staff-upload approval gate, PART 2 of 2: ENFORCE
-- ============================================================================
-- 🔴 THIS IS THE ONE THAT CHANGES WHAT PEOPLE CAN SEE. Do not apply it until:
--
--   1. migration 042 is applied            (columns + backfill + triggers)
--   2. the app is deployed                 (/admin/approvals exists, so a
--                                           pending document can be approved)
--   3. this query returns 0:
--        SELECT count(*) FROM documents WHERE approved_at IS NULL;
--      Anything pending at flip time vanishes from client/partner view the
--      instant this runs. Zero means the flip is invisible to everyone, which
--      is exactly how a visibility change should land.
--
-- Deliberately tiny — two policy definitions and nothing else — so it can be
-- read in full before running. All the machinery is in 042.
--
-- WHAT CHANGES
--   Non-staff readers (clients, business partners, and anyone reaching a matter
--   through matter_subscribers) now see only approved documents. Staff are
--   unaffected: documents_staff_all and transfer_documents_staff_write are
--   separate FOR ALL policies, and policies are OR'd — so the runner who
--   uploaded a pending file still sees it, and the admin still sees the queue.
--
-- WHY THE PREDICATE IS A BARE NULL CHECK
--   The decision of whether a given upload needs review is made once, at INSERT,
--   by 042's trigger. The policy only reads the result. Joining users inside an
--   RLS predicate to re-derive the uploader's role on every row read would be
--   slow on document lists and risks recursing through the users table's own
--   policies.
-- ============================================================================

BEGIN;

-- Matter documents — clients and the attorney firm.
DROP POLICY IF EXISTS documents_read_scoped ON public.documents;
CREATE POLICY documents_read_scoped ON public.documents FOR SELECT TO authenticated
  USING (can_access_matter(matter_id) AND approved_at IS NOT NULL);

-- Transfer documents — the owning firm. This half is what stops the two-way
-- sync (038) carrying an unapproved matter upload onto the property transfer,
-- where the partner firm would read it around the matter-level gate.
DROP POLICY IF EXISTS transfer_documents_read ON public.transfer_documents;
CREATE POLICY transfer_documents_read ON public.transfer_documents FOR SELECT TO authenticated
  USING (public.can_access_transfer(transfer_id) AND approved_at IS NOT NULL);

COMMIT;

-- ============================================================================
-- VERIFY
--   SELECT polname, pg_get_expr(polqual, polrelid) AS using_expr
--     FROM pg_policy
--    WHERE polrelid IN ('public.documents'::regclass,
--                       'public.transfer_documents'::regclass)
--    ORDER BY polname;
--   -- documents_read_scoped and transfer_documents_read must both mention
--   -- approved_at; the staff policies must NOT.
--
-- SMOKE TEST (do this rather than trusting the policy text):
--   1. As a staff_ops user, upload a document to a matter that has a client.
--   2. As that client, confirm the document is NOT listed.
--   3. As an admin, approve it in /admin/approvals.
--   4. As the client, confirm it now appears.
--   5. Confirm it also appears on the property transfer for the partner firm —
--      that proves 042's propagate trigger reached the mirror.
--
-- ROLLBACK (restores 006 / 034 behaviour exactly):
--   DROP POLICY IF EXISTS documents_read_scoped ON public.documents;
--   CREATE POLICY documents_read_scoped ON public.documents FOR SELECT TO authenticated
--     USING (can_access_matter(matter_id));
--   DROP POLICY IF EXISTS transfer_documents_read ON public.transfer_documents;
--   CREATE POLICY transfer_documents_read ON public.transfer_documents FOR SELECT TO authenticated
--     USING (public.can_access_transfer(transfer_id));
-- ============================================================================
