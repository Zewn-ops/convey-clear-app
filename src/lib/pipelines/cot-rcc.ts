import type { Pipeline } from "./types";

// City of Tshwane — Property Rates Clearance, RCC (Certificate). Vision Board
// 2026-06-22. Same shape as RCF; the COT decision outcome = Certificate
// Approved / Delayed / Rejected, with Rejected carrying a one-of reason.
export const cotRcc: Pipeline = {
  serviceCode: "RCF",
  municipality: "COT",
  subtype: "RCC",
  label: "City of Tshwane — Rates Clearance Certificate",
  prePhase: { key: "new_instruction", name: "New Instruction" },
  phases: [
    {
      key: "onboarding",
      internalName: "Onboarding",
      clientName: "RCC Received",
      clientVisible: true,
      stages: [
        { key: "documents_received", name: "Documents Received", clientVisible: true, ownerRole: "staff_services" },
        { key: "documents_verified", name: "Documents Verified", clientVisible: true, ownerRole: "staff_services" },
      ],
    },
    {
      key: "operations",
      internalName: "Operations",
      clientName: "Escalation in Progress",
      clientVisible: true,
      stages: [
        { key: "escalated_with_cot", name: "Escalated with COT", clientVisible: false, ownerRole: "staff_ops" },
        { key: "pending_cot_decision", name: "Pending COT Decision", clientVisible: true, ownerRole: "staff_ops" },
        {
          key: "cot_decision",
          name: "COT Decision",
          clientVisible: true,
          ownerRole: "staff_ops",
          outcomes: [
            { key: "certificate_approved", label: "Certificate Approved", clientVisible: true },
            { key: "certificate_delayed", label: "Certificate Delayed", clientVisible: true },
            {
              key: "certificate_rejected",
              label: "Certificate Rejected",
              clientVisible: true,
              reasons: [
                { key: "credit_short", label: "Credit Short" },
                { key: "pending_journals", label: "Pending Journals" },
                { key: "proof_of_payment_not_uploaded", label: "Proof of payment not uploaded" },
                { key: "system_error", label: "System error" },
              ],
            },
          ],
        },
      ],
    },
    {
      key: "client_delivery",
      internalName: "Client Delivery",
      clientVisible: false,
      stages: [
        { key: "certificate_approved", name: "Certificate Approved", clientVisible: true, ownerRole: "staff_delivery" },
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
