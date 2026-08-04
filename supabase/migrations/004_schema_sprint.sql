-- ============================================================================
-- ConveyClear — Migration 004: Schema Sprint (4-phase model + new tables)
-- ============================================================================
-- Created: 2026-05-29 (Day 10, Week 2 — was Week 1 Day 3 work, slipped)
-- Target:  Supabase project yhgriqagrhyblhmloctc (eu-west-1)
-- Run via: Supabase dashboard → SQL Editor (paste whole file, Run)
--
-- Implements 32-day plan §12 "Schema Changes Summary" + the structures in
-- §6 (activity feed), §7 (PoA), §8 (council email bridge), §9 (modular docs).
--
-- Conventions matched from 001_schema.sql: gen_random_uuid() PKs, TIMESTAMPTZ,
-- CHECK constraints for enums, explicit FK ON DELETE behaviour, indexes on FKs.
--
-- Idempotent: safe to re-run. Uses IF NOT EXISTS / guarded rename throughout.
--
-- ⚠️  AFTER RUNNING: the `CC - Deal Sync` n8n workflow references `sub_service`
--    in its SQL and WILL BREAK. Update + reimport that workflow same session.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Rename matters.sub_service → matters.service_notes   (plan §12, Francois)
--    Guarded so re-running after rename is a no-op.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'matters' AND column_name = 'sub_service'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'matters' AND column_name = 'service_notes'
  ) THEN
    ALTER TABLE matters RENAME COLUMN sub_service TO service_notes;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 2. New columns on existing tables   (plan §12)
-- ----------------------------------------------------------------------------
-- matters.current_phase: explicit 4-phase tracker. TEXT '1'..'4', nullable
-- (existing rows unknown until the app/n8n sets them).
ALTER TABLE matters
  ADD COLUMN IF NOT EXISTS current_phase TEXT
  CHECK (current_phase IS NULL OR current_phase IN ('1', '2', '3', '4'));

-- clients.marketing_opt_in: Phase 2 form capture. Sending infra deferred.
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS marketing_opt_in BOOLEAN NOT NULL DEFAULT false;

-- documents.document_request_id: link an uploaded doc back to the modular
-- document_request that asked for it. FK added in step 4 (after the table exists).
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS document_request_id UUID;

-- ----------------------------------------------------------------------------
-- 3. New tables
-- ----------------------------------------------------------------------------

