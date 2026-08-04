-- =============================================================================
-- ConveyClear Database Seed Data
-- Version: 002
-- Date: 2026-05-15
-- Author: Zuaan Holl
-- Description: Initial seed data for production.
--              - 8 municipalities (3 metros active, 5 placeholders)
--              - 8 services (BC with full config, 7 others with TODO placeholders)
--              - 5 email templates (FICA onboarding flow)
--              - 6 users (ConveyClear team placeholders + Zuaan)
--
-- Idempotency: Uses ON CONFLICT DO NOTHING where appropriate so this can be
--              re-run safely. Will NOT overwrite existing rows.
-- =============================================================================

-- =============================================================================
-- MUNICIPALITIES
-- =============================================================================

INSERT INTO municipalities (code, name, province, is_metro, active) VALUES
    ('COT',   'City of Tshwane',         'Gauteng', true,  true),
    ('COJ',   'City of Johannesburg',    'Gauteng', true,  true),
    ('COE',   'City of Ekurhuleni',      'Gauteng', true,  true),
    ('CCT',   'City of Cape Town',       'Western Cape', true, false),
    ('EKD',   'Ethekwini',               'KwaZulu-Natal', true, false),
    ('NMM',   'Nelson Mandela Bay',      'Eastern Cape', true, false),
    ('BCM',   'Buffalo City',            'Eastern Cape', true, false),
    ('MAN',   'Mangaung',                'Free State', true, false)
ON CONFLICT (code) DO NOTHING;

-- =============================================================================
-- SERVICES
-- BC = Business Compliance         (full config - most complete master doc)
-- COO = Change of Ownership        (skeleton + TODO)
-- BP  = Existing Building Plans    (skeleton + TODO)
-- PPM = Pre-Paid Meter Install     (skeleton + TODO)
-- MAQ = Municipal Account Queries  (skeleton + TODO)
-- RCF = Rates Clearance Figures    (skeleton + TODO)
-- RCC = Rates Clearance Certificate (skeleton + TODO)
-- MAD = Municipal Account Disputes (umbrella catchall)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Business Compliance (FULL CONFIG - canonical reference)
-- -----------------------------------------------------------------------------

INSERT INTO services (code, name, description, is_umbrella, config) VALUES (
    'BC',
    'Business Compliance',
    'End-to-end business compliance services: COA, Trading License, Food Safety Certificate, Occupational Certificate, Health License, Liquor License.',
    false,
    '{
        "stages": [
            {"code": "inquiry", "name": "Inquiry Received", "owner_role": "staff_services"},
            {"code": "quote_sent", "name": "Quote Sent", "owner_role": "staff_services"},
            {"code": "quote_accepted", "name": "Quote Accepted", "owner_role": "staff_services"},
            {"code": "docs_pending", "name": "FICA Documents Pending", "owner_role": "staff_services"},
            {"code": "onboarding_complete", "name": "Onboarding Complete", "owner_role": "staff_services"},
            {"code": "payment_pending", "name": "Deposit Pending", "owner_role": "staff_services"},
            {"code": "ops_in_progress", "name": "Operations Executing", "owner_role": "staff_ops"},
            {"code": "council_submission", "name": "Submitted to Council", "owner_role": "staff_ops"},
            {"code": "council_review", "name": "Council Reviewing", "owner_role": "staff_ops"},
            {"code": "outcome_reached", "name": "Outcome Reached", "owner_role": "staff_ops"},
            {"code": "invoice_pending", "name": "Final Invoice Pending", "owner_role": "staff_services"},
            {"code": "delivery_pending", "name": "Pending Delivery", "owner_role": "staff_delivery"},
            {"code": "offboarded", "name": "Matter Resolved", "owner_role": "staff_services"}
        ],
        "required_documents": {
            "natural_person": ["id", "por", "tc", "poa", "popia_consent"],
            "business": ["id_directors", "por", "tc", "poa", "popia_consent", "board_resolution", "company_reg"]
        },
        "supplementary_documents": [
            "cleaning_schedule",
            "pest_control_certificate",
            "zoning_certificate",
            "transport_vehicle_registrations",
            "building_plans",
            "menu",
            "trading_license_prior",
            "fire_safety_certificate"
        ],
        "payment_model": "upfront",
        "payment_trigger_stage": "onboarding_complete",
        "payment_gates_stage": "ops_in_progress",
        "uses_two_form_pattern": true,
        "form_1_purpose": "FICA onboarding (universal)",
        "form_2_purpose": "Business compliance supplementary docs (BC-specific)",
        "email_templates": {
            "quote": "BC_T1",
            "onboarding_link": "BC_AUTO_A",
            "welcome": "BC_T4",
            "ops_handover": "BC_T17",
            "submission_confirmation": "BC_T5",
            "outcome_success": "BC_T6",
            "outcome_failure": "BC_T15",
            "invoice": "BC_T_INVOICE",
            "delivery_schedule": "BC_T16",
            "offboard": "BC_T7"
        },
        "exception_rules": [
            {"trigger": "no_response_after_days", "value": 3, "stage": "quote_sent", "action": "send_template:BC_T8"},
            {"trigger": "no_response_after_days", "value": 5, "stage": "docs_pending", "action": "send_template:BC_T9"},
            {"trigger": "authority_delay_after_days", "value": 7, "stage": "council_review", "action": "send_template:BC_T14"},
            {"trigger": "missing_document_on_form_submit", "stage": "docs_pending", "action": "notify_staff:francois@conveyclear.co.za"}
        ],
        "pipedrive_pipeline_id": 10,
        "pipedrive_stage_map": {
            "inquiry": 51,
            "quote_sent": 52,
            "docs_pending": 53,
            "onboarding_complete": 54
        },
        "clickup_target": {
            "team_id": "90152515723",
            "space_id": "901510781963",
            "folder_id": "901515625422",
            "list_id": "901522814944"
        },
        "drive_folder_structure": ["FICA", "Authorizations", "Supporting Docs", "Council Correspondence", "Output"],
        "sub_services": ["restaurant", "trailer", "shop", "office", "warehouse", "coffee_shop", "other"],
        "complexity": "high",
        "documents_allow_not_available": true
    }'::jsonb
)
ON CONFLICT (code) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 2. Change of Ownership (PLACEHOLDER - needs full config from master doc)
-- -----------------------------------------------------------------------------

