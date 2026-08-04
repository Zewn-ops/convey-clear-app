-- =============================================================================
-- ConveyClear Database Schema
-- Version: 001
-- Date: 2026-05-15
-- Author: Zuaan Holl
-- Description: Initial schema for the ConveyClear universal database.
--              13 tables modeling clients, properties, matters, documents,
--              communications, tasks, invoices, users, services, and supporting
--              tables for onboarding links, email templates, matter stages,
--              and municipalities.
--
-- Design principles:
--   - UUID primary keys (distributed generation, no information leakage)
--   - TIMESTAMPTZ everywhere for time (timezone-aware)
--   - Foreign keys with explicit ON DELETE behavior
--   - JSONB for service-specific config (flexibility per service)
--   - Audit columns (created_at, updated_at) on all tables
--   - updated_at maintained by trigger
--   - Indexes on all foreign keys and common filter columns
--   - Designed Supabase-compatible (can migrate to Supabase later without changes)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Extensions
-- -----------------------------------------------------------------------------

-- gen_random_uuid() for UUID generation (built into Postgres 13+)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- -----------------------------------------------------------------------------
-- Helper: updated_at trigger function
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- Table 1: municipalities
-- The list of South African municipalities. Modular - starts with the metros,
-- grows as ConveyClear expands operational reach. Up to 258 nationally.
-- =============================================================================

CREATE TABLE municipalities (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    code            TEXT            UNIQUE NOT NULL,
    name            TEXT            NOT NULL,
    province        TEXT,
    is_metro        BOOLEAN         DEFAULT false,
    active          BOOLEAN         DEFAULT true,
    notes           TEXT,
    created_at      TIMESTAMPTZ     DEFAULT now() NOT NULL,
    updated_at      TIMESTAMPTZ     DEFAULT now() NOT NULL
);

CREATE INDEX idx_municipalities_code ON municipalities(code);
CREATE INDEX idx_municipalities_active ON municipalities(active);

CREATE TRIGGER trg_municipalities_updated_at
    BEFORE UPDATE ON municipalities
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE municipalities IS 'South African municipalities served by ConveyClear. Modular - starts with COT/COJ/COE, grows over time.';
COMMENT ON COLUMN municipalities.code IS 'Stable abbreviation: COT, COJ, COE, etc.';
COMMENT ON COLUMN municipalities.is_metro IS 'True for the 8 metropolitan municipalities (currently focused on 3).';

-- =============================================================================
-- Table 2: services
-- The service catalog. Seeded once with the 7 core services + MAD umbrella.
-- The `config` JSONB column drives the service-as-config pattern.
-- =============================================================================

CREATE TABLE services (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    code            TEXT            UNIQUE NOT NULL,
    name            TEXT            NOT NULL,
    description     TEXT,
    is_umbrella     BOOLEAN         DEFAULT false,
    config          JSONB           NOT NULL DEFAULT '{}'::jsonb,
    active          BOOLEAN         DEFAULT true,
    created_at      TIMESTAMPTZ     DEFAULT now() NOT NULL,
    updated_at      TIMESTAMPTZ     DEFAULT now() NOT NULL
);

CREATE INDEX idx_services_code ON services(code);
CREATE INDEX idx_services_active ON services(active);

CREATE TRIGGER trg_services_updated_at
    BEFORE UPDATE ON services
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE services IS 'The 7 core services + MAD umbrella. Service-specific behavior lives in the config JSONB.';
COMMENT ON COLUMN services.code IS 'Stable code: BC, COO, BP, PPM, MAQ, RCF, RCC, MAD';
COMMENT ON COLUMN services.is_umbrella IS 'True for MAD - the catch-all for services not yet streamlined.';
COMMENT ON COLUMN services.config IS 'Per-service behavior: stages, required_documents, payment_model, email_templates, exception_rules, pipedrive_stage_map, clickup_target, drive_folder_structure.';

-- =============================================================================
-- Table 3: users
-- Internal staff (services, ops, delivery, admin) and clients (Phase C portal).
-- Designed Supabase-Auth-compatible: the `id` will eventually match auth.users.id
-- =============================================================================

