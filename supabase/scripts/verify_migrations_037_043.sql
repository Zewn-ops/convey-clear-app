-- ============================================================================
-- Which migrations are actually applied? (037 → 043)
-- ============================================================================
-- NOT a migration. Read-only. Paste the whole thing into the Supabase SQL
-- editor and run it — one statement, no placeholders, safe to run any time.
--
-- Each row probes for an artifact the migration creates, so it reports what the
-- DATABASE says rather than what the notes say.
-- ============================================================================

SELECT '037 firm admin'            AS migration,
       EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'users'
                  AND column_name = 'is_firm_admin')                     AS applied,
       'users.is_firm_admin'       AS looks_for
UNION ALL
SELECT '038 doc sync trigger',
       EXISTS (SELECT 1 FROM pg_trigger
                WHERE tgname = 'trg_documents_sync_to_transfer'
                  AND NOT tgisinternal),
       'trigger trg_documents_sync_to_transfer'
UNION ALL
SELECT '039 supersede mirror',
       EXISTS (SELECT 1 FROM pg_trigger
                WHERE tgname = 'trg_documents_demote_transfer_mirror'
                  AND NOT tgisinternal),
       'trigger trg_documents_demote_transfer_mirror'
UNION ALL
SELECT '040 doc original name',
       EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'documents'
                  AND column_name = 'original_file_name'),
       'documents.original_file_name'
UNION ALL
SELECT '041 transfer doc orig name',
       EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'transfer_documents'
                  AND column_name = 'original_file_name'),
       'transfer_documents.original_file_name'
UNION ALL
SELECT '042 approval prep',
       EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'documents'
                  AND column_name = 'approved_at'),
       'documents.approved_at'
UNION ALL
SELECT '043 approval ENFORCED',
       EXISTS (SELECT 1 FROM pg_policy
                WHERE polrelid = 'public.documents'::regclass
                  AND polname  = 'documents_read_scoped'
                  AND pg_get_expr(polqual, polrelid) LIKE '%approved_at%'),
       'documents_read_scoped mentions approved_at'
ORDER BY migration;

-- ============================================================================
-- READINESS CHECK FOR 043 — run this SEPARATELY, and only AFTER 042 is applied.
--
-- It is not part of the query above on purpose: Postgres resolves column
-- references when it parses a statement, so naming approved_at before 042
-- exists would fail the ENTIRE query rather than just that one row — and the
-- moment you most want to run the check is before 042, when it would break.
--
-- Must return 0. Anything pending when 043 is applied disappears from client
-- and partner view at that instant, with the queue as the only way back.
--
--   SELECT count(*) AS pending_documents
--     FROM public.documents WHERE approved_at IS NULL;
-- ============================================================================