INSERT INTO services (code, name, description, is_umbrella, config) VALUES (
    'COO',
    'Change of Ownership',
    'Property transfer-related changes of ownership in municipal records.',
    false,
    '{
        "TODO": "Complete config from Change_of_Ownership_COO_MASTER_DOC.docx",
        "stages": [
            {"code": "inquiry", "name": "Inquiry Received", "owner_role": "staff_services"},
            {"code": "quote_sent", "name": "Quote Sent", "owner_role": "staff_services"},
            {"code": "docs_pending", "name": "Documents Pending", "owner_role": "staff_services"},
            {"code": "onboarding_complete", "name": "Onboarding Complete", "owner_role": "staff_services"},
            {"code": "ops_in_progress", "name": "Operations Executing", "owner_role": "staff_ops"},
            {"code": "outcome_reached", "name": "Outcome Reached", "owner_role": "staff_ops"},
            {"code": "invoice_pending", "name": "Invoice Pending", "owner_role": "staff_services"},
            {"code": "offboarded", "name": "Matter Resolved", "owner_role": "staff_services"}
        ],
        "required_documents": {
            "natural_person": ["id", "por", "popia_consent", "transfer_letter_from_attorney"],
            "business": ["id_directors", "por", "popia_consent", "board_resolution", "transfer_letter_from_attorney"]
        },
        "payment_model": "on_completion",
        "documents_allow_not_available": false,
        "complexity": "low",
        "TODO_email_templates": "Define COO_T1, COO_T2, etc. from master doc",
        "TODO_exception_rules": "Define follow-up cadences",
        "TODO_pipedrive_stage_map": "Map Pipedrive stages once COO pipeline is set up",
        "TODO_municipality_specific": "Per master doc: COT/COJ/COE have different welcome letters - branch templates by municipality"
    }'::jsonb
)
ON CONFLICT (code) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 3. Existing Building Plans (PLACEHOLDER)
-- -----------------------------------------------------------------------------

