-- ============================================================================
-- 101 — POPIA consent, held on the transfer, covering every matter under it
-- ============================================================================
-- WHY
--   POPIA consent existed only as a tick inside the per-party FICA panel on a
--   MATTER (010 consent_events, 033 in-place capture). Three problems with that,
--   all of which showed on the Friday run-through:
--
--     1. It gated NOTHING. consentStatus() rendered "Consent outstanding" and
--        the work carried on regardless. A compliance control that only draws a
--        label is a label.
--     2. It was invisible. One line inside a collapsed panel on one party of one
--        matter, on a page with twenty other things on it.
--     3. It was collected PER MATTER, so the same transaction asked for the same
--        consent again every time a service was opened under it.
--
--   Zewn, 2026-09-19: "we need the POPIA consent to stand out more and prevent
--   ConveyClear from moving forward … make it part of the property transfer and
--   state that it is therefore giving us POPIA consent for any matters related
--   to that transfer."
--
-- WHAT IT DOES
--   One append-only table of consent attestations, hung off the TRANSFER and
--   naming the PARTY each one covers. The transfer is the unit because the
--   transaction is: consent given once covers the COO, the rates clearance, the
--   building plans and the refund opened under it.
--
-- ⚠️ THIS IS AN ATTORNEY'S WARRANTY, NOT THE DATA SUBJECT'S OWN CONSENT.
--   POPIA consent has to come from the data subject, and a transfer has at least
--   two of them. What the firm can give — and what conveyancing practice already
--   runs on — is a warranty that it HOLDS each party's consent under its
--   mandate. So the row records who attested, for which party, and when, and
--   carries an OPTIONAL pointer to the signed form as evidence.
--
--   That distinction is why `attested_by` is NOT NULL and why the party is named
--   rather than the transfer simply being flagged: "this firm says it holds
--   consent from M. Dlamini" is a claim someone can be held to. "This transfer
--   has consent" is not.
--
-- ⚠️ APPEND-ONLY, LIKE consent_events. Consent can be WITHDRAWN, and a record
--   that is updated in place cannot show that it ever existed. Every change is a
--   new row; the newest row per (transfer, party) is the current position.
--
-- ⚠️ THE PARTY NAME IS DENORMALISED ON PURPOSE — read the cascade note below.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.transfer_consents (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id   uuid NOT NULL REFERENCES public.property_transfers(id) ON DELETE CASCADE,

  -- 🔴 SET NULL, NEVER CASCADE — and the name is kept beside it.
  --
  -- The four cascade traps found during the 09-17 wipe all had the same shape:
  -- a delete rewriting or removing rows nobody meant to touch. A consent
  -- attestation is a LEGAL RECORD of something a person claimed on a date. If
  -- editing the party list could delete it, the record would be worth nothing —
  -- and if it were CASCADE, removing a party would silently un-consent a
  -- transaction that had already been worked on.
  --
  -- So the link goes null and `party_name` carries what the row is about.
  transfer_party_id uuid REFERENCES public.transfer_parties(id) ON DELETE SET NULL,
  party_name    text NOT NULL,
  party_role    text NOT NULL,

  consent_type  text NOT NULL DEFAULT 'popia' CHECK (consent_type IN ('popia')),
  granted       boolean NOT NULL,

  -- Who warranted it. A staff member can also record one (a firm that sent the
  -- signed pack by email), so this is any user, not only a partner.
  attested_by   uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  attested_firm_id uuid REFERENCES public.firms(id) ON DELETE SET NULL,

  -- OPTIONAL evidence: the signed consent form, already uploaded to the
  -- transfer. Zewn: "with the option to upload a pdf but the pdf isn't
  -- required." A firm that holds a signed mandate may have nothing separate to
  -- attach, and refusing the attestation over a missing file would stop work on
  -- a transaction that is properly consented.
  evidence_document_id uuid REFERENCES public.transfer_documents(id) ON DELETE SET NULL,

  note          text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transfer_consents_transfer
  ON public.transfer_consents(transfer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transfer_consents_party
  ON public.transfer_consents(transfer_party_id);

COMMENT ON TABLE public.transfer_consents IS
  'Append-only POPIA consent attestations on a property transfer. One row per '
  'party per event; the newest row per (transfer_id, transfer_party_id) is the '
  'current position. An attorney WARRANTY that the firm holds the data '
  'subject''s consent — not the data subject''s own act. Covers every matter '
  'under the transfer (101).';

-- ---------------------------------------------------------------------------
-- RLS. Same shape as the transfer itself: staff see everything, a firm sees the
-- transfers it has been granted.
--
-- ⚠️ READ THROUGH THE GRANT (052), not property_transfers.business_partner_id.
-- The column beside the grant table is a display pointer and the two drift; the
-- grant is what actually confers access. Getting this wrong on a CONSENT table
-- would leak one firm's parties to another.
-- ---------------------------------------------------------------------------
ALTER TABLE public.transfer_consents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS transfer_consents_staff_all ON public.transfer_consents;
CREATE POLICY transfer_consents_staff_all ON public.transfer_consents
  FOR ALL TO authenticated
  USING (app_is_staff())
  WITH CHECK (app_is_staff());

DROP POLICY IF EXISTS transfer_consents_firm_read ON public.transfer_consents;
CREATE POLICY transfer_consents_firm_read ON public.transfer_consents
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.transfer_access_grants g
       WHERE g.transfer_id = transfer_consents.transfer_id
         AND g.firm_id = app_user_partner_id()
    )
  );

DROP POLICY IF EXISTS transfer_consents_firm_write ON public.transfer_consents;
CREATE POLICY transfer_consents_firm_write ON public.transfer_consents
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.transfer_access_grants g
       WHERE g.transfer_id = transfer_consents.transfer_id
         AND g.firm_id = app_user_partner_id()
    )
    -- A firm may only attest in its OWN name. Without this a partner could post
    -- a row crediting the attestation to another firm's user.
    AND attested_firm_id = app_user_partner_id()
  );

-- No UPDATE or DELETE policy for anyone, staff included beyond the staff_all
-- above: withdrawal is a new row with granted=false, never an edit. The staff
-- FOR ALL policy is kept so a genuine correction is possible through the
-- service role with a deliberate act, not through the app.

COMMIT;

-- ============================================================================
-- VERIFY (run after COMMIT)
--
--   -- 1. Table and policies exist.
--   SELECT policyname, cmd FROM pg_policies
--    WHERE tablename = 'transfer_consents' ORDER BY policyname;
--   -- expect: transfer_consents_firm_read (SELECT),
--   --         transfer_consents_firm_write (INSERT),
--   --         transfer_consents_staff_all (ALL)
--
--   -- 2. Nothing is consented yet, so every open transfer is now gated.
--   SELECT count(*) FROM public.transfer_consents;
--   -- expect 0
--
--   -- 3. ⚠️ HOW MUCH WORK THIS BLOCKS. Every transfer carrying a matter that
--   --    is not yet finished will refuse to progress until consent is given.
--   SELECT t.reference, count(m.id) AS matters
--     FROM public.property_transfers t
--     LEFT JOIN public.matters m ON m.transfer_id = t.id
--    WHERE t.status = 'open'
--    GROUP BY t.reference ORDER BY matters DESC;
--
-- THEN, IN THE APP: open a transfer as the firm, tick both parties on the POPIA
-- card, save. Confirm a matter under it can now be taken on, and that a DIFFERENT
-- transfer with no consent refuses with the reason shown on screen.
--
-- ROLLBACK
--   DROP TABLE IF EXISTS public.transfer_consents;
-- ============================================================================
