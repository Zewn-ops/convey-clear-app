-- =============================================================================
-- Migration 009 — Restore the Business Compliance (BC) service row
-- =============================================================================
-- WHY: Migration 007 reseeded `services` with the 5 conveyancing services
-- (COO/RCF/BP/PPM/MAD) and dropped the original BC row. The n8n workflows
-- CC - Deal Inquiry (stage 51) and CC - Outbound Intake (stage 53) both do
-- `service_id = (SELECT id FROM services WHERE code = 'BC')`. With no BC row
-- that subquery returns NULL, and matters.service_id is NOT NULL → the matter
-- insert fails and the entire BC automation breaks at the first step.
--
-- This restores the canonical BC config (validated 2026-05-19) verbatim from
-- old/002_seed.sql. Additive only; ON CONFLICT DO NOTHING leaves the 5
-- conveyancing services untouched.
-- =============================================================================

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