INSERT INTO services (code, name, description, is_umbrella, config) VALUES (
    'BP',
    'Existing Building Plans',
    'Obtaining existing approved building plans from municipal records.',
    false,
    '{
        "TODO": "Complete config from Property_Existing_Building_Plans_MASTER_DOC.docx",
        "stages": [
            {"code": "inquiry", "name": "Inquiry Received", "owner_role": "staff_services"},
            {"code": "quote_sent", "name": "Quote Sent", "owner_role": "staff_services"},
            {"code": "docs_pending", "name": "Documents Pending", "owner_role": "staff_services"},
            {"code": "onboarding_complete", "name": "Onboarding Complete", "owner_role": "staff_services"},
            {"code": "ops_in_progress", "name": "Operations Executing", "owner_role": "staff_ops"},
            {"code": "outcome_reached", "name": "Outcome Reached", "owner_role": "staff_ops"},
            {"code": "invoice_pending", "name": "Invoice Pending", "owner_role": "staff_services"},
            {"code": "offboarded", "name": "Matter Resolved", "owner_role": "staff_services"}
        ],
        "required_documents": {
            "natural_person": ["id", "por", "popia_consent"],
            "business": ["id_directors", "por", "popia_consent", "board_resolution"]
        },
        "outcome_variants": ["plans_found", "plans_absent"],
        "payment_model": "on_completion",
        "documents_allow_not_available": false,
        "complexity": "medium",
        "TODO_email_templates": "Define BP_T1 etc. from master doc",
        "TODO_outcome_handling": "Plans-absent flow needs special handling - per master doc may need follow-on service"
    }'::jsonb
)
ON CONFLICT (code) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 4. Pre-Paid Meter Installation (PLACEHOLDER)
-- -----------------------------------------------------------------------------

INSERT INTO services (code, name, description, is_umbrella, config) VALUES (
    'PPM',
    'Pre-Paid Meter Installation',
    'Application and installation of pre-paid electricity meters. Currently COT-only.',
    false,
    '{
        "TODO": "Complete config from Property_Installation_of_Pre-Paid_Meters_MASTER_DOC.docx",
        "stages": [
            {"code": "inquiry", "name": "Inquiry Received", "owner_role": "staff_services"},
            {"code": "quote_sent", "name": "Quote Sent", "owner_role": "staff_services"},
            {"code": "docs_pending", "name": "Documents Pending", "owner_role": "staff_services"},
            {"code": "onboarding_complete", "name": "Onboarding Complete", "owner_role": "staff_services"},
            {"code": "ops_in_progress", "name": "Operations Executing", "owner_role": "staff_ops"},
            {"code": "installation_scheduled", "name": "Installation Scheduled", "owner_role": "staff_ops"},
            {"code": "outcome_reached", "name": "Outcome Reached", "owner_role": "staff_ops"},
            {"code": "invoice_pending", "name": "Invoice Pending", "owner_role": "staff_services"},
            {"code": "offboarded", "name": "Matter Resolved", "owner_role": "staff_services"}
        ],
        "required_documents": {
            "natural_person": ["id", "por", "popia_consent"],
            "business": ["id_directors", "por", "popia_consent", "board_resolution"]
        },
        "payment_model": "on_completion",
        "documents_allow_not_available": false,
        "supported_municipalities": ["COT"],
        "complexity": "medium",
        "TODO_email_templates": "Define PPM_T1 etc. from master doc",
        "TODO_contractor_coordination": "Installation requires private contractor scheduling - links to future contractor portal"
    }'::jsonb
)
ON CONFLICT (code) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 5. Municipal Account Queries (PLACEHOLDER - has unique split payment model)
-- -----------------------------------------------------------------------------

