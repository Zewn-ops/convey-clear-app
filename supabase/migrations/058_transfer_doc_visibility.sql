-- ============================================================================
-- 058 — transfer documents can be shared with the parties
-- ============================================================================
-- Meeting 2 (2026-08-06), Decisions §40 + Details §100: "buyers and sellers
-- view their own files and specific shared documents while preserving privacy",
-- via "pre-selected document packages where only authorized files, such as
-- meter readings, are visible to the relevant parties".
--
-- SCOPE — THE MECHANISM, NOT THE PACKAGES.
--   This builds per-document visibility and the party read path. It does NOT
--   build named packages ("the meter-reading pack"), because nobody has said
--   what the packages ARE — which documents belong to which pack is Jukka's
--   call, not a schema decision. A preset is a saved list of document types on
--   top of this column; building the list before knowing its contents would be
--   guessing at policy and calling it code.
--
-- INERT ON ARRIVAL. visibility defaults to 'internal', which is exactly today's
-- behaviour (staff + the granted firm). Nothing becomes visible to anybody until
-- a staff member deliberately shares a document, so this can ship and sit.
--
-- WHY A COLUMN AND NOT "CLIENTS SEE EVERYTHING ON THEIR TRANSFER"
--   The default has to be closed. A transfer carries the other side's FICA, the
--   attorney's working papers and ConveyClear's own proof-of-payment. Opening it
--   to parties by default and hiding the sensitive ones would mean every new
--   document type is exposed until somebody remembers to hide it. Closed by
--   default means the failure mode is "the client cannot see it yet", which
--   someone reports, rather than "the buyer saw the seller's ID", which nobody
--   reports.
-- ============================================================================

BEGIN;

ALTER TABLE public.transfer_documents
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'internal'
    CHECK (visibility IN ('internal', 'parties'));

COMMENT ON COLUMN public.transfer_documents.visibility IS
  'internal = staff + the granted firm only (default, and today''s behaviour). '
  'parties  = additionally readable by the transfer''s client parties. Set '
  'deliberately by staff, per document. Meeting 2 §40/§100.';

CREATE INDEX IF NOT EXISTS idx_transfer_documents_shared
  ON public.transfer_documents (transfer_id) WHERE visibility = 'parties';

-- ----------------------------------------------------------------------------
-- Is the caller a CLIENT party on this transfer?
-- ----------------------------------------------------------------------------
-- Deliberately narrower than can_access_transfer: that one answers "staff or the
-- firm", and neither is a party. This walks transfer_parties → clients and
-- defers to can_access_client, so multi-entity membership (049) is respected
-- without being restated. Firm-linked party rows (the attorneys, the estate
-- agent) carry firm_id, not client_id, so they do not match here — a firm's
-- access already comes from its grant.
CREATE OR REPLACE FUNCTION public.is_transfer_party(t_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.transfer_parties tp
     WHERE tp.transfer_id = t_id
       AND tp.client_id IS NOT NULL
       AND public.can_access_client(tp.client_id)
  );
$$;

COMMENT ON FUNCTION public.is_transfer_party(uuid) IS
  'True when the caller is (or acts for) a CLIENT party on this transfer. Not a '
  'substitute for can_access_transfer — a party is not a firm and does not get '
  'the firm''s view.';

-- ----------------------------------------------------------------------------
-- The party read path.
-- ----------------------------------------------------------------------------
-- Additive: 034's transfer_documents_read is left exactly as it is, and this
-- second SELECT policy ORs alongside it. Two narrow policies read better than
-- one widened one — and if this turns out to be wrong it is dropped without
-- touching the staff/firm path.
--
-- A party sees a document when they are a party AND either:
--   (a) it was deliberately shared, or
--   (b) it came out of THEIR OWN vault — §40's "their own files". A seller
--       should not lose sight of their own certified ID because staff moved a
--       copy of it onto the transaction.
DROP POLICY IF EXISTS transfer_documents_party_read ON public.transfer_documents;
CREATE POLICY transfer_documents_party_read ON public.transfer_documents FOR SELECT TO authenticated
  USING (
    public.is_transfer_party(transfer_id)
    AND (
      visibility = 'parties'
      OR (
        client_document_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.client_documents cd
           WHERE cd.id = transfer_documents.client_document_id
             AND public.can_access_client(cd.client_id)
        )
      )
    )
  );

-- ----------------------------------------------------------------------------
-- Storage, for parity.
-- ----------------------------------------------------------------------------
-- ⚠️ NOT the real boundary. Downloads are signed SERVER-SIDE with the service
-- role (signedDocUrls), which bypasses storage RLS entirely — so what a client
-- can actually fetch is decided by which ROWS the page can read, i.e. the policy
-- above. This exists so direct browser access agrees with the table rather than
-- being mysteriously stricter, which is the kind of mismatch that burns an hour
-- during a demo.
DROP POLICY IF EXISTS transferdocs_party_read ON storage.objects;
CREATE POLICY transferdocs_party_read ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'transfer-documents'
    AND name ~ '^[0-9a-fA-F-]{36}/'
    AND EXISTS (
      SELECT 1 FROM public.transfer_documents td
       WHERE td.storage_path = storage.objects.name
         AND td.visibility = 'parties'
         AND public.is_transfer_party(td.transfer_id)
    )
  );

COMMIT;

-- ============================================================================
-- VERIFY
--
--   -- inert: nothing is shared yet, so no client gains anything
--   SELECT count(*) FROM transfer_documents WHERE visibility = 'parties';  → 0
--   -- impersonate a client party: transfer document count unchanged from before
--
--   -- share one, and watch ONLY that one appear
--   UPDATE transfer_documents SET visibility = 'parties' WHERE id = '<doc>';
--   -- as the SELLER  → sees it
--   -- as the BUYER   → sees it too (both are parties; "shared" means shared)
--   -- as an UNRELATED client → still nothing
--
--   -- 🔴 THE ONE THAT MATTERS: the other side's FICA must stay hidden
--   -- pull the seller's certified ID onto the transfer (054), leave it internal
--   -- as the SELLER → sees it   (their own vault document, branch (b))
--   -- as the BUYER  → DOES NOT SEE IT
--   -- If the buyer sees it, stop and do not deploy: that is the exact failure
--   -- §100 exists to prevent.
--
--   -- staff and the granted firm are unaffected throughout (034's policy)
--
-- ROLLBACK
--   DROP POLICY IF EXISTS transfer_documents_party_read ON public.transfer_documents;
--   DROP POLICY IF EXISTS transferdocs_party_read ON storage.objects;
--   DROP FUNCTION IF EXISTS public.is_transfer_party(uuid);
--   ALTER TABLE public.transfer_documents DROP COLUMN IF EXISTS visibility;
-- ============================================================================