-- 3a. document_types — master reference list of supplementary documents (§9).
CREATE TABLE IF NOT EXISTS document_types (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    code        TEXT        NOT NULL UNIQUE,
    name        TEXT        NOT NULL,
    description TEXT,
    category    TEXT,
    active      BOOLEAN     NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_document_types_category ON document_types(category);

-- 3b. document_requests — per-matter modular doc request package (Phase 4, §9).
CREATE TABLE IF NOT EXISTS document_requests (
    id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    matter_id             UUID        NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
    created_by            UUID        REFERENCES users(id) ON DELETE SET NULL,
    required_doc_type_ids UUID[]      NOT NULL DEFAULT '{}',
    request_form_url      TEXT,
    status                TEXT        NOT NULL DEFAULT 'pending'
                                      CHECK (status IN ('pending', 'partial', 'complete', 'expired')),
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at          TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_document_requests_matter ON document_requests(matter_id);
CREATE INDEX IF NOT EXISTS idx_document_requests_status ON document_requests(status);

-- 3c. power_of_attorneys — Phase 3 e-signed PoA, client-scoped, indefinite (§7).
CREATE TABLE IF NOT EXISTS power_of_attorneys (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id        UUID        NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    matter_id        UUID        REFERENCES matters(id) ON DELETE SET NULL, -- nullable: PoA may span many matters
    template_version TEXT,
    signature_data   TEXT,       -- base64 signature image / signature audit data
    pdf_storage_path TEXT,       -- Supabase Storage path
    pdf_drive_id     TEXT,       -- Google Drive file ID (parallel sync)
    signed_at        TIMESTAMPTZ,
    revoked_at       TIMESTAMPTZ, -- NULL = still active
    revoked_reason   TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_poa_client ON power_of_attorneys(client_id);
CREATE INDEX IF NOT EXISTS idx_poa_matter ON power_of_attorneys(matter_id);

-- 3d. council_email_routes — known council inboxes → matter routing labels (§8).
CREATE TABLE IF NOT EXISTS council_email_routes (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    email           TEXT        NOT NULL UNIQUE, -- e.g. plans@joburg.gov.za
    council_name    TEXT,       -- e.g. "City of Joburg - Planning Dept"
    municipality_id UUID        REFERENCES municipalities(id) ON DELETE SET NULL,
    contact_person  TEXT,
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_council_routes_municipality ON council_email_routes(municipality_id);

-- 3e. matter_activities — append-only activity feed per matter (§6).
CREATE TABLE IF NOT EXISTS matter_activities (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    matter_id     UUID        NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
    author_id     UUID        REFERENCES users(id) ON DELETE SET NULL, -- nullable for system / bridge posts
    author_label  TEXT,       -- for non-user posts e.g. "Council (via email bridge)"
    activity_type TEXT        NOT NULL DEFAULT 'post'
                              CHECK (activity_type IN (
                                  'post', 'status_change', 'document_upload',
                                  'phase_transition', 'email_bridge', 'system', 'poa_signed'
                              )),
    body          TEXT,
    metadata      JSONB,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- composite index supports the feed query: WHERE matter_id = ? ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS idx_matter_activities_matter_created
    ON matter_activities(matter_id, created_at DESC);

-- 3f. matter_subscribers — who gets notified about a matter's activity (§6).
CREATE TABLE IF NOT EXISTS matter_subscribers (
    matter_id               UUID NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
    user_id                 UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    notification_preference TEXT NOT NULL DEFAULT 'immediate'
                            CHECK (notification_preference IN ('immediate', 'digest', 'off')),
    PRIMARY KEY (matter_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_matter_subscribers_user ON matter_subscribers(user_id);

-- ----------------------------------------------------------------------------
-- 4. FK for documents.document_request_id (now that document_requests exists)
--    Guarded: ADD CONSTRAINT has no IF NOT EXISTS, so check the catalog first.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_documents_document_request'
  ) THEN
    ALTER TABLE documents
      ADD CONSTRAINT fk_documents_document_request
      FOREIGN KEY (document_request_id)
      REFERENCES document_requests(id) ON DELETE SET NULL;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_documents_document_request
    ON documents(document_request_id);

-- ----------------------------------------------------------------------------
-- 5. Seed document_types — 26 confirmed types from the 5 service SOPs.
--    Source: cc-notes and stuff/ConveyClear_Service_Specifications.md
-- ----------------------------------------------------------------------------
INSERT INTO document_types (code, name, description, category, active) VALUES
  ('id_certified',              'Certified ID Copy',                  'Certified copy of South African ID document', 'identity', true),
  ('id_certified_director',     'Director Certified ID Copy',         'Certified copy of Director ID', 'identity', true),
  ('id_certified_representative','Representative Certified ID',        'Certified copy of authorized representative ID', 'identity', true),
  ('id_certified_trustee',      'Trustee Certified ID Copy',          'Certified copy of Trustee ID', 'identity', true),
  ('proof_of_address',          'Proof of Address',                   'Utility bill, bank statement, or council letter not older than 3 months', 'identity', true),
  ('poa_signed',                'Signed Power of Attorney',           'ConveyClear standard POA signed by the client', 'authorization', true),
  ('popia_consent',             'POPIA Consent Form',                 'Signed POPIA consent', 'authorization', true),
  ('board_resolution',          'Board Resolution',                   'Board resolution authorizing the representative', 'authorization', true),
  ('letter_of_authority',       'Letter of Authority',                'Trust letter of authority authorizing the trustee', 'authorization', true),
  ('terms_and_conditions',      'Signed Terms and Conditions',        'ConveyClear signed T&Cs', 'authorization', true),
  ('cipc_docs',                 'CIPC Company Documents',             'Company registration documents from CIPC', 'company', true),
  ('cor14_3',                   'COR14.3 Registration Certificate',   'Directors register from CIPC', 'company', true),
  ('tax_clearance',             'Tax Clearance Certificate',          'Valid SARS tax clearance certificate', 'compliance', true),
  ('rates_account',             'Latest Municipal Rates Account',     'Most recent council rates account statement', 'property', true),
  ('property_description',      'Property Description',               'Full legal description of the property', 'property', true),
  ('municipal_account_number',  'Municipal Account Number',           'Council account number for the property', 'property', true),
  ('deed_search',               'Deed Search',                        'Deeds office title deed search document', 'property', true),
  ('transfer_letter',           'Transfer Confirmation Letter',       'Attorney transfer confirmation letter', 'legal', true),
  ('clearance_figures',         'Rates Clearance Figures',            'Municipal rates clearance figures document', 'legal', true),
  ('proof_of_application',      'Proof of Application',               'Proof that a rates clearance application was submitted', 'legal', true),
  ('proof_of_payment_figures',  'Proof of Payment for Figures',       'Receipt for rates clearance figure payment', 'legal', true),
  ('electrical_coc',            'Electrical Certificate of Compliance','COE-required electrical COC', 'compliance', true),
  ('proof_of_payment_clearance','Proof of Payment for Clearance',     'COJ-required payment proof for clearance figures', 'compliance', true),
  ('municipal_account_latest',  'Latest Municipal Account Statement', 'Full current municipal account for dispute evidence', 'dispute', true),
  ('dispute_evidence',          'Dispute Evidence Bundle',            'All evidence for MAD: correspondence, photos, meter readings', 'dispute', true),
  ('building_plans',            'Existing Building Plans',            'Approved building plans from municipal archives', 'property', true)
ON CONFLICT (code) DO NOTHING;

COMMIT;

-- ============================================================================
-- 6. Verification — run these after COMMIT to confirm the sprint landed.
-- ============================================================================
-- Expect: service_notes present, sub_service absent
SELECT column_name FROM information_schema.columns
  WHERE table_name = 'matters' AND column_name IN ('sub_service', 'service_notes');

-- Expect: 6 rows
SELECT table_name FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name IN ('document_types','document_requests','power_of_attorneys',
                       'council_email_routes','matter_activities','matter_subscribers')
  ORDER BY table_name;

-- Expect: current_phase | marketing_opt_in | document_request_id
SELECT table_name, column_name FROM information_schema.columns
  WHERE (table_name = 'matters'   AND column_name = 'current_phase')
     OR (table_name = 'clients'   AND column_name = 'marketing_opt_in')
     OR (table_name = 'documents' AND column_name = 'document_request_id');

-- Expect: 26
SELECT count(*) AS document_types_seeded FROM document_types;
