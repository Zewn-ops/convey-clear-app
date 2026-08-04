-- ============================================================================
-- ConveyClear — Migration 007: Seed municipalities, services (all 5), and
-- email templates for COO (T1 confirmed, T2-T7 stubs)
-- ============================================================================
-- Created: 2026-05-30 (Day 11 of 32 — prep for Monday A&A presentation)
-- Target:  Supabase project yhgriqagrhyblhmloctc (eu-west-1)
-- Run via: psql pooler from VPS host OR Supabase dashboard SQL Editor
--
-- Source: ConveyClear_Service_Specifications.md (all 5 SOPs, read 2026-05-20)
--         Francois meeting notes (pipeline structure locked)
--
-- Idempotent: all INSERTs use ON CONFLICT DO UPDATE/NOTHING.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Municipalities (COT, COJ, COE + national placeholder)
-- ----------------------------------------------------------------------------
INSERT INTO municipalities (code, name, province, is_metro, active) VALUES
  ('COT', 'City of Tshwane',        'Gauteng', true, true),
  ('COJ', 'City of Johannesburg',   'Gauteng', true, true),
  ('COE', 'City of Ekurhuleni',     'Gauteng', true, true),
  ('OTHER', 'Other Municipality',   NULL,      false, true)
ON CONFLICT (code) DO UPDATE
  SET name     = EXCLUDED.name,
      province = EXCLUDED.province,
      is_metro = EXCLUDED.is_metro,
      active   = EXCLUDED.active,
      updated_at = now();

-- ----------------------------------------------------------------------------
-- 2. Services — all 5 services + BC umbrella
-- COO has full confirmed config. Others have confirmed structure, pricing TODO.
-- ----------------------------------------------------------------------------

-- 2a. Change of Ownership (COO) — FULLY CONFIRMED
INSERT INTO services (code, name, description, is_umbrella, config, active) VALUES (
  'COO',
  'Change of Ownership',
  'Municipal change of ownership registration for property transfers (COT, COJ, COE).',
  false,
  '{
    "stages": [
      {"code": "inquiry",              "name": "Inquiry Received",               "owner_role": "staff_services", "phase": 1},
      {"code": "doc_request_sent",     "name": "Document Request Sent",          "owner_role": "staff_services", "phase": 1},
      {"code": "docs_pending",         "name": "Documents Pending & Onboarding", "owner_role": "staff_services", "phase": 2},
      {"code": "onboarding_complete",  "name": "Onboarding Complete",            "owner_role": "staff_services", "phase": 2},
      {"code": "poa_pending",          "name": "PoA Pending",                    "owner_role": "staff_services", "phase": 3},
      {"code": "poa_signed",           "name": "PoA Signed",                     "owner_role": "staff_services", "phase": 3},
      {"code": "quote_sent",           "name": "Quote Sent",                     "owner_role": "staff_services", "phase": 4},
      {"code": "quote_accepted",       "name": "Quote Accepted — Ops Activated", "owner_role": "staff_ops",      "phase": 4},
      {"code": "ops_in_progress",      "name": "Operations Executing",           "owner_role": "staff_ops",      "phase": 4},
      {"code": "outcome_reached",      "name": "Outcome Reached",                "owner_role": "staff_ops",      "phase": 4},
      {"code": "invoice_pending",      "name": "Invoice Pending",                "owner_role": "staff_services", "phase": 4},
      {"code": "delivery_pending",     "name": "Pending Delivery",               "owner_role": "staff_services", "phase": 4},
      {"code": "offboarded",           "name": "Matter Resolved",                "owner_role": "staff_services", "phase": 4}
    ],
    "required_documents": {
      "natural_person": ["id_certified", "transfer_letter", "deed_search", "clearance_figures"],
      "business":       ["id_certified_director", "cor14_3", "transfer_letter", "deed_search", "clearance_figures"],
      "trust":          ["letter_of_authority", "id_certified_trustee", "transfer_letter", "deed_search", "clearance_figures"]
    },
    "municipality_specific_documents": {
      "COJ": ["proof_of_payment_clearance"],
      "COE": ["electrical_coc"]
    },
    "payment_model": "on_completion",
    "delivery_variants": ["cot_welcome", "coj_welcome", "coe_welcome"],
    "email_templates": {
      "doc_request":       "COO_T1",
      "ops_handover":      "COO_T2",
      "services_handover": "COO_T3",
      "final_invoice":     "COO_T4",
      "delivery_cot":      "COO_T5",
      "delivery_coj":      "COO_T6",
      "delivery_coe":      "COO_T7"
    },
    "exception_rules": [
      {"trigger": "no_docs_after_days", "value": 5,                            "action": "follow_up_client"},
      {"trigger": "no_response_after_days", "value": 3, "stage": "quote_sent", "action": "send_followup"},
      {"trigger": "authority_delay_after_days", "value": 7, "stage": "ops_in_progress", "action": "notify_client"}
    ],
    "clickup_task_title": "[Client Name] - Change of Ownership",
    "drive_naming": {
      "natural_person": "[Number]_[Initials Surname]_[ID Number]",
      "business":       "[Number]_[Company Name]"
    }
  }'::jsonb,
  true
)
ON CONFLICT (code) DO UPDATE
  SET name        = EXCLUDED.name,
      description = EXCLUDED.description,
      config      = EXCLUDED.config,
      active      = EXCLUDED.active,
      updated_at  = now();

