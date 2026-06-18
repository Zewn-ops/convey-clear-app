// ============================================================================
// ConveyClear — App Types
// ============================================================================
// REAL SCHEMA types (matches Supabase migrations 001–006). Use these for all
// new/rebuilt pages. The LEGACY block at the bottom is the old scaffold schema
// (profiles / service_requests) kept only so not-yet-migrated pages compile;
// remove it once those pages are rebuilt.
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
  role: UserRole;
  client_id: string | null;
  business_partner_id: string | null;
  active: boolean;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Client {
  id: string;
  entity_type: EntityType;
  full_name: string | null;
  business_name: string | null;
  registration_no: string | null;
  id_number: string | null;
  primary_email: string | null;
  primary_cell: string | null;
  physical_address: string | null;
  business_partner_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Matter {
  id: string;
  client_id: string | null;
  business_partner_id: string | null;
  service_id: string | null;
  property_id: string | null;
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
  business_name: string | null;
  registration_no: string | null;
  id_number: string | null;
  email: string | null;
  cell: string | null;
  physical_address: string | null;
  // Contact person for a business/trust party (A1).
  contact_name: string | null;
  contact_email: string | null;
  contact_cell: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
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
  uploaded_at: string | null;
  verified: boolean | null;
  created_at: string;
}

export type EnquiryStatus = "open" | "assigned" | "resolved" | "closed";

export interface Enquiry {
  id: string;
  business_partner_id: string | null;
  matter_id: string | null;
  created_by: string | null;
  subject: string;
  message: string;
  status: EnquiryStatus;
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

export interface BusinessPartner {
  id: string;
  name: string;
  partner_type: "attorney" | "conveyancer" | "law_firm" | "estate_agent" | "other";
  primary_email: string | null;
  primary_cell: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export function clientDisplayName(
  c?: { full_name?: string | null; business_name?: string | null } | null
): string {
  if (!c) return "—";
  return c.business_name || c.full_name || "—";
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
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export function councilPocName(p?: { first_name?: string | null; last_name?: string | null } | null): string {
  if (!p) return "—";
  return [p.first_name, p.last_name].filter(Boolean).join(" ") || "—";
}

// ============================================================================
// LEGACY (old scaffold schema) — DEPRECATED. Only kept so un-migrated pages
// (dashboard/requests, dashboard/profile, admin/*, api/requests) still compile.
// Do NOT use in new code. Remove when those pages are rebuilt.
// ============================================================================
export type ServiceType =
  | "change_of_ownership"
  | "rates_clearance"
  | "compliance_certificate";

export type RequestStatus =
  | "pending"
  | "documents_required"
  | "in_review"
  | "in_progress"
  | "completed"
  | "rejected";

export type DocumentType =
  | "fica"
  | "proof_of_residence"
  | "id_document"
  | "other";

/** @deprecated old scaffold schema — use AppUser */
export interface Profile {
  id: string;
  full_name: string;
  phone: string | null;
  id_number: string | null;
  role: "client" | "admin";
  created_at: string;
  updated_at: string;
}

/** @deprecated old scaffold schema — use Matter */
export interface ServiceRequest {
  id: string;
  client_id: string;
  service_type: ServiceType;
  status: RequestStatus;
  property_address: string;
  notes: string | null;
  admin_notes: string | null;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
  profiles?: Pick<Profile, "id" | "full_name" | "phone" | "id_number">;
}

/** @deprecated old scaffold schema — use MatterDocument */
export interface Document {
  id: string;
  client_id: string;
  request_id: string | null;
  document_type: DocumentType;
  file_name: string;
  file_path: string;
  file_size: number | null;
  mime_type: string | null;
  created_at: string;
}

export const SERVICE_TYPE_LABELS: Record<ServiceType, string> = {
  change_of_ownership: "Change of Ownership",
  rates_clearance: "Property Rates Clearance",
  compliance_certificate: "Compliance Certificate",
};

export const REQUEST_STATUS_LABELS: Record<RequestStatus, string> = {
  pending: "Pending",
  documents_required: "Documents Required",
  in_review: "In Review",
  in_progress: "In Progress",
  completed: "Completed",
  rejected: "Rejected",
};

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  fica: "FICA Document",
  proof_of_residence: "Proof of Residence",
  id_document: "ID Document",
  other: "Other",
};