INSERT INTO services (code, name, description, is_umbrella, config) VALUES (
    'MAQ',
    'Municipal Account Queries',
    'Resolution of disputed or erroneous municipal account charges.',
    false,
    '{
        "TODO": "Complete config from Property_Municipal_Account_Queries_MASTER_DOC.docx",
        "stages": [
            {"code": "inquiry", "name": "Inquiry Received", "owner_role": "staff_services"},
            {"code": "scoping", "name": "Scoping with Jukka", "owner_role": "admin"},
            {"code": "quote_sent", "name": "Initiation Fee Quote Sent", "owner_role": "staff_services"},
            {"code": "docs_pending", "name": "Documents Pending", "owner_role": "staff_services"},
            {"code": "onboarding_complete", "name": "Onboarding Complete", "owner_role": "staff_services"},
            {"code": "initiation_fee_paid", "name": "Initiation Fee Paid", "owner_role": "staff_services"},
            {"code": "ops_in_progress", "name": "Operations Executing", "owner_role": "staff_ops"},
            {"code": "outcome_reached", "name": "Outcome Reached", "owner_role": "staff_ops"},
            {"code": "success_fee_invoiced", "name": "Success Fee Invoiced", "owner_role": "staff_services"},
            {"code": "offboarded", "name": "Matter Resolved", "owner_role": "staff_services"}
        ],
        "required_documents": {
            "natural_person": ["id", "por", "popia_consent", "rates_account_statement"],
            "business": ["id_directors", "por", "popia_consent", "board_resolution", "rates_account_statement"]
        },
        "payment_model": "split",
        "payment_split": ["initiation_fee", "success_fee"],
        "outcome_variants": ["dispute_won", "dispute_lost", "partial_resolution"],
        "documents_allow_not_available": false,
        "requires_jukka_scoping": true,
        "complexity": "high",
        "TODO_email_templates": "Define MAQ_T1 etc. from master doc",
        "TODO_pricing_logic": "Initiation fee + success fee structure - requires Jukka per matter pricing"
    }'::jsonb
)
ON CONFLICT (code) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 6. Rates Clearance Figures (PLACEHOLDER)
-- -----------------------------------------------------------------------------

INSERT INTO services (code, name, description, is_umbrella, config) VALUES (
    'RCF',
    'Rates Clearance Figures',
    'Obtaining rates clearance figures from municipality for property transfers. Typically conveyancer-driven.',
    false,
    '{
        "TODO": "Complete config from Property_Rates_Clearance_MASTER_DOC.docx",
        "stages": [
            {"code": "inquiry", "name": "Inquiry Received", "owner_role": "staff_services"},
            {"code": "quote_sent", "name": "Quote Sent", "owner_role": "staff_services"},
            {"code": "docs_pending", "name": "Documents Pending", "owner_role": "staff_services"},
            {"code": "onboarding_complete", "name": "Onboarding Complete", "owner_role": "staff_services"},
            {"code": "ops_in_progress", "name": "Operations Executing", "owner_role": "staff_ops"},
            {"code": "outcome_reached", "name": "Outcome Reached", "owner_role": "staff_ops"},
            {"code": "invoice_pending", "name": "Invoice Pending", "owner_role": "staff_services"},
            {"code": "offboarded", "name": "Matter Resolved", "owner_role": "staff_services"}
        ],
        "required_documents": {
            "natural_person": ["id", "por", "popia_consent", "transfer_letter_from_attorney"],
            "business": ["id_directors", "por", "popia_consent", "board_resolution", "transfer_letter_from_attorney"]
        },
        "payment_model": "on_completion",
        "documents_allow_not_available": false,
        "typical_origin": "conveyancer",
        "complexity": "low",
        "TODO_email_templates": "Define RCF_T1 etc. from master doc",
        "TODO_attorney_workflow": "Often initiated by attorneys like Genie - future permanent submission link feature"
    }'::jsonb
)
ON CONFLICT (code) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 7. Rates Clearance Certificate (PLACEHOLDER)
-- -----------------------------------------------------------------------------

INSERT INTO services (code, name, description, is_umbrella, config) VALUES (
    'RCC',
    'Rates Clearance Certificate',
    'Obtaining the actual rates clearance certificate. Often follows RCF.',
    false,
    '{
        "TODO": "Complete config from Property_Rates_Clearance_MASTER_DOC.docx",
        "stages": [
            {"code": "inquiry", "name": "Inquiry Received", "owner_role": "staff_services"},
            {"code": "quote_sent", "name": "Quote Sent", "owner_role": "staff_services"},
            {"code": "docs_pending", "name": "Documents Pending", "owner_role": "staff_services"},
            {"code": "onboarding_complete", "name": "Onboarding Complete", "owner_role": "staff_services"},
            {"code": "ops_in_progress", "name": "Operations Executing", "owner_role": "staff_ops"},
            {"code": "outcome_reached", "name": "Outcome Reached", "owner_role": "staff_ops"},
            {"code": "invoice_pending", "name": "Invoice Pending", "owner_role": "staff_services"},
            {"code": "offboarded", "name": "Matter Resolved", "owner_role": "staff_services"}
        ],
        "required_documents": {
            "natural_person": ["id", "por", "popia_consent", "transfer_letter_from_attorney"],
            "business": ["id_directors", "por", "popia_consent", "board_resolution", "transfer_letter_from_attorney"]
        },
        "payment_model": "on_completion",
        "documents_allow_not_available": false,
        "typical_origin": "conveyancer",
        "follows_service": "RCF",
        "complexity": "low",
        "TODO_email_templates": "Define RCC_T1 etc. from master doc",
        "TODO_chained_matters": "Architectural question - should RCC auto-create after RCF outcome? Link via related_matter_id?"
    }'::jsonb
)
ON CONFLICT (code) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 8. Municipal Account Disputes (UMBRELLA - catchall)
-- -----------------------------------------------------------------------------

