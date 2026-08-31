-- ============================================================================
-- 076 — documents are input, supporting, or output
-- ============================================================================
-- From the handwritten notes transcribed 2026-08-31 (§11.20).
--
-- Zewn: "we also want to split the documents into input, supporting and output
-- documents. easier to navigate and specify things that way … things for input
-- are like existing building plans, offer to purchase, rates figures …
-- supporting docs examples is stuff like IDs, proof of residence, fica vault
-- type things. and then output docs are the things conveyclear is sorting."
--
-- 🔴 THE CLASS IS CONTEXTUAL, NOT A PROPERTY OF THE DOCUMENT TYPE
--   "the input deed search is the sellers deed search, the output deed search
--    would be the buyers deed search. buyers deed search is what convey clear
--    produces and seller deed search is what cc receives."
--
--   A deed search is an input on the way in and an output on the way out. The
--   councils resolve that by naming the two separately -- the CoE sheet writes
--   the second as "DEED SEARCH (UPDATED)" -- so they are two document types and
--   the class follows the type. The resolver also matches on party, because a
--   council states an OWNER against each document it requires and 067 already
--   records whose an upload is. See src/lib/doc-classes.ts.
--
-- WHY THE CLASS IS STORED AND NOT COMPUTED ON READ
--   Council requirements change. A document filed last month was filed under
--   last month's rules, and silently re-labelling it because a config edit
--   landed would rewrite history. The value is resolved at upload and kept.
--
-- WHY NULLABLE, AND WHY NOTHING IS BACKFILLED
--   Every row that predates this migration was filed with no class in mind. A
--   backfill would be this session GUESSING at the intent of documents real
--   attorneys uploaded weeks ago, and a wrong guess is invisible -- it just
--   files a seller's ID under the wrong heading forever. NULL reads honestly as
--   "filed before we split these", and the UI groups those separately rather
--   than pretending. New uploads carry a class from the first one.
--
-- ⚠️ SCOPE: PROPERTY TRANSFERS ONLY.
--   Zewn, 2026-08-31: "input, working/supporting and output are for the
--   property transfer. the way we get docs for matters will change with the big
--   changes." Matter documents (015) are deliberately untouched here.
-- ============================================================================

BEGIN;

ALTER TABLE public.transfer_documents
  ADD COLUMN IF NOT EXISTS doc_class text;

ALTER TABLE public.transfer_documents
  DROP CONSTRAINT IF EXISTS transfer_documents_doc_class_check;

ALTER TABLE public.transfer_documents
  ADD CONSTRAINT transfer_documents_doc_class_check
  CHECK (doc_class IS NULL
         OR doc_class IN ('input', 'supporting', 'output'));

COMMENT ON COLUMN public.transfer_documents.doc_class IS
  'Input (what ConveyClear receives to start work), supporting '
  '(identity and verification material) or output (what ConveyClear '
  'produces). Resolved at upload from the council config in '
  'src/lib/councils and STORED, so a later change to a council''s '
  'requirements cannot retrospectively re-file documents. Contextual '
  'rather than a property of the type: the seller''s deed search is an '
  'input and the buyer''s is an output (Zewn, 2026-08-31). NULL on rows '
  'uploaded before this migration -- deliberately not backfilled, '
  'because guessing at the intent behind real uploads is invisible when '
  'it is wrong.';

CREATE INDEX IF NOT EXISTS idx_transfer_documents_class
  ON public.transfer_documents(transfer_id, doc_class)
  WHERE status = 'current';

COMMIT;

-- ============================================================================
-- VERIFY
-- ============================================================================
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'transfer_documents' AND column_name = 'doc_class';
--   -- expect: 1 row
--
--   Existing rows are untouched and honest about it:
--   SELECT doc_class, count(*) FROM transfer_documents GROUP BY doc_class;
--   -- expect: every existing row under NULL, immediately after applying
--
--   The CHECK refuses anything else:
--   BEGIN;
--     UPDATE transfer_documents SET doc_class = 'working'
--      WHERE id = (SELECT id FROM transfer_documents LIMIT 1);
--   ROLLBACK;
--   -- expect: ERROR, transfer_documents_doc_class_check
--   -- ("working" is what the handwritten sheet called supporting -- worth
--   --  proving it is not silently accepted.)
--
-- ============================================================================
-- DOWN
-- ============================================================================
--   DROP INDEX IF EXISTS idx_transfer_documents_class;
--   ALTER TABLE public.transfer_documents
--     DROP CONSTRAINT IF EXISTS transfer_documents_doc_class_check,
--     DROP COLUMN IF EXISTS doc_class;
-- ============================================================================