-- 2b. Rates Clearance (RCF/RCC) — confirmed structure, pricing TODO
INSERT INTO services (code, name, description, is_umbrella, config, active) VALUES (
  'RCF',
  'Rates Clearance',
  'Rates clearance figures and certificate retrieval (RCF only, RCC only, or bundled). Typically initiated by a conveyancing attorney.',
  false,
  '{
    "stages": [
      {"code": "initiation",      "name": "Initiation & Doc Collection", "owner_role": "staff_services", "phase": 1},
      {"code": "onboarding",      "name": "Onboarding & Admin",          "owner_role": "staff_services", "phase": 2},
      {"code": "poa_pending",     "name": "PoA Pending",                 "owner_role": "staff_services", "phase": 3},
      {"code": "quote_sent",      "name": "Quote Sent",                  "owner_role": "staff_services", "phase": 4},
      {"code": "quote_accepted",  "name": "Quote Accepted — Ops Activated", "owner_role": "staff_ops", "phase": 4},
      {"code": "ops_in_progress", "name": "Operations Executing",        "owner_role": "staff_ops",      "phase": 4},
      {"code": "outcome_reached", "name": "Outcome Reached",             "owner_role": "staff_ops",      "phase": 4},
      {"code": "invoice_pending", "name": "Invoice Pending",             "owner_role": "staff_services", "phase": 4},
      {"code": "delivery_pending","name": "Pending Delivery",            "owner_role": "staff_services", "phase": 4},
      {"code": "offboarded",      "name": "Matter Resolved",             "owner_role": "staff_services", "phase": 4}
    ],
    "sub_scenarios": ["rcf_only", "rcc_only", "rcf_and_rcc"],
    "required_documents": {
      "all":        ["property_description", "municipal_account_number", "id_certified"],
      "scenario_a": ["proof_of_application"],
      "scenario_b": ["proof_of_payment_figures"],
      "scenario_c": []
    },
    "payment_model": "on_completion",
    "typical_initiator": "conveyancer",
    "drive_naming": "[Number]_[Conveyancer/Firm Name]",
    "clickup_task_title_variants": {
      "rcf_only": "[Firm Name] - RCF Retrieval",
      "rcc_only": "[Firm Name] - RCC Retrieval",
      "both":     "[Firm Name] - RCF + RCC Retrieval"
    },
    "email_templates": {
      "doc_request":       "RCF_T1",
      "ops_handover":      "RCF_T2",
      "services_handover": "RCF_T3",
      "final_invoice":     "RCF_T4"
    },
    "TODO_pricing": "Confirm fee amounts for RCF only / RCC only / bundled from Jukka",
    "TODO_email_bodies": "All 4 template bodies pending — seeded as inactive placeholders"
  }'::jsonb,
  true
)
ON CONFLICT (code) DO UPDATE
  SET name = EXCLUDED.name, description = EXCLUDED.description,
      config = EXCLUDED.config, active = EXCLUDED.active, updated_at = now();