INSERT INTO services (code, name, description, is_umbrella, config) VALUES (
    'MAD',
    'Municipal Account Disputes (Umbrella)',
    'Catch-all for services not yet streamlined. Promoted to dedicated service codes once volume justifies it.',
    true,
    '{
        "TODO": "Umbrella service. As sub-categories build volume (billing issue, credit transfer, consolidation), promote them to dedicated service codes.",
        "stages": [
            {"code": "inquiry", "name": "Inquiry Received", "owner_role": "staff_services"},
            {"code": "scoping", "name": "Scoping with Jukka", "owner_role": "admin"},
            {"code": "quote_sent", "name": "Quote Sent", "owner_role": "staff_services"},
            {"code": "docs_pending", "name": "Documents Pending", "owner_role": "staff_services"},
            {"code": "onboarding_complete", "name": "Onboarding Complete", "owner_role": "staff_services"},
            {"code": "ops_in_progress", "name": "Operations Executing", "owner_role": "staff_ops"},
            {"code": "outcome_reached", "name": "Outcome Reached", "owner_role": "staff_ops"},
            {"code": "invoice_pending", "name": "Invoice Pending", "owner_role": "staff_services"},
            {"code": "offboarded", "name": "Matter Resolved", "owner_role": "staff_services"}
        ],
        "required_documents": {
            "natural_person": ["id", "por", "popia_consent"],
            "business": ["id_directors", "por", "popia_consent", "board_resolution"]
        },
        "payment_model": "manual_scoping",
        "requires_jukka_scoping": true,
        "documents_allow_not_available": true,
        "known_sub_services": [
            "billing_issue",
            "credit_transfer",
            "account_consolidation",
            "statement_request",
            "meter_reading_dispute",
            "other"
        ],
        "complexity": "variable"
    }'::jsonb
)
ON CONFLICT (code) DO NOTHING;

-- =============================================================================
-- USERS - ConveyClear team + Zuaan
-- TODO: Replace placeholder emails with actual emails once confirmed with Jukka
-- =============================================================================

INSERT INTO users (email, full_name, role, active) VALUES
    ('jukka@conveyclear.co.za',     'Jukka',     'admin',           true),
    ('francois@conveyclear.co.za',  'Francois',  'staff_services',  true),
    ('franzu@conveyclear.co.za',    'Franzu',    'staff_services',  true),
    ('andrew@conveyclear.co.za',    'Andrew',    'staff_ops',       true),
    ('claudine@conveyclear.co.za',  'Claudine',  'staff_ops',       true),
    ('zuaan@quantra.co.za',         'Zuaan Holl', 'admin',          true)
ON CONFLICT (email) DO NOTHING;

-- =============================================================================
-- EMAIL TEMPLATES - FICA Onboarding Flow (the Tuesday trial run scope)
-- Minimum set to make the FICA onboarding automation work end-to-end.
-- TODO: Add the full BC template library (T1-T17, Auto A-D, Invoice) post-trial.
-- TODO: Add COO, BP, PPM, MAQ, RCF, RCC template libraries.
-- =============================================================================

