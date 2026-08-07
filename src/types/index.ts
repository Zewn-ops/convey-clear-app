// ============================================================================
// ConveyClear — App Types
// ============================================================================
// REAL SCHEMA types (matches the Supabase migrations). Single source of truth
// for role lists and row shapes — middleware.ts imports the role constants from
// here, so adding a role in one place is adding it everywhere.
// ============================================================================

// --- Roles (matches users_role_check, migration 013) -----------------------
export type UserRole =
  | "super_admin"
  | "admin"
  | "staff_services"
  | "staff_ops"
  | "staff_delivery"
  | "client"
  | "attorney"
  | "contractor"
  | "business_partner"
  | "council";

// Staff = everyone who works the pipeline from the /admin side. super_admin is a
// superset of admin, so it is staff too. Mirrors app_is_staff() in the DB.
export const STAFF_ROLES: UserRole[] = [
  "super_admin",
  "admin",
  "staff_services",
  "staff_ops",
  "staff_delivery",
];

// Admin tier = can manage users (admin + super_admin). Mirrors app_is_admin().
export const ADMIN_ROLES: UserRole[] = ["super_admin", "admin"];

export function isStaffRole(role?: UserRole | null): boolean {
  return !!role && STAFF_ROLES.includes(role);
}

export function isAdminRole(role?: UserRole | null): boolean {
  return !!role && ADMIN_ROLES.includes(role);
}

export function isSuperAdmin(role?: UserRole | null): boolean {
  return role === "super_admin";
}

export function isPartnerRole(role?: UserRole | null): boolean {
  return role === "business_partner";
}

export const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: "Super Admin",
  admin: "Administrator",
  staff_services: "Services",
  staff_ops: "Operations",
  staff_delivery: "Delivery",
  client: "Client",
  attorney: "Attorney",
  contractor: "Contractor",
  business_partner: "Business Partner",
  council: "Council",
};

// Roles a staff user may CREATE/ASSIGN from the user-management screen.
// super_admin can assign anything; a plain admin cannot mint admin/super_admin.
export const ASSIGNABLE_ROLES_BY_SUPER: UserRole[] = [
  "super_admin",
  "admin",
  "staff_services",
  "staff_ops",
  "staff_delivery",
  "business_partner",
  "client",
];
export const ASSIGNABLE_ROLES_BY_ADMIN: UserRole[] = [
  "staff_services",
  "staff_ops",
  "staff_delivery",
  "business_partner",
  "client",
];

// --- Enums -----------------------------------------------------------------
export type EntityType = "natural_person" | "business" | "trust";
export type MatterStatus = "new" | "open" | "won" | "lost" | "archived" | "on_hold";
export type MatterPriority =
  | "priority"
  | "standard"
  | "emerging"
  | "complex"
  | "urgent"
  | "whale";
export type MatterPhase = "1" | "2" | "3" | "4";

export const PHASE_LABELS: Record<MatterPhase, string> = {
  "1": "Initial Contact & Setup",
  "2": "Form Submission & Data Sync",
  "3": "Legal Consent & Documentation",
  "4": "Quotation & Operations Handover",
};

export const MATTER_STATUS_LABELS: Record<MatterStatus, string> = {
  new: "New",
  open: "Open",
  won: "Won",
  lost: "Lost",
  archived: "Archived",
  on_hold: "On Hold",
};

export const PRIORITY_LABELS: Record<MatterPriority, string> = {
  priority: "Priority",
  standard: "Standard",
  emerging: "Emerging",
  complex: "Complex",
  urgent: "Urgent",
  whale: "Whale",
};

// --- Row types -------------------------------------------------------------
export interface AppUser {
  id: string;
  auth_user_id: string | null;
  email: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  role: UserRole;
  client_id: string | null;
  business_partner_id: string | null;
  phone: string | null;
  active: boolean;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
  // A business_partner user with rights over their own firm's banking/trust/BP
  // details (migration 037). Not a role — gates the /partner/firm surface only.
  is_firm_admin?: boolean;
}

export interface Client {
  id: string;
  entity_type: EntityType;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  business_name: string | null;
  registration_no: string | null;
  id_number: string | null;
  primary_email: string | null;
  primary_cell: string | null;
  physical_address: string | null;
  business_partner_id: string | null;
  created_at: string;
  updated_at: string;
  // FICA fields (migration 010). These have existed in the database since June but
  // were never declared here, so nothing outside the onboard submit could read or
  // write them in a type-safe way — which is part of why in-place capture stalled.
  person_industry?: string | null;
  person_designation?: string | null;
  /** The CLIENT's own municipal-portal login. Staff-only — never exposed to a partner. */
  municipal_username?: string | null;
  municipal_password?: string | null;
  marketing_opt_in?: boolean | null;
  popia_consent_at?: string | null;
  terms_accepted_at?: string | null;
}

