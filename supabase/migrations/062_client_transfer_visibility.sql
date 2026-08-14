-- ============================================================================
-- 062 — clients can see their own property transfer, and only part of it
-- ============================================================================
-- Meeting 2026-08-11, Decisions ("Client property transfer visibility") and
-- Details §96:
--
--   "Clients are granted visibility into property transfers, with sensitive
--    internal firm information excluded from their dashboard."
--
--   "clients should have visibility into property transfers, limited to
--    necessary information, excluding sensitive internal data."
--
-- Next-step §46 assigns it to Zuaan. Verified live on staging 2026-08-14 before
-- writing this: as demo.client (Pieter van Wyk, the SELLER on SH-2026-0417),
-- `SELECT * FROM property_transfers` returned ZERO rows — while the same client
-- COULD read the one shared transfer document on it. So today a client can read
-- a document belonging to a transaction they cannot see. This closes that.
--
-- 🔴 WHY THIS DOES NOT TOUCH can_access_transfer()
--   The obvious implementation — add a client branch to can_access_transfer, as
--   the 08-11 notes sketch — is wrong, and dangerously so. That function gates
--   FIVE other things:
--
--     transfer_parties       (050:137)  → the OTHER party's identity
--     transfer_documents     (034:84)   → every document, including 'internal'
--     transfer_activities    (035:107)  → the CC↔attorney feed, explicitly
--                                         "not visible to clients"
--     storage.objects        (034:112)  → the files themselves
--     properties read        (056:192)
--
--   Widening it would hand a client the other side's identity and every internal
--   document in one statement — destroying the buyer-cannot-see-the-seller's-FICA
--   guarantee proven in the 2026-08-11 dry run (§07, step 7.4), which is the
--   result the client walkthrough leads with. The decision says the opposite of
--   what that change would do.
--
--   So: a SEPARATE function, used by a SEPARATE read path, and every existing
--   policy is left exactly as it is.
--
-- 🔴 WHY A VIEW AND NOT A POLICY ON property_transfers
--   RLS is row-level. The table carries business_partner_id,
--   estate_agent_partner_id, seller_client_id, buyer_client_id, internal notes
--   and created_by — precisely the "sensitive internal firm information" the
--   decision excludes. A row-level policy grants ALL columns, so a client
--   hitting PostgREST directly would read the other party's id and the firm's.
--   Column-level GRANTs cannot help: clients, staff and partners are all the
--   same `authenticated` role.
--
--   The view names the visible columns explicitly, which also makes the field
--   list reviewable in one place — and the field list is the half Jukka still
--   has to sign off.
--
-- ⚠️ THE FIELD LIST IS PROPOSED, NOT CONFIRMED.
--   It matches `ConveyClear_Meeting_Walkthrough_2026-08-13` page 9: reference ·
--   property · status · their own matters · shared documents; never the other
--   party, their FICA, or the other side's attorney. The 08-11 notes confirm
--   clients see transfers; they do NOT confirm WHICH fields. Changing the list
--   later means editing this one view — deliberately, so it stays cheap.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Am I a party to this transfer?
-- ----------------------------------------------------------------------------
-- Routed through can_access_client so it is multi-entity aware (049): a person
-- acting for their trust sees the trust's transfer too. Reads transfer_parties
-- rather than the denormalised seller_client_id / buyer_client_id columns —
-- 050's rows are the authoritative party record (the 08-11 sync bug was exactly
-- these two disagreeing), and the columns only ever hold seller and buyer, so a
-- client who is some other kind of party would be invisible to them.
CREATE OR REPLACE FUNCTION public.client_can_view_transfer(t_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.transfer_parties tp
     WHERE tp.transfer_id = t_id
       AND tp.client_id IS NOT NULL
       AND public.can_access_client(tp.client_id)
  );
$$;

COMMENT ON FUNCTION public.client_can_view_transfer(uuid) IS
  'True when the caller is a PARTY to this transfer through one of their own '
  'entities. Deliberately NOT part of can_access_transfer(): that one gates the '
  'parties list, every transfer document, the internal feed and storage, none '
  'of which a client may read. Used only by the client_transfers view.';

-- ----------------------------------------------------------------------------
-- 2. The column-limited read path
-- ----------------------------------------------------------------------------
-- security_invoker = off (the default, stated explicitly): the view runs as its
-- owner and so is not blocked by property_transfers' own RLS, which has no
-- client branch and is not getting one. The WHERE clause below is therefore the
-- entire security boundary — every column listed here is a column a client may
-- see, and the filter must never be relaxed.
--
-- auth.uid() still resolves correctly under a definer view: it reads the
-- request's JWT claim, which is per-request, not per-role.
DROP VIEW IF EXISTS public.client_transfers;

CREATE VIEW public.client_transfers
WITH (security_invoker = off) AS
SELECT
  t.id,
  t.reference,             -- the firm's file reference; how everyone names it
  t.property_description,
  t.municipality,
  t.status,
  t.property_id,           -- reading the property itself stays gated by 056
  t.created_at,
  t.updated_at
FROM public.property_transfers t
WHERE public.client_can_view_transfer(t.id);

COMMENT ON VIEW public.client_transfers IS
  'A client''s own property transfers, limited to the fields agreed for client '
  'visibility (2026-08-11). EXCLUDED ON PURPOSE: business_partner_id, '
  'estate_agent_partner_id, seller_client_id, buyer_client_id, notes, '
  'created_by — the other party and the internal firm detail. Adding a column '
  'here publishes it to clients; do not widen without checking it against the '
  'decision.';

-- staff and partners keep using property_transfers directly; this is the client
-- path only. anon must never reach it.
REVOKE ALL ON public.client_transfers FROM PUBLIC;
REVOKE ALL ON public.client_transfers FROM anon;
GRANT SELECT ON public.client_transfers TO authenticated;

COMMIT;

-- ============================================================================
-- VERIFY  (run each block in its own transaction and ROLLBACK)
--
--   -- as demo.client (Pieter van Wyk, SELLER on SH-2026-0417)
--   BEGIN;
--   SET LOCAL ROLE authenticated;
--   SET LOCAL request.jwt.claims =
--     '{"sub":"b99f770e-05c6-495f-82ba-a6a64532c85d","role":"authenticated"}';
--
--   SELECT reference, status FROM client_transfers;      → SH-2026-0417
--   SELECT count(*) FROM property_transfers;             → 0   (base table
--                                                              still closed)
--   SELECT count(*) FROM transfer_parties;               → 0   (other party
--                                                              still hidden)
--   SELECT count(*) FROM transfer_documents;             → 1, the SHARED one
--                                                              only
--   ROLLBACK;
--
--   -- a client who is NOT a party sees nothing (dryrun.client / Thabo Molefe)
--   SET LOCAL request.jwt.claims =
--     '{"sub":"a32431b9-540f-4965-8d2d-c188f63e48ec","role":"authenticated"}';
--   SELECT count(*) FROM client_transfers;               → 0
--
--   -- the view exposes no forbidden column
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'client_transfers'
--      AND column_name IN ('business_partner_id','estate_agent_partner_id',
--                          'seller_client_id','buyer_client_id','notes',
--                          'created_by');                → 0 rows
--
-- ROLLBACK
--   DROP VIEW IF EXISTS public.client_transfers;
--   DROP FUNCTION IF EXISTS public.client_can_view_transfer(uuid);
-- ============================================================================