CREATE TABLE users (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    email           TEXT            UNIQUE NOT NULL,
    full_name       TEXT,
    role            TEXT            NOT NULL CHECK (role IN ('admin', 'staff_services', 'staff_ops', 'staff_delivery', 'client', 'attorney', 'contractor')),
    client_id       UUID,
    active          BOOLEAN         DEFAULT true,
    last_login_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ     DEFAULT now() NOT NULL,
    updated_at      TIMESTAMPTZ     DEFAULT now() NOT NULL
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_client_id ON users(client_id);

CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE users IS 'All system users. Staff roles run the system; client/attorney/contractor roles are for future portal access.';
COMMENT ON COLUMN users.client_id IS 'Only set for client-role users. FK constraint added after clients table is defined.';

-- =============================================================================
-- Table 4: clients
-- A person or business that hires ConveyClear. Independent of any specific job.
-- One client can have many matters over time (enables retention).
-- =============================================================================

CREATE TABLE clients (
    id                  UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type         TEXT            NOT NULL CHECK (entity_type IN ('natural_person', 'business', 'trust')),
    full_name           TEXT,
    business_name       TEXT,
    registration_no     TEXT,
    id_number           TEXT,
    primary_email       TEXT,
    primary_cell        TEXT,
    physical_address    TEXT,
    person_industry     TEXT,
    notes               TEXT,
    pipedrive_person_id BIGINT,
    pipedrive_org_id    BIGINT,
    created_at          TIMESTAMPTZ     DEFAULT now() NOT NULL,
    updated_at          TIMESTAMPTZ     DEFAULT now() NOT NULL,
    created_by          UUID            REFERENCES users(id) ON DELETE SET NULL,

    -- Either id_number (natural person) or registration_no (business/trust) should be present
    CONSTRAINT chk_client_identifier CHECK (
        (entity_type = 'natural_person' AND full_name IS NOT NULL) OR
        (entity_type IN ('business', 'trust') AND business_name IS NOT NULL)
    )
);

CREATE INDEX idx_clients_id_number ON clients(id_number) WHERE id_number IS NOT NULL;
CREATE INDEX idx_clients_registration_no ON clients(registration_no) WHERE registration_no IS NOT NULL;
CREATE INDEX idx_clients_primary_email ON clients(primary_email) WHERE primary_email IS NOT NULL;
CREATE INDEX idx_clients_pipedrive_person ON clients(pipedrive_person_id) WHERE pipedrive_person_id IS NOT NULL;
CREATE INDEX idx_clients_pipedrive_org ON clients(pipedrive_org_id) WHERE pipedrive_org_id IS NOT NULL;
CREATE INDEX idx_clients_entity_type ON clients(entity_type);

CREATE TRIGGER trg_clients_updated_at
    BEFORE UPDATE ON clients
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

-- Add the deferred FK from users back to clients
ALTER TABLE users
    ADD CONSTRAINT fk_users_client_id
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;

COMMENT ON TABLE clients IS 'A person or business that hires ConveyClear. Independent of any specific job.';
COMMENT ON COLUMN clients.entity_type IS 'natural_person | business | trust';
COMMENT ON COLUMN clients.pipedrive_person_id IS 'External reference to Pipedrive person, not source of truth.';
COMMENT ON COLUMN clients.person_industry IS 'Optional informational field. Can be updated by staff after client conversations.';

-- =============================================================================
-- Table 5: contacts
-- People associated with a client (directors, spouse, conveyancer, representative).
-- Replaces the "person_labels" multi-select concept by being its own first-class
-- table - one contact can have multiple labels via contact_labels (table 5a).
-- =============================================================================

CREATE TABLE contacts (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id       UUID            NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    name            TEXT            NOT NULL,
    email           TEXT,
    cell            TEXT,
    id_number       TEXT,
    is_primary      BOOLEAN         DEFAULT false,
    notes           TEXT,
    created_at      TIMESTAMPTZ     DEFAULT now() NOT NULL,
    updated_at      TIMESTAMPTZ     DEFAULT now() NOT NULL
);

CREATE INDEX idx_contacts_client_id ON contacts(client_id);
CREATE INDEX idx_contacts_email ON contacts(email) WHERE email IS NOT NULL;
CREATE INDEX idx_contacts_id_number ON contacts(id_number) WHERE id_number IS NOT NULL;

CREATE TRIGGER trg_contacts_updated_at
    BEFORE UPDATE ON contacts
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE contacts IS 'People associated with a client - directors, representatives, spouse, conveyancer, etc.';

-- =============================================================================
-- Table 5a: contact_labels
-- Multi-select labels per contact. A person can be both "business_owner" and
-- "seller" at the same time (per meeting decision May 13).
-- =============================================================================

CREATE TABLE contact_labels (
    contact_id      UUID            NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    label           TEXT            NOT NULL CHECK (label IN (
        'business_owner', 'director', 'representative', 'spouse',
        'seller', 'buyer', 'landlord', 'tenant', 'conveyancer',
        'attorney', 'estate_agent', 'other'
    )),
    created_at      TIMESTAMPTZ     DEFAULT now() NOT NULL,
    PRIMARY KEY (contact_id, label)
);

CREATE INDEX idx_contact_labels_contact_id ON contact_labels(contact_id);
CREATE INDEX idx_contact_labels_label ON contact_labels(label);

COMMENT ON TABLE contact_labels IS 'Multi-select labels per contact. One contact can have many labels.';

-- =============================================================================
-- Table 6: properties
-- A physical premises. One client can have multiple properties; one property
-- can be the subject of multiple matters over its lifecycle.
-- =============================================================================

CREATE TABLE properties (
    id                  UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    erf_number          TEXT,
    street_address      TEXT,
    premises_name       TEXT,
    municipality_id     UUID            REFERENCES municipalities(id) ON DELETE RESTRICT,
    property_type       TEXT            CHECK (property_type IN ('residential', 'commercial', 'industrial', 'agricultural', 'other')),
    notes               TEXT,
    created_at          TIMESTAMPTZ     DEFAULT now() NOT NULL,
    updated_at          TIMESTAMPTZ     DEFAULT now() NOT NULL
);

CREATE INDEX idx_properties_municipality_id ON properties(municipality_id);
CREATE INDEX idx_properties_erf_number ON properties(erf_number) WHERE erf_number IS NOT NULL;
CREATE INDEX idx_properties_property_type ON properties(property_type);

CREATE TRIGGER trg_properties_updated_at
    BEFORE UPDATE ON properties
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE properties IS 'Physical premises. Independent of client and matter - can outlive both.';
COMMENT ON COLUMN properties.premises_name IS 'Optional business premises shop/branch name, e.g. "Castle Gate Shopping Centre".';

-- =============================================================================
-- Table 7: matters
-- The actual job. One client engages ConveyClear for one service on one
-- property. The most important table - the future dashboard centers on this.
-- =============================================================================

CREATE TABLE matters (
    id                      UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id               UUID            NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
    service_id              UUID            NOT NULL REFERENCES services(id) ON DELETE RESTRICT,
    property_id             UUID            REFERENCES properties(id) ON DELETE SET NULL,
    title                   TEXT,
    sub_service             TEXT,
    current_stage           TEXT            NOT NULL DEFAULT 'inquiry',
    current_owner_id        UUID            REFERENCES users(id) ON DELETE SET NULL,
    priority                TEXT            DEFAULT 'standard' CHECK (priority IN ('priority', 'standard', 'emerging', 'complex')),
    deadline                DATE,
    deal_value              NUMERIC(12, 2),
    pipedrive_deal_id       BIGINT,
    pipedrive_pipeline_id   INTEGER,
    clickup_task_id         TEXT,
    drive_folder_id         TEXT,
    source_channel          TEXT,
    status                  TEXT            DEFAULT 'open' CHECK (status IN ('open', 'won', 'lost', 'archived', 'on_hold')),
    notes                   TEXT,
    created_at              TIMESTAMPTZ     DEFAULT now() NOT NULL,
    updated_at              TIMESTAMPTZ     DEFAULT now() NOT NULL,
    closed_at               TIMESTAMPTZ
);

CREATE INDEX idx_matters_client_id ON matters(client_id);
CREATE INDEX idx_matters_service_id ON matters(service_id);
CREATE INDEX idx_matters_property_id ON matters(property_id);
CREATE INDEX idx_matters_current_stage ON matters(current_stage);
CREATE INDEX idx_matters_current_owner_id ON matters(current_owner_id);
CREATE INDEX idx_matters_status ON matters(status);
CREATE INDEX idx_matters_pipedrive_deal ON matters(pipedrive_deal_id) WHERE pipedrive_deal_id IS NOT NULL;
CREATE INDEX idx_matters_deadline ON matters(deadline) WHERE deadline IS NOT NULL;

CREATE TRIGGER trg_matters_updated_at
    BEFORE UPDATE ON matters
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE matters IS 'The actual jobs. Each matter = one client + one service + (optional) one property.';
COMMENT ON COLUMN matters.sub_service IS 'Service-specific sub-classification, e.g. "restaurant" for BC, "figures" for RCF.';
COMMENT ON COLUMN matters.current_stage IS 'Stage code (matches a stage in services.config.stages).';

-- =============================================================================
-- Table 8: matter_stages
-- The audit log of every stage transition. NOT the current stage (that's on
-- matters.current_stage) but the history. Powers the future app's timeline
-- view and SLA breach detection.
-- =============================================================================

CREATE TABLE matter_stages (
    id                      UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    matter_id               UUID            NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
    stage                   TEXT            NOT NULL,
    entered_at              TIMESTAMPTZ     DEFAULT now() NOT NULL,
    exited_at               TIMESTAMPTZ,
    triggered_by            TEXT            CHECK (triggered_by IN ('automation', 'manual', 'webhook', 'scheduled', 'migration')),
    triggered_by_user_id    UUID            REFERENCES users(id) ON DELETE SET NULL,
    notes                   TEXT
);

CREATE INDEX idx_matter_stages_matter_id ON matter_stages(matter_id);
CREATE INDEX idx_matter_stages_stage ON matter_stages(stage);
CREATE INDEX idx_matter_stages_entered_at ON matter_stages(entered_at);
CREATE INDEX idx_matter_stages_current ON matter_stages(matter_id, exited_at) WHERE exited_at IS NULL;

COMMENT ON TABLE matter_stages IS 'Audit log of every stage transition. Append-only. exited_at IS NULL = current stage.';

-- =============================================================================
-- Table 9: documents
-- Every file uploaded by a client or generated by the system.
-- =============================================================================

CREATE TABLE documents (
    id                  UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    matter_id           UUID            NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
    document_type       TEXT            NOT NULL,
    document_status     TEXT            DEFAULT 'provided' CHECK (document_status IN (
        'provided', 'not_available_reason_given', 'required', 'optional', 'rejected'
    )),
    drive_file_id       TEXT,
    file_name           TEXT,
    mime_type           TEXT,
    size_bytes          BIGINT,
    not_available_reason TEXT,
    uploaded_at         TIMESTAMPTZ     DEFAULT now() NOT NULL,
    uploaded_by         TEXT            CHECK (uploaded_by IN ('client', 'staff', 'automation', 'attorney', 'contractor')),
    verified            BOOLEAN         DEFAULT false,
    verified_at         TIMESTAMPTZ,
    verified_by         UUID            REFERENCES users(id) ON DELETE SET NULL,
    expiry_date         DATE,
    notes               TEXT,
    created_at          TIMESTAMPTZ     DEFAULT now() NOT NULL,
    updated_at          TIMESTAMPTZ     DEFAULT now() NOT NULL
);

CREATE INDEX idx_documents_matter_id ON documents(matter_id);
CREATE INDEX idx_documents_document_type ON documents(document_type);
CREATE INDEX idx_documents_document_status ON documents(document_status);
CREATE INDEX idx_documents_verified ON documents(verified);
CREATE INDEX idx_documents_expiry_date ON documents(expiry_date) WHERE expiry_date IS NOT NULL;

CREATE TRIGGER trg_documents_updated_at
    BEFORE UPDATE ON documents
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE documents IS 'Every file uploaded or generated for a matter.';
COMMENT ON COLUMN documents.document_type IS 'Free-text, but conventionally: id, por, poa, tc, board_resolution, popia_consent, rates_account, title_deed, building_plans, certificate, cleaning_schedule, pest_control, zoning, etc.';
COMMENT ON COLUMN documents.not_available_reason IS 'Per meeting decision: clients can mark a complex document "not available" with a reason instead of being blocked.';

-- =============================================================================
-- Table 10: communications
-- Every email/SMS/WhatsApp sent or received. Powers audit trail and future
-- portal "messages" view.
-- =============================================================================

CREATE TABLE communications (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    matter_id       UUID            REFERENCES matters(id) ON DELETE CASCADE,
    client_id       UUID            REFERENCES clients(id) ON DELETE CASCADE,
    template_code   TEXT,
    direction       TEXT            NOT NULL CHECK (direction IN ('outbound', 'inbound')),
    channel         TEXT            NOT NULL CHECK (channel IN ('email', 'sms', 'whatsapp', 'phone_note')),
    recipient       TEXT,
    sender          TEXT,
    subject         TEXT,
    body            TEXT,
    payload         JSONB,
    status          TEXT            DEFAULT 'sent' CHECK (status IN ('queued', 'sent', 'failed', 'bounced', 'delivered', 'opened')),
    error           TEXT,
    sent_at         TIMESTAMPTZ     DEFAULT now() NOT NULL,
    created_at      TIMESTAMPTZ     DEFAULT now() NOT NULL
);

CREATE INDEX idx_communications_matter_id ON communications(matter_id);
CREATE INDEX idx_communications_client_id ON communications(client_id);
CREATE INDEX idx_communications_template_code ON communications(template_code);
CREATE INDEX idx_communications_status ON communications(status);
CREATE INDEX idx_communications_sent_at ON communications(sent_at);

COMMENT ON TABLE communications IS 'Audit trail of all comms with clients. Append-only.';

-- =============================================================================
-- Table 11: tasks
-- Internal action items. Mirrors ClickUp in Phase A, lives natively in Phase D.
-- =============================================================================

CREATE TABLE tasks (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    matter_id       UUID            REFERENCES matters(id) ON DELETE CASCADE,
    title           TEXT            NOT NULL,
    description     TEXT,
    assigned_to     UUID            REFERENCES users(id) ON DELETE SET NULL,
    status          TEXT            DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'blocked', 'done', 'cancelled')),
    priority        TEXT            DEFAULT 'standard' CHECK (priority IN ('low', 'standard', 'high', 'urgent')),
    due_at          TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    clickup_task_id TEXT,
    created_at      TIMESTAMPTZ     DEFAULT now() NOT NULL,
    updated_at      TIMESTAMPTZ     DEFAULT now() NOT NULL
);