export interface Matter {
  id: string;
  client_id: string | null;
  business_partner_id: string | null;
  service_id: string | null;
  property_id: string | null;
  // Optional parent property transfer (migration 026). NULL = standalone matter.
  transfer_id: string | null;
  title: string | null;
  service_notes: string | null;
  current_stage: string | null;
  current_phase: MatterPhase | null;
  current_owner_id: string | null;
  priority: MatterPriority | null;
  deadline: string | null;
  deal_value: number | null;
  status: MatterStatus | null;
  municipality: string | null;
  partner_file_ref: string | null;
  additional_services: string | null;
  invoice_status: string | null;
  drive_folder_id: string | null;
  created_at: string;
  updated_at: string;
  // optional joined client (PostgREST embed)
  clients?: Pick<Client, "id" | "entity_type" | "full_name" | "business_name"> | null;
}

export type MatterPartyRole = "buyer" | "seller" | "owner" | "applicant" | "other";

// A party to a matter (COO buyer/seller etc.) — a DATA CAPTURE under one matter,
// NOT an auth account. No login. Created/managed by staff or the referring partner.
export interface MatterParty {
  id: string;
  matter_id: string;
  role: MatterPartyRole;
  entity_type: EntityType;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  business_name: string | null;
  registration_no: string | null;
  id_number: string | null;
  email: string | null;
  cell: string | null;
  physical_address: string | null;
  // Contact person for a business/trust party (A1). Split into first/surname in
  // migration 024 (#6); contact_name retained (deprecated) as a legacy fallback.
  contact_first_name: string | null;
  contact_last_name: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_cell: string | null;
  // Link to a known client record → resolves this party's reusable vault docs
  // (migration 025). Set when a login/contact is created from the party.
  client_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// A reusable, client-scoped FICA document (the vault — migration 025). Attached
// to matters by reference (documents.client_document_id) without re-uploading.
export interface ClientDocument {
  id: string;
  client_id: string;
  document_type: string;
  file_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  storage_bucket: string | null;
  storage_path: string | null;
  uploaded_by: string | null;
  created_at: string;
  // FICA vault v2 (migration 032).
  status?: "current" | "superseded" | "archived" | null;
  expiry_date?: string | null;
  verified?: boolean | null;
  verified_at?: string | null;
  verified_by?: string | null;
  supersedes_id?: string | null;
  notes?: string | null;
}

// A document that belongs to the property transaction rather than to any one
// matter inside it — the deed search, the transfer letter, the clearance figures
// (migration 034). Reused onto a matter the same way a client-vault doc is.
export interface TransferDocument {
  id: string;
  transfer_id: string;
  document_type: string;
  file_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  storage_bucket: string | null;
  storage_path: string | null;
  status?: "current" | "superseded" | "archived" | null;
  supersedes_id?: string | null;
  verified?: boolean | null;
  verified_at?: string | null;
  verified_by?: string | null;
  notes?: string | null;
  uploaded_by: string | null;
  // Staff-upload approval gate (042). NULL = pending an admin's review, hidden
  // from clients and the partner firm once 043 is applied.
  approved_at?: string | null;
  // Disapproval (044). Set = an admin rejected this upload; it stays hidden and
  // carries the reason shown to the uploader.
  disapproved_at?: string | null;
  disapproval_reason?: string | null;
  created_at: string;
}

export interface MatterDocument {
  id: string;
  matter_id: string;
  document_type: string;
  document_status: string | null;
  drive_file_id: string | null;
  storage_bucket: string | null;
  storage_path: string | null;
  matter_party_id: string | null;
  file_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  not_available_reason: string | null;
  // Set when this row is a REUSED client-vault doc (migration 025); its storage
  // lives in the client-documents bucket rather than the matter's.
  client_document_id: string | null;
  // Set when this row is a REUSED transfer-level doc (migration 034) — the deed
  // search etc. held once for the property. Storage lives in transfer-documents.
  transfer_document_id?: string | null;
  uploaded_at: string | null;
  verified: boolean | null;
  // Staff-upload approval gate (042). NULL = pending an admin's review, hidden
  // from clients and the partner firm once 043 is applied.
  approved_at?: string | null;
  // Disapproval (044). Set = an admin rejected this upload; it stays hidden and
  // carries the reason shown to the uploader.
  disapproved_at?: string | null;
  disapproval_reason?: string | null;
  created_at: string;
}

export type EnquiryStatus = "open" | "assigned" | "resolved" | "closed";

// Who a matter enquiry is shared with (migration 027).
//   partner = staff + the owning firm (the default, and every pre-027 row)
//   shared  = staff + the owning firm + the matter's CLIENT
export type EnquiryVisibility = "partner" | "shared";

export interface Enquiry {
  id: string;
  business_partner_id: string | null;
  matter_id: string | null;
  created_by: string | null;
  subject: string;
  message: string;
  status: EnquiryStatus;
  visibility: EnquiryVisibility;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
}

export interface EnquiryMessage {
  id: string;
  enquiry_id: string;
  author_id: string | null;
  author_label: string | null;
  body: string;
  created_at: string;
}

export const ENQUIRY_STATUS_LABELS: Record<EnquiryStatus, string> = {
  open: "Open",
  assigned: "Assigned",
  resolved: "Resolved",
  closed: "Closed",
};

export type PartnerType = "attorney" | "conveyancer" | "law_firm" | "estate_agent" | "other";

export const PARTNER_TYPES: PartnerType[] = [
  "attorney",
  "conveyancer",
  "law_firm",
  "estate_agent",
  "other",
];

export const PARTNER_TYPE_LABELS: Record<PartnerType, string> = {
  attorney: "Attorney",
  conveyancer: "Conveyancer",
  law_firm: "Law firm",
  estate_agent: "Estate agent",
  other: "Other",
};

export interface Firm {
  id: string;
  name: string;
  abbreviation: string | null;
  partner_type: PartnerType;
  primary_email: string | null;
  primary_cell: string | null;
  physical_address: string | null;
  notes: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

// --- Property Transfers (migration 026) ------------------------------------
// One property transaction, grouping the several matters it spawns (PRC → COO →
// refund → …). Firm-scoped: business_partner_id is the owning attorney firm and
// the partner RLS predicate. Not visible to clients (it spans both sides of the
// deal, so a client would see their counterparty).
export type TransferStatus = "open" | "registered" | "cancelled" | "on_hold";

export const TRANSFER_STATUS_LABELS: Record<TransferStatus, string> = {
  open: "Open",
  registered: "Registered",
  cancelled: "Cancelled",
  on_hold: "On Hold",
};

export interface PropertyTransfer {
  id: string;
  reference: string;
  property_description: string | null;
  municipality: string | null;
  status: TransferStatus;
  business_partner_id: string | null;
  estate_agent_partner_id: string | null;
  seller_client_id: string | null;
  buyer_client_id: string | null;
  // The property this transaction is about (056). Nullable: a transfer can be
  // opened before anyone has built the property profile.
  property_id: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// A property as an entity (056, Meeting 2 §44/§106). Subsumes the `locations`
// table planned in REDESIGN_SECTION1_PLAN.md — see that migration's header.
export interface Property {
  id: string;
  client_id: string | null;
  label: string;
  address: string | null;
  erf_number: string | null;
  municipality: string | null;
  province: string | null;
  suburb: string | null;
  rates_account_no: string | null;
  title_deed_no: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

// Join first + surname into a single name (write side — full_name is kept in
// sync for backward-compat + business/trust display).
export function composeFullName(first?: string | null, last?: string | null): string {
  return [first, last].map((s) => (s ?? "").trim()).filter(Boolean).join(" ");
}

// Contact-person display name for a business/trust party — prefers the split
// first/surname columns (migration 024, #6), falling back to the legacy
// contact_name for rows not yet backfilled.
export function contactPersonName(p: {
  contact_first_name?: string | null;
  contact_last_name?: string | null;
  contact_name?: string | null;
}): string {
  return composeFullName(p.contact_first_name, p.contact_last_name) || (p.contact_name ?? "").trim();
}

// A natural-person display name, preferring the split first/surname columns and
// falling back to the legacy full_name.
export function personName(
  p?: { first_name?: string | null; last_name?: string | null; full_name?: string | null } | null
): string {
  if (!p) return "—";
  return composeFullName(p.first_name, p.last_name) || (p.full_name ?? "").trim() || "—";
}

export function clientDisplayName(
  c?: {
    first_name?: string | null;
    last_name?: string | null;
    full_name?: string | null;
    business_name?: string | null;
  } | null
): string {
  if (!c) return "—";
  return c.business_name || composeFullName(c.first_name, c.last_name) || c.full_name || "—";
}

// A council/municipal point-of-contact — the internal-only contact book of
// people ConveyClear deals with at each council (Theme G / B5). No login;
// staff-only. Linked to matters via matter_council_pocs (many-to-many).
export interface CouncilPoc {
  id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  cell: string | null;
  council: string | null;
  department: string | null;
  notes: string | null;
  // Extra contact-card fields (migration 045). "Comments" in the UI reuses notes.
  tel: string | null;
  office_description: string | null;
  birthday: string | null;
  region: string | null;
  job_title: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export function councilPocName(p?: { first_name?: string | null; last_name?: string | null } | null): string {
  if (!p) return "—";
  return [p.first_name, p.last_name].filter(Boolean).join(" ") || "—";
}

// The old scaffold schema (profiles / service_requests) is GONE — its last
// consumers (the /api/requests routes and three dead components) were deleted
// 2026-07-16 with the legacy types that served them.