-- 2c. Existing Building Plans (BP)
INSERT INTO services (code, name, description, is_umbrella, config, active) VALUES (
  'BP',
  'Building Plans Retrieval',
  'Retrieval of existing approved building plans from municipal archives. Two outcomes: plans found or official absence letter.',
  false,
  '{
    "stages": [
      {"code": "initiation",      "name": "Initiation & Doc Collection", "owner_role": "staff_services", "phase": 1},
      {"code": "onboarding",      "name": "Onboarding & Admin",          "owner_role": "staff_services", "phase": 2},
      {"code": "poa_pending",     "name": "PoA Pending",                 "owner_role": "staff_services", "phase": 3},
      {"code": "quote_sent",      "name": "Quote Sent",                  "owner_role": "staff_services", "phase": 4},
      {"code": "quote_accepted",  "name": "Quote Accepted — Ops Activated", "owner_role": "staff_ops", "phase": 4},
      {"code": "ops_in_progress", "name": "Operations Executing",        "owner_role": "staff_ops",      "phase": 4},
      {"code": "outcome_reached", "name": "Outcome Reached",             "owner_role": "staff_ops",      "phase": 4},
      {"code": "invoice_pending", "name": "Invoice Pending",             "owner_role": "staff_services", "phase": 4},
      {"code": "delivery_pending","name": "Pending Delivery",            "owner_role": "staff_services", "phase": 4},
      {"code": "offboarded",      "name": "Matter Resolved",             "owner_role": "staff_services", "phase": 4}
    ],
    "required_documents": {
      "natural_person": ["poa_signed", "rates_account", "id_certified"],
      "business":       ["poa_signed", "rates_account", "id_certified_representative", "board_resolution", "cipc_docs"],
      "trust":          ["poa_signed", "rates_account", "id_certified_trustee", "letter_of_authority"]
    },
    "outcome_variants": ["plans_found", "plans_absent"],
    "payment_model": "on_completion",
    "drive_naming": {"natural_person": "[Number]_[Initials Surname]_[ID Number]", "business": "[Number]_[Company Name]"},
    "clickup_task_title": "[Client Name] - Building Plans Retrieval",
    "email_templates": {
      "doc_request": "BP_T1", "ops_handover": "BP_T2", "services_handover": "BP_T3",
      "final_invoice": "BP_T4", "delivery_plans_found": "BP_T5", "delivery_plans_absent": "BP_T6"
    },
    "exception_rules": [{"trigger": "no_docs_after_days", "value": 5, "action": "follow_up_client"}],
    "TODO_email_bodies": "All 6 template bodies pending — seeded as inactive placeholders",
    "TODO_pricing": "Confirm fee with Jukka"
  }'::jsonb,
  true
)
ON CONFLICT (code) DO UPDATE
  SET name = EXCLUDED.name, description = EXCLUDED.description,
      config = EXCLUDED.config, active = EXCLUDED.active, updated_at = now();

