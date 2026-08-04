-- ============================================================================
-- Post-042 health check — run BEFORE applying 043
-- ============================================================================
-- NOT a migration. Read-only. ONE statement, one result grid — the Supabase SQL
-- editor only renders the LAST statement's output, so everything is unioned
-- into a single result set on purpose.
--
-- Paste the whole file, hit Run, send back the grid.
--
-- References approved_at, so this only works once 042 is applied (it is).
-- ============================================================================

SELECT 'A. column: ' || table_name || '.' || column_name  AS check_item,
       'present'                                          AS result
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND table_name  IN ('documents', 'transfer_documents')
   AND column_name IN ('approved_at', 'approved_by', 'uploaded_by_user_id')

UNION ALL
-- Expect 4: set_approval + propagate_approval (042), sync_to_transfer (038),
-- demote_transfer_mirror (039). tgenabled 'O' = enabled.
SELECT 'B. trigger: ' || c.relname || '.' || t.tgname,
       'tgenabled=' || t.tgenabled
  FROM pg_trigger t
  JOIN pg_class c ON c.oid = t.tgrelid
 WHERE NOT t.tgisinternal
   AND c.relname IN ('documents', 'transfer_documents')

UNION ALL
-- 🔴 THE CRITICAL ONE. Did 042's replacement of 038's sync function take?
-- false  =>  the transfer mirror does NOT inherit approval state, and an
-- unapproved upload still reaches the partner firm via the property transfer,
-- straight around the gate. If this is false, DO NOT APPLY 043.
SELECT 'C. sync_carries_approval (MUST be true)',
       (prosrc LIKE '%approved_at%')::text
  FROM pg_proc
 WHERE proname = 'sync_document_to_transfer'

UNION ALL
SELECT 'D. documents — total', count(*)::text FROM public.documents
UNION ALL
-- MUST be 0 before 043. Anything pending at flip time vanishes from client and
-- partner view at that instant.
SELECT 'D. documents — PENDING (must be 0 before 043)', count(*)::text
  FROM public.documents WHERE approved_at IS NULL
UNION ALL
SELECT 'E. transfer_documents — total', count(*)::text FROM public.transfer_documents
UNION ALL
SELECT 'E. transfer_documents — PENDING (must be 0 before 043)', count(*)::text
  FROM public.transfer_documents WHERE approved_at IS NULL

UNION ALL
-- 🔎 The approvals page embeds these FK names. They were a guess at Postgres's
-- auto-naming and have never been checked against this database. Expect
-- documents_uploaded_by_user_id_fkey and transfer_documents_uploaded_by_fkey.
SELECT 'F. fk on ' || rel.relname || ': ' || con.conname,
       pg_get_constraintdef(con.oid)
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
 WHERE con.contype = 'f'
   AND rel.relname IN ('documents', 'transfer_documents')

ORDER BY 1;