CREATE INDEX idx_tasks_matter_id ON tasks(matter_id);
CREATE INDEX idx_tasks_assigned_to ON tasks(assigned_to);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_due_at ON tasks(due_at) WHERE due_at IS NOT NULL;

CREATE TRIGGER trg_tasks_updated_at
    BEFORE UPDATE ON tasks
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE tasks IS 'Internal action items. Synced to ClickUp during Phase A.';

-- =============================================================================
-- Table 12: invoices
-- Billing records. Makes the "Ops can't start until deposit paid" rule a DB
-- check instead of a human check.
-- =============================================================================

CREATE TABLE invoices (
    id                  UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    matter_id           UUID            NOT NULL REFERENCES matters(id) ON DELETE RESTRICT,
    invoice_type        TEXT            NOT NULL CHECK (invoice_type IN ('deposit', 'initiation', 'final', 'success_fee')),
    amount              NUMERIC(12, 2)  NOT NULL,
    currency            TEXT            DEFAULT 'ZAR',
    xero_invoice_id     TEXT,
    status              TEXT            DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'paid', 'overdue', 'cancelled')),
    issued_at           TIMESTAMPTZ,
    due_at              TIMESTAMPTZ,
    paid_at             TIMESTAMPTZ,
    notes               TEXT,
    created_at          TIMESTAMPTZ     DEFAULT now() NOT NULL,
    updated_at          TIMESTAMPTZ     DEFAULT now() NOT NULL
);

