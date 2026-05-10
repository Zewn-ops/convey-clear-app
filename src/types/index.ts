export type UserRole = "client" | "admin";

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

export interface Profile {
  id: string;
  full_name: string;
  phone: string | null;
  id_number: string | null;
  role: UserRole;
  created_at: string;
  updated_at: string;
}

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