-- 2d. Pre-Paid Meter Conversion (PPM) — COT only currently
INSERT INTO services (code, name, description, is_umbrella, config, active) VALUES (
  'PPM',
  'Pre-Paid Meter Conversion',
  'COT prepaid meter conversion expediting service. Council programme is free; ConveyClear charges for managing the application.',
  false,
  '{
    "stages": [
      {"code": "initiation",      "name": "Initiation, Quoting & Doc Collection", "owner_role": "staff_services", "phase": 1},
      {"code": "onboarding",      "name": "Onboarding & Admin",                   "owner_role": "staff_services", "phase": 2},
      {"code": "poa_pending",     "name": "PoA Pending",                          "owner_role": "staff_services", "phase": 3},
      {"code": "quote_sent",      "name": "Quote Sent",                           "owner_role": "staff_services", "phase": 4},
      {"code": "quote_accepted",  "name": "Quote Accepted — Ops Activated",       "owner_role": "staff_ops",      "phase": 4},
      {"code": "ops_in_progress", "name": "Operations Executing",                 "owner_role": "staff_ops",      "phase": 4},
      {"code": "outcome_reached", "name": "Outcome Reached — Meter Converted",    "owner_role": "staff_ops",      "phase": 4},
      {"code": "invoice_pending", "name": "Invoice Pending",                      "owner_role": "staff_services", "phase": 4},
      {"code": "delivery_pending","name": "Pending Delivery of Meter Details",    "owner_role": "staff_services", "phase": 4},
      {"code": "offboarded",      "name": "Matter Resolved",                      "owner_role": "staff_services", "phase": 4}
    ],
    "required_documents": {
      "natural_person": ["poa_signed", "rates_account", "id_certified"],
      "business":       ["poa_signed", "rates_account", "id_certified_representative", "board_resolution", "cipc_docs"],
      "trust":          ["poa_signed", "rates_account", "id_certified_trustee", "letter_of_authority"]
    },
    "supported_municipalities": ["COT"],
    "payment_model": "on_completion",
    "fee_type": "expediting_fee",
    "legal_note": "COT prepaid conversion is a free council programme. ConveyClear fee is strictly for expediting and managing the application. MUST be stated in all client communications.",
    "clickup_task_title": "[Client Name] - Prepaid Meter Conversion",
    "email_templates": {
      "quote_and_doc_request": "PPM_T1", "ops_handover": "PPM_T2",
      "services_handover": "PPM_T3", "final_invoice": "PPM_T4", "delivery_meter_info": "PPM_T5"
    },
    "TODO_email_bodies": "All 5 template bodies pending. PPM_T1 MUST state COT process is free and CC charges for expediting only.",
    "TODO_pricing": "Confirm expediting fee with Jukka"
  }'::jsonb,
  true
)
ON CONFLICT (code) DO UPDATE
  SET name = EXCLUDED.name, description = EXCLUDED.description,
      config = EXCLUDED.config, active = EXCLUDED.active, updated_at = now();