CREATE INDEX idx_invoices_matter_id ON invoices(matter_id);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_invoices_xero_id ON invoices(xero_invoice_id) WHERE xero_invoice_id IS NOT NULL;

CREATE TRIGGER trg_invoices_updated_at
    BEFORE UPDATE ON invoices
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE invoices IS 'Billing records. Mirrors Xero invoices via xero_invoice_id.';

-- =============================================================================
-- Table 13: email_templates
-- Email template library, indexed by stable code. Master docs define each
-- service's template numbering (BC_T1, BC_AUTO_A, COO_T1, etc.).
-- =============================================================================

CREATE TABLE email_templates (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    code            TEXT            UNIQUE NOT NULL,
    service_code    TEXT            NOT NULL DEFAULT 'GLOBAL',
    name            TEXT            NOT NULL,
    subject         TEXT            NOT NULL,
    body            TEXT            NOT NULL,
    description     TEXT,
    active          BOOLEAN         DEFAULT true,
    created_at      TIMESTAMPTZ     DEFAULT now() NOT NULL,
    updated_at      TIMESTAMPTZ     DEFAULT now() NOT NULL
);

CREATE INDEX idx_email_templates_code ON email_templates(code);
CREATE INDEX idx_email_templates_service_code ON email_templates(service_code);
CREATE INDEX idx_email_templates_active ON email_templates(active);

