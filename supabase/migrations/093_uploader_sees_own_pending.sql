-- ============================================================================
-- 093 — a firm can see the document it just uploaded
-- ============================================================================
-- ⚠️ THIS WIDENS A RULE 043 NARROWED ON PURPOSE. Read the whole header before
--    running it, and do not run it without Zewn's explicit go-ahead.
--
-- WHAT 043 DID
--   documents_read_scoped   USING (can_access_matter(matter_id)   AND approved_at IS NOT NULL)
--   transfer_documents_read USING (can_access_transfer(transfer_id) AND approved_at IS NOT NULL)
--
--   so nothing reaches a client or a firm until an admin releases it. That is
--   right, and this migration keeps it for every document a firm did not upload.
--
-- WHAT 043 MISSED
--   Its own header says "the runner who uploaded a pending file still sees it".
--   That is true for STAFF, who have separate FOR ALL policies that are OR'd in.
--   A PARTNER FIRM has no such policy — so a firm's own upload vanished from its
--   own screen the moment it was saved, and stayed gone until someone at
--   ConveyClear approved it.
--
--   Found 2026-09-10 on production, signed in as Sterling & Hayes. On
--   COJ_COO_HGL_MAT2366/JENNALEE the firm read:
--
--     Documents (0) · INPUT DOCUMENTS (0) · 0/8 required
--
--   above fifteen files it had uploaded itself, with every checklist slot still
--   showing "Upload". Admin, on the same matter, read "5/8 required". A firm
--   looking at that concludes the upload failed and does it again — which is
--   one plausible source of the duplicate Deed Search rows on FRPS_0001.
--
-- WHAT THIS CHANGES, EXACTLY
--   Adds one alternative to each predicate: OR the caller uploaded this row.
--
--   · Still hidden: anything uploaded by staff, by the other side, or by another
--     firm, until it is approved. Unchanged.
--   · Now visible: your own upload, to you, before approval.
--   · Not weakened: can_access_matter / can_access_transfer still gate the row
--     first, so this cannot reach across matters or firms. A caller who can see
--     nothing on a matter still sees nothing.
--   · Clients: documents.uploaded_by_user_id is set for client uploads too, so a
--     client also sees their own pending file. Same reasoning — it is theirs,
--     they just sent it, and hiding it reads as a failed upload.
--
--   The comparison is against public.users.id, which is what both uploader
--   columns reference and what app_current_user_id() returns. It adds no join
--   that 043's header warned about: app_current_user_id() is STABLE and already
--   used by every other policy in this schema.
--
-- THE UI HALF ships with this (partner matter + transfer pages): a row visible
--   only to its uploader is badged "Awaiting ConveyClear review", so the firm
--   can tell what the buyer and seller cannot yet see.
-- ============================================================================

BEGIN;

DROP POLICY IF EXISTS documents_read_scoped ON public.documents;
CREATE POLICY documents_read_scoped ON public.documents FOR SELECT TO authenticated
  USING (
    can_access_matter(matter_id)
    AND (
      approved_at IS NOT NULL
      OR uploaded_by_user_id = public.app_current_user_id()
    )
  );

DROP POLICY IF EXISTS transfer_documents_read ON public.transfer_documents;
CREATE POLICY transfer_documents_read ON public.transfer_documents FOR SELECT TO authenticated
  USING (
    public.can_access_transfer(transfer_id)
    AND (
      approved_at IS NOT NULL
      OR uploaded_by = public.app_current_user_id()
    )
  );

COMMIT;

-- ============================================================================
-- VERIFY (run after COMMIT)
--
--   SELECT polname, pg_get_expr(polqual, polrelid) AS using_expr
--     FROM pg_policy
--    WHERE polrelid IN ('public.documents'::regclass,
--                       'public.transfer_documents'::regclass)
--    ORDER BY polname;
--   -- both read policies must still mention approved_at, and now also the
--   -- uploader column. The staff policies must mention neither.
--
-- SMOKE TEST — 043's, plus the case it missed. Do this rather than trusting the
-- policy text:
--   1. As the PARTNER firm, upload a document to one of its matters.
--   2. As that firm, confirm it IS listed, badged as awaiting review, and that
--      the checklist counts it.
--   3. As the client on that transfer, confirm it is NOT listed.
--   4. As an admin, approve it in /admin/approvals.
--   5. As the client, confirm it now appears.
--   6. As a staff_ops user, upload to the same matter; confirm the FIRM cannot
--      see that one until it is approved. This is the half 043 is protecting.
--
-- ROLLBACK (restores 043 exactly)
--   DROP POLICY IF EXISTS documents_read_scoped ON public.documents;
--   CREATE POLICY documents_read_scoped ON public.documents FOR SELECT TO authenticated
--     USING (can_access_matter(matter_id) AND approved_at IS NOT NULL);
--   DROP POLICY IF EXISTS transfer_documents_read ON public.transfer_documents;
--   CREATE POLICY transfer_documents_read ON public.transfer_documents FOR SELECT TO authenticated
--     USING (public.can_access_transfer(transfer_id) AND approved_at IS NOT NULL);
-- ============================================================================