-- 2e. Municipal Account Disputes (MAD) — umbrella service, Jukka scoping required
INSERT INTO services (code, name, description, is_umbrella, config, active) VALUES (
  'MAD',
  'Municipal Account Disputes',
  'Ad-hoc municipal account dispute resolution. Arrears, wrongful billing, debt relief, dispute resolution. Split payment: initiation fee + success fee.',
  true,
  '{
    "stages": [
      {"code": "inquiry",                "name": "Receive & Assess Query",           "owner_role": "staff_services", "phase": 1},
      {"code": "jukka_scoping",          "name": "Pricing & Feasibility with Jukka", "owner_role": "admin",          "phase": 1},
      {"code": "initiation_fee_pending", "name": "Initiation Fee Pending",           "owner_role": "staff_services", "phase": 2},
      {"code": "onboarding",             "name": "Onboarding & Admin",               "owner_role": "staff_services", "phase": 2},
      {"code": "poa_pending",            "name": "PoA Pending",                      "owner_role": "staff_services", "phase": 3},
      {"code": "quote_accepted",         "name": "Quote Accepted — Ops Activated",   "owner_role": "staff_ops",      "phase": 4},
      {"code": "ops_in_progress",        "name": "Dispute in Progress",              "owner_role": "staff_ops",      "phase": 4},
      {"code": "outcome_reached",        "name": "Dispute Resolved",                 "owner_role": "staff_ops",      "phase": 4},
      {"code": "success_fee_pending",    "name": "Success Fee Invoiced — Docs Held", "owner_role": "staff_services", "phase": 4},
      {"code": "delivery_pending",       "name": "Success Fee Paid — Delivery",      "owner_role": "staff_services", "phase": 4},
      {"code": "offboarded",             "name": "Matter Resolved",                  "owner_role": "staff_services", "phase": 4}
    ],
    "required_documents": {
      "all": ["poa_signed", "id_certified", "municipal_account_latest", "dispute_evidence"]
    },
    "payment_model": "split",
    "payment_split": {
      "initiation_fee": "upfront_before_ops",
      "success_fee":    "on_resolution_before_document_release"
    },
    "hard_gates": [
      "do_not_proceed_without_initiation_fee_paid",
      "do_not_release_documents_without_success_fee_paid",
      "jukka_scoping_required_before_quote"
    ],
    "requires_jukka_scoping": true,
    "email_templates": {
      "assessment_and_fees":    "MAD_T1",
      "initiation_invoice_docs":"MAD_T2",
      "ops_handover_brief":     "MAD_T3",
      "progress_update":        "MAD_T4",
      "services_handover":      "MAD_T5",
      "success_fee_invoice":    "MAD_T6",
      "final_resolution":       "MAD_T7"
    },
    "TODO_email_bodies": "All 7 template bodies pending. MAD_T3 must be especially detailed (background + exact goal + deadline).",
    "TODO_pricing": "Custom per case — Jukka prices each MAD individually. No default amount."
  }'::jsonb,
  true
)
ON CONFLICT (code) DO UPDATE
  SET name = EXCLUDED.name, description = EXCLUDED.description,
      config = EXCLUDED.config, active = EXCLUDED.active, updated_at = now();

-- ----------------------------------------------------------------------------
-- 3. Email templates — COO
-- T1: confirmed full body. T2–T7: placeholder stubs (active = false).
-- ----------------------------------------------------------------------------

-- COO_T1 — CONFIRMED full content from SOP
INSERT INTO email_templates (code, service_code, name, subject, body, description, active) VALUES (
  'COO_T1',
  'COO',
  'COO: Document Request',
  'Action Required: Documents for Change of Ownership',
  'Dear {{client_name}},

To proceed with the municipal Change of Ownership for {{property_description}},
we kindly require the following documents:

- Transfer Confirmation Letter
- Deed Search
- Clearance Figures
- For Individuals: Certified ID of Owner
- For Companies: COR14.3 Registration Certificate & Appointed Director''s Certified ID
- For Trusts: Letter of Authority & Appointed Trustee''s Certified ID

Municipality-Specific Requirements:
- If City of Johannesburg: Proof of Payment for Clearance Figures.
- If City of Ekurhuleni: Electrical Certificate of Compliance (COC).

Please reply to this email with the attached documents so we can prepare
the file for submission.

Kind regards,
The ConveyClear Team',
  'Stage 1A — request docs from client or conveyancer. Triggered when deal reaches doc_request_sent stage.',
  true
)
ON CONFLICT (code) DO UPDATE
  SET subject = EXCLUDED.subject, body = EXCLUDED.body,
      active = EXCLUDED.active, updated_at = now();

-- COO_T2 — Services → Ops handover (stub)
INSERT INTO email_templates (code, service_code, name, subject, body, description, active) VALUES (
  'COO_T2', 'COO', 'COO: Services → Ops Handover',
  'HANDOVER TO OPS: {{client_name}} | Change of Ownership',
  '-- TODO: Body pending Claudine --',
  'Stage 1B — Services hands over to Ops after onboarding complete.',
  false
)
ON CONFLICT (code) DO UPDATE SET updated_at = now();