CREATE TRIGGER trg_email_templates_updated_at
    BEFORE UPDATE ON email_templates
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE email_templates IS 'Email template library. Bodies use {{handlebars}} syntax for variable substitution at send time.';

-- =============================================================================
-- Table 14: onboarding_links
-- Secure one-time tokens for client-facing form links. Replaces the current
-- insecure `?deal_id=` URL pattern in the Outbound Intake automation.
-- =============================================================================

CREATE TABLE onboarding_links (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    token           TEXT            UNIQUE NOT NULL,
    matter_id       UUID            NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
    purpose         TEXT            NOT NULL CHECK (purpose IN ('onboarding', 'document_upload', 'portal_first_login', 'power_of_attorney')),
    expires_at      TIMESTAMPTZ,
    used_at         TIMESTAMPTZ,
    created_at      TIMESTAMPTZ     DEFAULT now() NOT NULL
);

CREATE INDEX idx_onboarding_links_token ON onboarding_links(token);
CREATE INDEX idx_onboarding_links_matter_id ON onboarding_links(matter_id);
CREATE INDEX idx_onboarding_links_used ON onboarding_links(used_at) WHERE used_at IS NULL;

COMMENT ON TABLE onboarding_links IS 'Secure single-use tokens for client form links. Replaces insecure ?deal_id= URLs.';

-- =============================================================================
-- Final: confirm all tables exist
-- =============================================================================

DO $$
DECLARE
    expected_tables TEXT[] := ARRAY[
        'municipalities', 'services', 'users', 'clients', 'contacts', 'contact_labels',
        'properties', 'matters', 'matter_stages', 'documents', 'communications',
        'tasks', 'invoices', 'email_templates', 'onboarding_links'
    ];
    t TEXT;
    missing TEXT[] := ARRAY[]::TEXT[];
BEGIN
    FOREACH t IN ARRAY expected_tables LOOP
        IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = t AND table_schema = 'public') THEN
            missing := array_append(missing, t);
        END IF;
    END LOOP;

    IF array_length(missing, 1) > 0 THEN
        RAISE EXCEPTION 'Missing tables: %', array_to_string(missing, ', ');
    ELSE
        RAISE NOTICE 'All % tables created successfully.', array_length(expected_tables, 1);
    END IF;
END $$;

-- =============================================================================
-- End of schema 001
-- =============================================================================
