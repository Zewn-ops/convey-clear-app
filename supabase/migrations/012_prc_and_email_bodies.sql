-- ============================================================================
-- ConveyClear — Migration 012: PRC/RCF build-out + real email-template bodies
-- ============================================================================
-- Created: 2026-06-13 (pre A&A demo 2026-06-23). Source of truth:
--   cc-notes and stuff/SOPs 2026-06-13/*.md  (the 5 service SOPs, updated 2026-06-13)
-- Target:  Supabase project yhgriqagrhyblhmloctc (eu-west-1)
-- Run via: psql pooler from VPS host OR Supabase dashboard SQL Editor
--
-- What this does:
--   1. Restructures the RCF (Property Rates Clearance) service config so the
--      onboarding form renders correct doc slots (entity-keyed required_documents,
--      matching the form's `required_documents[entity_type]` lookup) + adds the
--      RCC delivery template + drops the TODO flags.
--   2. Fills + ACTIVATES every email-template body from the SOPs:
--        RCF T1-T5 (T5 delivery is new), COO T2-T7, BP T1-T6, PPM T1-T5, MAD T1-T7.
--      (COO_T1 was already live in 007; left as-is.)
--
-- Merge vars used in bodies: {{client_name}}, {{property_description}},
--   {{municipality}}, {{drive_folder_link}}, {{clickup_task_link}}, {{staff_name}},
--   {{fee_amount}}, {{meter_number}}, {{outcome_summary}}, {{case_background}},
--   {{dispute_goal}}, {{deadline}}.
--
-- Idempotent: all writes use ON CONFLICT DO UPDATE.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. RCF service config — entity-keyed docs so the onboarding form works
-- ----------------------------------------------------------------------------
UPDATE services SET config = config
  || jsonb_build_object(
       'required_documents', '{
          "natural_person": ["id_certified", "proof_of_application", "proof_of_payment_figures"],
          "business":       ["id_certified_representative", "cipc_docs", "proof_of_application", "proof_of_payment_figures"],
          "trust":          ["id_certified_trustee", "letter_of_authority", "proof_of_application", "proof_of_payment_figures"]
        }'::jsonb,
       'documents_allow_not_available', 'true'::jsonb,
       'document_capture_fields', '["property_description", "municipal_account_number"]'::jsonb,
       'email_templates', '{
          "doc_request":       "RCF_T1",
          "ops_handover":      "RCF_T2",
          "services_handover": "RCF_T3",
          "final_invoice":     "RCF_T4",
          "delivery":          "RCF_T5"
        }'::jsonb
     )
  - 'TODO_email_bodies' - 'TODO_pricing'
WHERE code = 'RCF';

-- ----------------------------------------------------------------------------
-- 2. RCF email templates — full bodies from the Rates Clearance SOP, ACTIVE
-- ----------------------------------------------------------------------------

-- RCF_T1 — Document Request to conveyancer
INSERT INTO email_templates (code, service_code, name, subject, body, description, active) VALUES (
  'RCF_T1', 'RCF', 'RCF: Document Request to Conveyancer',
  '{{municipality}} | {{property_description}} | {{client_name}}',
  'Dear {{client_name}},

Thank you for trusting ConveyClear to assist with your Rates Clearance process. To enable us to expedite this matter at the municipality, please confirm whether you require Rates Clearance Figures, a Rates Clearance Certificate, or both.

Additionally, please provide the following:

- The exact Property Description and Municipal Account Number.
- If you have already applied for figures but not received them: Please attach your official Proof of Application.
- If you have paid the figures but not received the certificate: Please attach the Proof of Payment made to the council.
- Clear FICA/CIPC documents of the current owner/seller.

Once we receive these details, our Operations team will immediately escalate the matter at the council.

Kind regards,
The ConveyClear Team',
  'Stage 1A — request proofs/docs from the conveyancer. Subject rule: [Municipality] | [Property] | [Firm].',
  true)
ON CONFLICT (code) DO UPDATE
  SET subject = EXCLUDED.subject, body = EXCLUDED.body, name = EXCLUDED.name,
      description = EXCLUDED.description, active = EXCLUDED.active, updated_at = now();

-- RCF_T2 — Services to Ops handover
INSERT INTO email_templates (code, service_code, name, subject, body, description, active) VALUES (
  'RCF_T2', 'RCF', 'RCF: Services to Ops Handover',
  'HANDOVER TO OPS: {{municipality}} | {{property_description}} | {{client_name}}',
  'Dear Operations Team,

Please see the new Rates Clearance instruction ready for execution.

- Requirement: [State whether it is RCF only, RCC only, or Both]
- Drive Folder Link: {{drive_folder_link}}
- ClickUp Task Link: {{clickup_task_link}}

Context: [Provide brief context. E.g., "The conveyancer applied 3 weeks ago but hasn''t received figures. Proof of application is in the drive." OR "Figures were paid last week, but the certificate hasn''t been issued. POP is in the drive."]

Please proceed to the council to expedite and retrieve the required documentation.

Kind regards,
{{staff_name}}',
  'Stage 1B — internal Services to Ops handover.',
  true)
ON CONFLICT (code) DO UPDATE
  SET subject = EXCLUDED.subject, body = EXCLUDED.body, name = EXCLUDED.name,
      description = EXCLUDED.description, active = EXCLUDED.active, updated_at = now();

-- RCF_T3 — Ops to Services handover
INSERT INTO email_templates (code, service_code, name, subject, body, description, active) VALUES (
  'RCF_T3', 'RCF', 'RCF: Ops to Services Handover',
  'GOAL REACHED: {{municipality}} | {{property_description}} | {{client_name}}',
  'Dear Services Team,

The Rates Clearance retrieval process for the above property has been successfully completed.

- Outcome: [State what was retrieved: RCF, RCC, or Both]
- Drive Folder Link: {{drive_folder_link}}
- ClickUp Task Link: {{clickup_task_link}}

The official municipal documents have been saved to the Drive folder using the correct naming convention. The file is now ready for invoicing and final client delivery.

Kind regards,
{{staff_name}}',
  'Stage 2A — internal Ops to Services handover.',
  true)
ON CONFLICT (code) DO UPDATE
  SET subject = EXCLUDED.subject, body = EXCLUDED.body, name = EXCLUDED.name,
      description = EXCLUDED.description, active = EXCLUDED.active, updated_at = now();

-- RCF_T4 — Final invoice
INSERT INTO email_templates (code, service_code, name, subject, body, description, active) VALUES (
  'RCF_T4', 'RCF', 'RCF: Final Invoice & Payment Request',
  '{{municipality}} | {{property_description}} | {{client_name}}',
  'Dear {{client_name}},

We are pleased to inform you that we have successfully retrieved your [Rates Clearance Figures / Rates Clearance Certificate / Rates Clearance Figures & Certificate] from the municipality.

Please find attached our final invoice for this specific service. Once payment has been settled and proof of payment is received, we will immediately release the official municipal documentation to you to proceed with your transfer.

Kind regards,
The ConveyClear Accounts Team',
  'Stage 3A — final invoice. Released docs are held until paid.',
  true)
ON CONFLICT (code) DO UPDATE
  SET subject = EXCLUDED.subject, body = EXCLUDED.body, name = EXCLUDED.name,
      description = EXCLUDED.description, active = EXCLUDED.active, updated_at = now();

-- RCF_T5 — Delivery & offboarding (NEW)
INSERT INTO email_templates (code, service_code, name, subject, body, description, active) VALUES (
  'RCF_T5', 'RCF', 'RCF: Delivery & Offboarding',
  '{{municipality}} | {{property_description}} | {{client_name}}',
  'Dear {{client_name}},

Thank you for your prompt payment.

We are pleased to attach the official [Rates Clearance Figures / Rates Clearance Certificate] for the above property, successfully retrieved from the municipality.

We know how critical these documents are for your lodgement process. If you require any further assistance on this matter, or have any upcoming files that need expediting, please do not hesitate to contact us.

Kind Regards / Vriendelike Groete,
The ConveyClear Team',
  'Stage 3A — deliver the RCF/RCC after payment.',
  true)
ON CONFLICT (code) DO UPDATE
  SET subject = EXCLUDED.subject, body = EXCLUDED.body, name = EXCLUDED.name,
      description = EXCLUDED.description, active = EXCLUDED.active, updated_at = now();

-- ----------------------------------------------------------------------------
-- 3. COO email templates T2-T7 — full bodies from the COO SOP, ACTIVE
--    (T1 already live in migration 007.)
-- ----------------------------------------------------------------------------

UPDATE email_templates SET
  subject = 'HANDOVER TO OPS: {{client_name}} | Change of Ownership | {{municipality}}',
  body = 'Dear Operations Team,

Please see the new Change of Ownership instruction ready for submission.

- Client / Entity Name: {{client_name}}
- Property Description: {{property_description}}
- Municipality: {{municipality}}
- Drive Folder Link: {{drive_folder_link}}
- ClickUp Task Link: {{clickup_task_link}}

All required documents, including FICA and clearances, have been vetted and saved in the Drive folder. Please proceed with lodgement.

Kind regards,
{{staff_name}}',
  active = true, updated_at = now()
WHERE code = 'COO_T2';

UPDATE email_templates SET
  subject = 'HANDOVER TO SERVICES: {{client_name}} COO Completed | {{municipality}}',
  body = 'Dear Services Team,

The Change of Ownership for {{client_name}} at {{municipality}} has been successfully completed.

- Drive Folder Link: {{drive_folder_link}}
- ClickUp Task Link: {{clickup_task_link}}

The final proof of the new account / welcome letter has been saved to the Drive folder using the correct naming convention. The file is now ready for invoicing and final client delivery.

Kind regards,
{{staff_name}}',
  active = true, updated_at = now()
WHERE code = 'COO_T3';

UPDATE email_templates SET
  subject = 'Application Complete - Invoice Attached',
  body = 'Dear {{client_name}},

We are pleased to inform you that the Change of Ownership process for {{property_description}} has been successfully finalized with the municipality.

Please find attached our final invoice for this service. Once payment has been settled and proof of payment is received, we will immediately release the Welcome Letter and new municipal account details to the new owner.

Kind regards,
The ConveyClear Accounts Team',
  active = true, updated_at = now()
WHERE code = 'COO_T4';

-- COO_T5 — City of Tshwane welcome
UPDATE email_templates SET
  subject = 'Your New City of Tshwane Municipal Account Details',
  body = 'Good day Mr/Mrs/Ms,

Kindly find your new City of Tshwane rates and services account number on the attached Welcome Letter.

Note that rates will be backdated from date of registration (it will appear on your statement as miscellaneous charges). Your first statement should be available after 30 days from the date of opening your account.

You can register a profile on www.e-tshwane.co.za and be able to add your account once 30 days have passed.

Once registered follow the following instructions:
- Click on Accounts
- Click on Account Manager
- Click on Add account
- Enter your City Tshwane account number (as on the attached document)
- Enter your id number / Company registration number (if 2 owners enter both id''s separated with a /)
- Your statement should then be available to view

For any further enquiries about your account, kindly contact:
City of Tshwane
Tel: (012) 358 9999
Email: customercare@tshwane.gov.za

Kind Regards / Vriendelike Groete,
The ConveyClear Team',
  active = true, updated_at = now()
WHERE code = 'COO_T5';

-- COO_T6 — City of Joburg welcome
UPDATE email_templates SET
  subject = 'Your New City of Joburg Municipal Account Details',
  body = 'Good day Mr/Mrs/Ms,

Kindly find your new City of Joburg rates and services account number attached.

Note that rates will be backdated from date of registration (it will appear on your statement as miscellaneous charges). You can register a profile on www.e-joburg.org.za/register and be able to add your account within 30 days.

Once registered follow the following instructions:
- Sign into your new e-Joburg account with your new username and password.
- Create a new password for you to remember
- Update your Personal Information
- Add your new account by using the Account number and PIN CODE on your Statement attached.

For any further enquiries about your account, kindly contact:
e-Joburg
Tel: 086 099 5150
Email: joburgconnect@joburg.org.za

Kind Regards / Vriendelike Groete,
The ConveyClear Team',
  active = true, updated_at = now()
WHERE code = 'COO_T6';

-- COO_T7 — City of Ekurhuleni welcome
UPDATE email_templates SET
  subject = 'Your New City of Ekurhuleni Municipal Account Details',
  body = 'Good day Mr/Mrs/Ms,

Kindly find your new City of Ekurhuleni rates and services account number attached.

PLEASE NOTE: A deposit will be required to activate your water meter. (Kindly find attached City of Ekurhuleni''s table of water meters with their deposit values) - please send us a picture of the water meter if you would like us to make the deposit on your behalf?

Note that rates will be backdated from date of registration (it will appear on your statement as miscellaneous charges). You can register a profile on siyakhokha.ekurhuleni.gov.za/Account/Register.

Once registered follow the following instructions:
- Sign into your new Ekurhuleni Siyakhokha account with your new username and password.
- Update your personal information
- Your Account will appear within 30 days under "Linked Municipal Accounts"

For any further enquiries about your account, kindly contact:
Ekurhuleni Siyakhokha
Tel: 011 999 5102
Email: siyakhokha@ekurhuleni.gov.za

Kind Regards / Vriendelike Groete,
The ConveyClear Team',
  active = true, updated_at = now()
WHERE code = 'COO_T7';

-- ----------------------------------------------------------------------------
-- 4. Building Plans (BP) email templates — full bodies from the BP SOP, ACTIVE
-- ----------------------------------------------------------------------------

UPDATE email_templates SET
  subject = '{{municipality}} | {{property_description}} | {{client_name}}',
  body = 'Dear {{client_name}},

Thank you for trusting ConveyClear to retrieve your existing building plans. To proceed with the application at the municipality on your behalf, we kindly require the following documents:

- Completed and Signed Power of Attorney (Attached)
- Latest Municipal Rates Account
- Clear copy of the Owner''s ID

If the property is owned by a Company/Trust, please also include:
- Company: Board Resolution (empowering the signatory), Company Registration Documents (CIPC), and the Representative''s Copy of ID.
- Trust: Letter of Authority and ID copies of all Trustees.

Please reply to this email with the attached documents so we can prepare your file for submission.

Kind regards,
The ConveyClear Team',
  active = true, updated_at = now()
WHERE code = 'BP_T1';

UPDATE email_templates SET
  subject = 'HANDOVER TO OPS: {{municipality}} | {{property_description}} | {{client_name}}',
  body = 'Dear Operations Team,

Please see the Existing Building Plans Retrieval instruction ready for execution.

- Drive Folder Link: {{drive_folder_link}}
- ClickUp Task Link: {{clickup_task_link}}

All required documents, including the POA, FICA, and Rates Account, have been vetted and saved in the Drive folder. Please proceed to the municipal archives to retrieve the plans.

Kind regards,
{{staff_name}}',
  active = true, updated_at = now()
WHERE code = 'BP_T2';

UPDATE email_templates SET
  subject = '{{municipality}} | {{property_description}} | {{client_name}}',
  body = 'Dear Services Team,

The Building Plans retrieval process for the above property has been completed.

- Outcome: [State whether plans were retrieved OR if a proof of absence letter was obtained]
- Drive Folder Link: {{drive_folder_link}}
- ClickUp Task Link: {{clickup_task_link}}

The digitized documents have been saved to the Drive folder using the correct naming convention. The file is now ready for invoicing and final client delivery.

Kind regards,
{{staff_name}}',
  active = true, updated_at = now()
WHERE code = 'BP_T3';

UPDATE email_templates SET
  subject = '{{municipality}} | {{property_description}} | {{client_name}}',
  body = 'Dear {{client_name}},

We are pleased to inform you that the retrieval process for your building plans has been finalized at the municipality.

Please find attached our final invoice for this service. Once payment has been settled and proof of payment is received, we will immediately release the documentation to you.

Kind regards,
The ConveyClear Accounts Team',
  active = true, updated_at = now()
WHERE code = 'BP_T4';

UPDATE email_templates SET
  subject = '{{municipality}} | {{property_description}} | {{client_name}}',
  body = 'Dear {{client_name}},

Thank you for your payment.

We are pleased to attach the existing building plans for your property, successfully retrieved from the municipal archives.

If you require any further assistance or additional compliance services, please do not hesitate to contact us.

Kind Regards / Vriendelike Groete,
The ConveyClear Team',
  active = true, updated_at = now()
WHERE code = 'BP_T5';

UPDATE email_templates SET
  subject = '{{municipality}} | {{property_description}} | {{client_name}}',
  body = 'Dear {{client_name}},

Thank you for your payment.

Please find attached official correspondence/proof from the municipality regarding your property. Unfortunately, the municipal archives have confirmed that there are no existing building plans on file for this property.

We understand this may not be the outcome you were hoping for, but this official proof is often required by architects or draughtsmen when drawing up new "As-Built" plans for submission.

If you require any further assistance, please do not hesitate to contact us.

Kind Regards / Vriendelike Groete,
The ConveyClear Team',
  active = true, updated_at = now()
WHERE code = 'BP_T6';

-- ----------------------------------------------------------------------------
-- 5. Pre-Paid Meter (PPM) email templates — full bodies from the PPM SOP, ACTIVE
-- ----------------------------------------------------------------------------

UPDATE email_templates SET
  subject = '{{municipality}} | {{property_description}} | {{client_name}}',
  body = 'Dear {{client_name}},

Thank you for contacting ConveyClear regarding the conversion of your conventional meter to a prepaid meter.

Please note that the City of Tshwane currently runs an incentive where the physical meter and conversion are provided for free by the municipality. However, council backlogs can cause significant delays. ConveyClear charges a professional expediting fee of R{{fee_amount}} to manage, follow up, and push this application through the council on your behalf.

If you would like us to expedite this process for you, please find our attached Power of Attorney. Kindly reply to this email with the following documents so we can prepare your file for submission:

- Completed and Signed Power of Attorney (Attached)
- Latest Municipal Rates Account
- Clear, certified copy of the Owner''s ID

If the property is owned by a Company/Trust, please also include:
- Company: Board Resolution (empowering the signatory), Company Registration Documents (CIPC), and the Representative''s Certified ID.
- Trust: Letter of Authority and Certified IDs of all Trustees.

Kind regards,
The ConveyClear Team',
  active = true, updated_at = now()
WHERE code = 'PPM_T1';

UPDATE email_templates SET
  subject = 'HANDOVER TO OPS: {{municipality}} | {{property_description}} | {{client_name}}',
  body = 'Dear Operations Team,

Please see the new Prepaid Meter Conversion instruction ready for execution.

- Drive Folder Link: {{drive_folder_link}}
- ClickUp Task Link: {{clickup_task_link}}

All required documents, including the POA, FICA, and Rates Account, have been vetted and saved in the Drive folder. Please proceed to the council to lodge and expedite the conversion process.

Kind regards,
{{staff_name}}',
  active = true, updated_at = now()
WHERE code = 'PPM_T2';

UPDATE email_templates SET
  subject = 'GOAL REACHED: {{municipality}} | {{property_description}} | {{client_name}}',
  body = 'Dear Services Team,

The Prepaid Meter Conversion for the above property has been successfully completed and expedited.

- Outcome: The conventional meter has been converted. The new prepaid meter number is {{meter_number}}.
- Drive Folder Link: {{drive_folder_link}}
- ClickUp Task Link: {{clickup_task_link}}

The official confirmation / job card has been saved to the Drive folder using the correct naming convention. The file is now ready for invoicing and final client delivery.

Kind regards,
{{staff_name}}',
  active = true, updated_at = now()
WHERE code = 'PPM_T3';

UPDATE email_templates SET
  subject = '{{municipality}} | {{property_description}} | {{client_name}}',
  body = 'Dear {{client_name}},

We are pleased to inform you that we have successfully expedited the conversion of your conventional meter to a prepaid meter at the municipality.

Please find attached our final invoice for this expediting service. Once payment has been settled and proof of payment is received, we will immediately release the official confirmation and your new prepaid meter number to you.

Kind regards,
The ConveyClear Accounts Team',
  active = true, updated_at = now()
WHERE code = 'PPM_T4';

UPDATE email_templates SET
  subject = '{{municipality}} | {{property_description}} | {{client_name}}',
  body = 'Dear {{client_name}},

Thank you for your prompt payment.

We are pleased to confirm that your property has been successfully converted to a prepaid system.

- Your New Prepaid Meter Number is: {{meter_number}}

Please find attached the official municipal confirmation for your records. You can now use this meter number to purchase your prepaid utility tokens via your preferred banking app or local vendor.

If you require any further assistance or additional compliance services, please do not hesitate to contact us.

Kind Regards / Vriendelike Groete,
The ConveyClear Team',
  active = true, updated_at = now()
WHERE code = 'PPM_T5';

-- ----------------------------------------------------------------------------
-- 6. Municipal Account Disputes (MAD) email templates — full bodies, ACTIVE
-- ----------------------------------------------------------------------------

UPDATE email_templates SET
  subject = '{{municipality}} | {{property_description}} | {{client_name}}',
  body = 'Dear {{client_name}},

Thank you for consulting with us regarding the ongoing dispute on your municipal account.

Our management team has reviewed the background of your case. We are confident that we can assist you in reaching a resolution. Due to the complex and time-consuming nature of Municipal Account Disputes (MAD), we structure our fees in two parts:

1. Initiation Fee: R{{fee_amount}} (Payable upfront to commence investigations, lodge formal disputes, and build the case file).
2. Success Fee: R[Amount] OR [Percentage]% of debt written off (Payable only once we have successfully reached the agreed-upon goal).

If you are happy to proceed on this basis, please let us know, and we will send through the initiation invoice and a list of required documents to formally begin the process.

Kind regards,
The ConveyClear Team',
  active = true, updated_at = now()
WHERE code = 'MAD_T1';

UPDATE email_templates SET
  subject = '{{municipality}} | {{property_description}} | {{client_name}}',
  body = 'Dear {{client_name}},

Thank you for your go-ahead. Please find attached the invoice for the Initiation Fee.

To formally lodge this dispute and act on your behalf, please send us the Proof of Payment alongside the following documents:

- Completed and Signed Power of Attorney (Attached)
- Clear, certified copy of your ID (or Company Docs & Director ID)
- Your latest municipal account statement
- Any relevant evidence supporting the dispute (e.g., photos of meters, previous reference numbers, past correspondence with the council, leak repair invoices).

As soon as payment clears and we have these documents, our Operations team will immediately begin the process.

Kind regards,
The ConveyClear Team',
  active = true, updated_at = now()
WHERE code = 'MAD_T2';

UPDATE email_templates SET
  subject = 'HANDOVER TO OPS: {{municipality}} | {{property_description}} | {{client_name}}',
  body = 'Dear Operations Team,

Please see the new Municipal Account Dispute (MAD) instruction ready for execution. The Initiation Fee has been paid.

- Drive Folder Link: {{drive_folder_link}}
- ClickUp Task Link: {{clickup_task_link}}
- Deadline / Urgency: {{deadline}}

CASE BACKGROUND:
{{case_background}}

EXACT GOAL TO ACHIEVE:
{{dispute_goal}}

All FICA and supporting evidence are in the Drive folder. Please proceed with lodgement and keep the client updated on progress.

Kind regards,
{{staff_name}}',
  active = true, updated_at = now()
WHERE code = 'MAD_T3';

UPDATE email_templates SET
  subject = '{{municipality}} | {{property_description}} | {{client_name}}',
  body = 'Dear {{client_name}},

We are writing to provide you with a progress update regarding your Municipal Account Dispute.

Current Status:
{{outcome_summary}}

Next Steps:
[Explain what happens next. E.g., "We will follow up with the department in 7 working days to track the progress of the rebate approval."]

We will continue to monitor the situation closely and keep you informed.

Kind regards,
The ConveyClear Operations Team',
  active = true, updated_at = now()
WHERE code = 'MAD_T4';

UPDATE email_templates SET
  subject = 'GOAL REACHED: {{municipality}} | {{property_description}} | {{client_name}}',
  body = 'Dear Services Team,

The mandate for the above Municipal Account Dispute has been successfully achieved.

- Summary of Outcome: {{outcome_summary}}
- Drive Folder Link: {{drive_folder_link}}

The final updated municipal statement and official resolution letters have been saved to the Drive folder. The file is now ready for the Success Fee invoice and final offboarding.

Kind regards,
{{staff_name}}',
  active = true, updated_at = now()
WHERE code = 'MAD_T5';

UPDATE email_templates SET
  subject = '{{municipality}} | {{property_description}} | {{client_name}}',
  body = 'Dear {{client_name}},

We have excellent news! Our Operations team has successfully resolved the dispute on your municipal account, achieving the goals we set out at the beginning of this process.

Please find attached our invoice for the agreed-upon Success Fee.

Once payment has been settled and proof of payment is received, we will immediately release the updated, corrected municipal statements and official council resolution documentation to you for your records.

Kind regards,
The ConveyClear Accounts Team',
  active = true, updated_at = now()
WHERE code = 'MAD_T6';

UPDATE email_templates SET
  subject = '{{municipality}} | {{property_description}} | {{client_name}}',
  body = 'Dear {{client_name}},

Thank you for your payment and for trusting ConveyClear with this complex matter.

We are pleased to attach the official resolution documentation and your updated municipal statement, reflecting the corrected billing/debt relief as mandated.

This matter is now officially closed on our system. If you require any further assistance, or if you ever need compliance or conveyancing support in the future, please do not hesitate to contact us.

Kind Regards / Vriendelike Groete,
The ConveyClear Team',
  active = true, updated_at = now()
WHERE code = 'MAD_T7';

COMMIT;

-- ============================================================================
-- VERIFICATION (run after COMMIT):
--   SELECT code, active, left(body, 40) AS body_head FROM email_templates ORDER BY code;
--   -- Expect: zero rows containing '-- TODO' in body; all of the above active=true.
--   SELECT config->'required_documents' FROM services WHERE code='RCF';
--   -- Expect: natural_person/business/trust keys present.
--
-- HOW TO RUN (from VPS host — pooler, IPv4 safe):
--   psql "postgresql://postgres.yhgriqagrhyblhmloctc:[PASSWORD]@aws-0-eu-west-1.pooler.supabase.com:5432/postgres?sslmode=require" \
--     -f 012_prc_and_email_bodies.sql
-- ============================================================================