-- COO_T3 — Ops → Services handover (stub)
INSERT INTO email_templates (code, service_code, name, subject, body, description, active) VALUES (
  'COO_T3', 'COO', 'COO: Ops → Services Handover',
  'HANDOVER TO SERVICES: {{client_name}} COO Completed',
  '-- TODO: Body pending Claudine --',
  'Stage 2A — Ops signals completion back to Services.',
  false
)
ON CONFLICT (code) DO UPDATE SET updated_at = now();

-- COO_T4 — Final invoice (stub)
INSERT INTO email_templates (code, service_code, name, subject, body, description, active) VALUES (
  'COO_T4', 'COO', 'COO: Final Invoice',
  'Application Complete - Invoice Attached',
  '-- TODO: Body pending Claudine --',
  'Stage 3A — final invoice sent to client.',
  false
)
ON CONFLICT (code) DO UPDATE SET updated_at = now();

-- COO_T5 — COT welcome letter (stub)
INSERT INTO email_templates (code, service_code, name, subject, body, description, active) VALUES (
  'COO_T5', 'COO', 'COO: COT Welcome Letter',
  'Your New City of Tshwane Municipal Account Details',
  '-- TODO: Municipality-specific content needed --',
  'Stage 3A delivery — City of Tshwane new account welcome.',
  false
)
ON CONFLICT (code) DO UPDATE SET updated_at = now();

-- COO_T6 — COJ welcome letter (stub)
INSERT INTO email_templates (code, service_code, name, subject, body, description, active) VALUES (
  'COO_T6', 'COO', 'COO: COJ Welcome Letter',
  'Your New City of Johannesburg Municipal Account Details',
  '-- TODO: Municipality-specific content needed --',
  'Stage 3A delivery — City of Johannesburg new account welcome.',
  false
)
ON CONFLICT (code) DO UPDATE SET updated_at = now();

-- COO_T7 — COE welcome letter (stub)
INSERT INTO email_templates (code, service_code, name, subject, body, description, active) VALUES (
  'COO_T7', 'COO', 'COO: COE Welcome Letter',
  'Your New City of Ekurhuleni Municipal Account Details',
  '-- TODO: Municipality-specific content needed --',
  'Stage 3A delivery — City of Ekurhuleni new account welcome.',
  false
)
ON CONFLICT (code) DO UPDATE SET updated_at = now();

-- ----------------------------------------------------------------------------
-- 4. Email template stubs for RCF, BP, PPM, MAD
-- All inactive — bodies pending Claudine/Jukka
-- ----------------------------------------------------------------------------

-- RCF templates
INSERT INTO email_templates (code, service_code, name, subject, body, active) VALUES
  ('RCF_T1', 'RCF', 'RCF: Document Request to Conveyancer',  'Action Required: Documents for Rates Clearance',        '-- TODO --', false),
  ('RCF_T2', 'RCF', 'RCF: Services → Ops Handover',          'HANDOVER TO OPS: {{client_name}} | Rates Clearance',    '-- TODO --', false),
  ('RCF_T3', 'RCF', 'RCF: Ops → Services Handover',          'HANDOVER TO SERVICES: {{client_name}} RCF Completed',   '-- TODO --', false),
  ('RCF_T4', 'RCF', 'RCF: Final Invoice',                    'Rates Clearance Complete - Invoice Attached',            '-- TODO --', false)
ON CONFLICT (code) DO UPDATE SET updated_at = now();

