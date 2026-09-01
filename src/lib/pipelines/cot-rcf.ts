import type { Pipeline } from "./types";
import { COUNCIL_ISSUES } from "./build";

// City of Tshwane — Property Rates Clearance, RCF (Memo). Vision Board 2026-06-22.
// The Phase-2 COT decision is a branching outcome stage: Approved / Delayed /
// Rejected, where Delayed + Rejected each require a one-of reason.
export const cotRcf: Pipeline = {
  serviceCode: "PRC",
  municipality: "COT",
  subtype: "RCF",
  label: "City of Tshwane — Rates Clearance Figures (Memo)",
  prePhase: { key: "new_instruction", name: "New Instruction" },
  phases: [
    {
      key: "onboarding",
      internalName: "Onboarding",
      clientName: "RCF Received",
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
        { key: "escalated_with_cot", name: "Escalated with COT", clientVisible: false, ownerRole: "staff_ops", waitingOn: "council" },
        { key: "pending_cot_decision", name: "Pending COT Decision", clientVisible: true, ownerRole: "staff_ops", waitingOn: "council" },
        {
          key: "cot_decision",
          name: "COT Decision",
          clientVisible: true,
          ownerRole: "staff_ops",
          outcomes: [
            { key: "memo_approved", label: "Memo Approved", clientVisible: true },
            {
              key: "memo_delayed",
              label: "Memo Delayed",
              clientVisible: true,
              // The COT sheet's five (notes §2.2), confirmed by Zewn on
              // 2026-09-01 — W/A is a wrong account, "mistake on application"
              // means incorrect details. `system_error` is the Vision Board's
              // and is not on the sheet; kept because staff had it before.
              reasons: COUNCIL_ISSUES.figuresDelayed,
            },
            {
              key: "memo_rejected",
              label: "Memo Rejected",
              clientVisible: true,
              reasons: [
                { key: "billing", label: "Billing" },
                { key: "memo_expired", label: "Memo expired" },
                { key: "mistake_on_application", label: "Mistake on application (incorrect details)" },
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
        { key: "memo_approved", name: "Memo Approved", clientVisible: true, ownerRole: "staff_delivery" },
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
