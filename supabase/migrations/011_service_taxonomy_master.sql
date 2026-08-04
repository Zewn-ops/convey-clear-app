-- =============================================================================
-- Migration 011 — Align service taxonomy to the MASTER DIRECTORY
-- =============================================================================
-- Master primary services (service lines): Business Compliance, Municipal Account
-- Dispute, Change of Ownership, Refund, Existing Building Plans, Property Rates
-- Clearance.  Decision (2026-05-31): adopt the master 6 + KEEP Pre-Paid Meter
-- Conversion (PPM) = 7 services total.
--
-- This migration: (1) adds Refund, (2) aligns display names to master, (3) records
-- each service's sub-types (the cert/dispute/variant choices that live UNDER the
-- primary service — e.g. COA/TL/… under Business Compliance). Sub-types merge into
-- existing config via `||` (non-destructive).
--
-- ⚠️ DEFERRED — do NOT run until after the 2026-06-01 internal demo. Pairs with the
-- n8n dynamic-service-mapping rework + the Pipedrive Primary Service field restructure
-- (see PIPEDRIVE_REBUILD.md). Running this alone is safe (additive/renames), but the
-- automation won't map services correctly until n8n + Pipedrive are also cut over.
-- =============================================================================

BEGIN;

-- 1. New service: Refund -------------------------------------------------------
INSERT INTO services (code, name, description, is_umbrella, config) VALUES (
  'REFUND',
  'Refund',
  'Recovery of credit balances / overpayments from a municipal account.',
  false,
  '{
    "stages": [
      {"code": "inquiry", "name": "Inquiry Received", "owner_role": "staff_services"},
      {"code": "quote_sent", "name": "Quote Sent", "owner_role": "staff_services"},
      {"code": "docs_pending", "name": "Documents Pending", "owner_role": "staff_services"},
      {"code": "onboarding_complete", "name": "Onboarding Complete", "owner_role": "staff_services"},
      {"code": "ops_in_progress", "name": "Operations Executing", "owner_role": "staff_ops"},
      {"code": "council_submission", "name": "Submitted to Council", "owner_role": "staff_ops"},
      {"code": "outcome_reached", "name": "Outcome Reached", "owner_role": "staff_ops"},
      {"code": "invoice_pending", "name": "Invoice Pending", "owner_role": "staff_services"},
      {"code": "offboarded", "name": "Matter Resolved", "owner_role": "staff_services"}
    ],
    "required_documents": {
      "natural_person": ["id", "por", "popia_consent", "poa", "municipal_account_latest"],
      "business": ["id_directors", "por", "popia_consent", "poa", "board_resolution", "company_reg", "municipal_account_latest"]
    },
    "payment_model": "on_completion",
    "documents_allow_not_available": false,
    "complexity": "medium",
    "TODO": "Confirm refund application form + exact required docs with Francois/Claudine."
  }'::jsonb
)
ON CONFLICT (code) DO NOTHING;

-- 2. Align display names to the master directory -------------------------------
UPDATE services SET name = 'Existing Building Plans',  updated_at = now() WHERE code = 'BP'  AND name <> 'Existing Building Plans';
UPDATE services SET name = 'Municipal Account Dispute', updated_at = now() WHERE code = 'MAD' AND name <> 'Municipal Account Dispute';
UPDATE services SET name = 'Property Rates Clearance',  updated_at = now() WHERE code = 'RCF' AND name <> 'Property Rates Clearance';

-- 3. Record sub-types per primary service (non-destructive merge) ---------------
-- Business Compliance — certificate/licence types
UPDATE services SET config = config || jsonb_build_object(
  'primary_subtypes', jsonb_build_array(
    jsonb_build_object('code','COA','name','Certificate of Acceptability'),
    jsonb_build_object('code','TL', 'name','Trading License'),
    jsonb_build_object('code','FSC','name','Fire Safety Compliance Letter'),
    jsonb_build_object('code','OC', 'name','Occupational Certificate'),
    jsonb_build_object('code','HL', 'name','Hawker License'),
    jsonb_build_object('code','LL', 'name','Liquor License')
  )), updated_at = now()
WHERE code = 'BC';

-- Municipal Account Dispute — dispute types
UPDATE services SET config = config || jsonb_build_object(
  'primary_subtypes', jsonb_build_array(
    jsonb_build_object('code','BILLING','name','Billing Issue'),
    jsonb_build_object('code','TRANSFER','name','Transfer Credit'),
    jsonb_build_object('code','CONSOLIDATION','name','Consolidation of accounts')
  )), updated_at = now()
WHERE code = 'MAD';

-- Property Rates Clearance — variants
UPDATE services SET config = config || jsonb_build_object(
  'primary_subtypes', jsonb_build_array(
    jsonb_build_object('code','FIGURES','name','Figures'),
    jsonb_build_object('code','CERTIFICATE','name','Certificate')
  )), updated_at = now()
WHERE code = 'RCF';

-- Change of Ownership — related conveyancing account actions (per master abbreviations)
UPDATE services SET config = config || jsonb_build_object(
  'related_actions', jsonb_build_array(
    jsonb_build_object('code','CRA','name','Close Rates Account'),
    jsonb_build_object('code','CUA','name','Close Utilities Account'),
    jsonb_build_object('code','ORA','name','Open Rates Account'),
    jsonb_build_object('code','OUA','name','Open Utilities Account')
  )), updated_at = now()
WHERE code = 'COO';

COMMIT;

-- Verify after running:
--   SELECT code, name, config ? 'primary_subtypes' AS has_subtypes FROM services ORDER BY code;
--   -- expect 7 rows: BC, BP, COO, MAD, PPM, RCF, REFUND