-- BP templates
INSERT INTO email_templates (code, service_code, name, subject, body, active) VALUES
  ('BP_T1', 'BP', 'BP: Document Request',         'Action Required: Documents for Building Plans Retrieval',  '-- TODO --', false),
  ('BP_T2', 'BP', 'BP: Services → Ops Handover',  'HANDOVER TO OPS: {{client_name}} | Building Plans',        '-- TODO --', false),
  ('BP_T3', 'BP', 'BP: Ops → Services Handover',  'HANDOVER TO SERVICES: {{client_name}} BP Completed',       '-- TODO --', false),
  ('BP_T4', 'BP', 'BP: Final Invoice',             'Building Plans Retrieval - Invoice Attached',              '-- TODO --', false),
  ('BP_T5', 'BP', 'BP: Delivery — Plans Found',    'Your Building Plans Are Ready',                            '-- TODO --', false),
  ('BP_T6', 'BP', 'BP: Delivery — Plans Absent',   'Official Confirmation: No Plans Found on Record',          '-- TODO --', false)
ON CONFLICT (code) DO UPDATE SET updated_at = now();

-- PPM templates
INSERT INTO email_templates (code, service_code, name, subject, body, active) VALUES
  ('PPM_T1', 'PPM', 'PPM: Quote & Document Request',  'Pre-Paid Meter Conversion - Quote & Documents Required',   '-- TODO: MUST state COT process is free; CC charges for expediting only --', false),
  ('PPM_T2', 'PPM', 'PPM: Services → Ops Handover',   'HANDOVER TO OPS: {{client_name}} | Prepaid Meter',         '-- TODO --', false),
  ('PPM_T3', 'PPM', 'PPM: Ops → Services Handover',   'HANDOVER TO SERVICES: {{client_name}} Meter Converted',    '-- TODO --', false),
  ('PPM_T4', 'PPM', 'PPM: Final Invoice',              'Prepaid Meter Conversion - Invoice Attached',              '-- TODO --', false),
  ('PPM_T5', 'PPM', 'PPM: Delivery — Meter Details',  'Your New Pre-Paid Meter Details',                          '-- TODO --', false)
ON CONFLICT (code) DO UPDATE SET updated_at = now();

-- MAD templates
INSERT INTO email_templates (code, service_code, name, subject, body, active) VALUES
  ('MAD_T1', 'MAD', 'MAD: Assessment & Fee Structure',        '{{municipality}} | {{property_description}} | {{client_name}} — Assessment',  '-- TODO --', false),
  ('MAD_T2', 'MAD', 'MAD: Initiation Invoice & Doc Request',  '{{municipality}} | {{property_description}} | {{client_name}} — Invoice',     '-- TODO --', false),
  ('MAD_T3', 'MAD', 'MAD: Services → Ops Handover (Brief)',   'HANDOVER TO OPS (DETAILED): {{client_name}} | MAD: {{dispute_goal}}',         '-- TODO: especially detailed — background + goal + deadline --', false),
  ('MAD_T4', 'MAD', 'MAD: Progress Update',                   '{{municipality}} | {{property_description}} | {{client_name}} — Update',     '-- TODO --', false),
  ('MAD_T5', 'MAD', 'MAD: Ops → Services Handover',           'HANDOVER TO SERVICES: {{client_name}} MAD Resolved',                         '-- TODO --', false),
  ('MAD_T6', 'MAD', 'MAD: Success Fee Invoice',               '{{municipality}} | {{property_description}} | {{client_name}} — Success Fee','-- TODO --', false),
  ('MAD_T7', 'MAD', 'MAD: Final Resolution & Offboarding',    'Your Dispute Has Been Resolved — {{client_name}}',                            '-- TODO --', false)
ON CONFLICT (code) DO UPDATE SET updated_at = now();

COMMIT;

-- ============================================================================
-- HOW TO RUN (from VPS host — uses pooler, IPv4 safe):
--
-- psql "postgresql://postgres.yhgriqagrhyblhmloctc:[PASSWORD]@aws-0-eu-west-1.pooler.supabase.com:5432/postgres?sslmode=require" \
--   -f 007_seed_services_coo.sql
--
-- Or paste into Supabase dashboard → SQL Editor → Run
-- ============================================================================
