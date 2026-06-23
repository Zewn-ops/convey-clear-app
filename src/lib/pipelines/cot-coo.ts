import type { Pipeline } from "./types";

// City of Tshwane — Change of Ownership (COT_COO). Vision Board 2026-06-22.
// clientVisible flags transcribed from the orange/blue highlighting.
export const cotCoo: Pipeline = {
  serviceCode: "COO",
  municipality: "COT",
  label: "City of Tshwane — Change of Ownership",
  prePhase: { key: "new_instruction", name: "New Instruction" },
  phases: [
    {
      key: "onboarding",
      internalName: "Onboarding",
      clientName: "COO Received",
      clientVisible: true,
      stages: [
        { key: "documents_received", name: "Documents Received", clientVisible: false, ownerRole: "staff_services" },
        { key: "documents_verified", name: "Documents Verified", clientVisible: true, ownerRole: "staff_services" },
        { key: "submission_ready", name: "Submission Ready", clientVisible: true, ownerRole: "staff_services" },
      ],
    },
    {
      key: "operations",
      internalName: "Operations",
      clientName: "COO in Progress",
      clientVisible: true,
      stages: [
        { key: "coo_submitted", name: "COO Submitted", clientVisible: true, ownerRole: "staff_ops" },
        { key: "escalation_initiated", name: "Escalation Initiated", clientVisible: true, ownerRole: "staff_ops" },
        { key: "welcome_letter_received", name: "Welcome Letter Received", clientVisible: false, ownerRole: "staff_ops" },
      ],
    },
    {
      key: "client_delivery",
      internalName: "Client Delivery",
      clientVisible: false, // blue phase header — stages still surface to client
      stages: [
        { key: "welcome_letter_uploaded", name: "Welcome Letter Uploaded", clientVisible: true, ownerRole: "staff_delivery" },
        { key: "invoice_sent", name: "Invoice Sent", clientVisible: true, ownerRole: "staff_delivery" },
        { key: "proof_of_payment_received", name: "Proof of Payment Received", clientVisible: true, ownerRole: "staff_delivery" },
      ],
    },
    {
      key: "offboarding",
      internalName: "Offboarding",
      clientVisible: false,
      stages: [
        { key: "discuss_matter_with_client", name: "Discuss Matter with Client", clientVisible: false, ownerRole: "staff_delivery" },
        { key: "matter_resolved", name: "Matter Resolved", clientVisible: true, ownerRole: "staff_delivery" },
      ],
    },
  ],
  terminal: { key: "successful", name: "Successful", clientVisible: true },
};