INSERT INTO email_templates (code, service_code, name, subject, body, description) VALUES

    -- BC_AUTO_A: The onboarding link email - sent when Pipedrive deal moves to "quote accepted"
    (
        'BC_AUTO_A',
        'BC',
        'Business Compliance - Onboarding Link',
        'Action Required: ConveyClear Business Compliance - FICA Documents',
        'Hi {{client.full_name}},

Your quote has been accepted! To proceed with your compliance application, we urgently need your FICA documents.

Please click the secure link below to upload your ID and Proof of Residence:

{{onboarding_link.url}}

This link is unique to your file and will expire in 7 days. If you need help, reply to this email or call us on [phone].

Best regards,
The ConveyClear Team',
        'Automated email sent on Pipedrive stage transition to docs_pending. Replaces the hardcoded Tally URL.'
    ),

    -- GLOBAL_FICA_RECEIVED: Confirms receipt to client after Tally form submission
    (
        'GLOBAL_FICA_RECEIVED',
        'GLOBAL',
        'FICA Documents Received',
        'Received: Your ConveyClear FICA Documents',
        'Hi {{client.full_name}},

Thank you - we''ve received your FICA documents and are reviewing them now.

What happens next:
1. Our team will verify your documents (typically within 1 business day)
2. We''ll send you a confirmation once approved
3. We''ll proceed with the next steps for your {{service.name}} application

If anything is missing or needs clarification, we''ll be in touch.

Best regards,
The ConveyClear Team',
        'Sent automatically after Tally onboarding form is submitted and processed.'
    ),

    -- GLOBAL_FICA_MISSING: When form is submitted but required docs are missing
    (
        'GLOBAL_FICA_MISSING',
        'GLOBAL',
        'FICA Documents - Missing Items',
        'Action Needed: Missing documents for your ConveyClear application',
        'Hi {{client.full_name}},

Thank you for your submission. We noticed that some required documents are missing:

{{missing_documents_list}}

To proceed, please re-submit using your link below:

{{onboarding_link.url}}

If you''re having trouble obtaining any of these, reply to this email and one of our team members will assist you.

Best regards,
The ConveyClear Team',
        'Sent if document verification fails after Tally submission. Loops client back to the form.'
    ),

    -- BC_AUTO_INTERNAL_NOTIFY: Internal alert when a form is submitted with missing supplementary docs
    (
        'BC_AUTO_INTERNAL_NOTIFY',
        'BC',
        'Internal: BC Form Submitted with Missing Docs',
        'Internal: {{client.full_name}} submitted BC form with missing items',
        'Hi team,

{{client.full_name}} ({{client.primary_email}}) has submitted their Business Compliance documents but flagged the following as not available:

{{not_available_items_with_reasons}}

Matter: {{matter.title}}
Drive folder: {{matter.drive_folder_url}}
Pipedrive deal: {{matter.pipedrive_deal_url}}

Please review and follow up with the client.',
        'Sent to Francois (or rotating ops) when a BC form is submitted with not_available items.'
    ),

    -- BC_T1: The initial quote email
    (
        'BC_T1',
        'BC',
        'Business Compliance - Quote',
        'Your ConveyClear Business Compliance Quote',
        'Hi {{client.full_name}},

Thank you for your interest in ConveyClear''s Business Compliance services.

Based on our conversation, here is your quote:

Service: {{service.name}} ({{matter.sub_service}})
Premises: {{property.premises_name}}, {{property.street_address}}
Total: {{matter.deal_value}} {{matter.currency}}

To accept this quote, please reply to this email confirming. We''ll then send you a secure link to upload your FICA documents.

Best regards,
The ConveyClear Team',
        'Initial quote. Sent from Pipedrive at quote_sent stage. TODO: align with BC_T1 master doc once template library is complete.'
    )

ON CONFLICT (code) DO NOTHING;

-- =============================================================================
-- VERIFICATION
-- =============================================================================

DO $$
DECLARE
    municipalities_count INTEGER;
    services_count INTEGER;
    users_count INTEGER;
    email_templates_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO municipalities_count FROM municipalities;
    SELECT COUNT(*) INTO services_count FROM services;
    SELECT COUNT(*) INTO users_count FROM users;
    SELECT COUNT(*) INTO email_templates_count FROM email_templates;

    RAISE NOTICE '';
    RAISE NOTICE '=== Seed verification ===';
    RAISE NOTICE 'Municipalities:    %', municipalities_count;
    RAISE NOTICE 'Services:          %', services_count;
    RAISE NOTICE 'Users:             %', users_count;
    RAISE NOTICE 'Email templates:   %', email_templates_count;
    RAISE NOTICE '=========================';
    RAISE NOTICE '';
    RAISE NOTICE 'Expected: 8 / 8 / 6 / 5';
END $$;

-- =============================================================================
-- End of seed 002
-- =============================================================================
