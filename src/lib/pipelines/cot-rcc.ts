import type { Pipeline } from "./types";
import { COUNCIL_ISSUES, COT_CLEARANCE_BLOCKERS } from "./build";

// City of Tshwane — Property Rates Clearance, RCC (Certificate). Vision Board
// 2026-06-22. Same shape as RCF; the COT decision outcome = Certificate
// Approved / Delayed / Rejected, with Rejected carrying a one-of reason.
export const cotRcc: Pipeline = {
  serviceCode: "PRC",
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
        {
          // Map phase 2, every service: "Documents Outstanding", with the
          // service's own document list nested under it.
          //
          // NO OUTCOMES, deliberately. The nested list is what is MISSING, and
          // several documents are routinely missing at once — the RCA list even
          // ends "Etc.". Modelling it as a one-of would force staff to name a
          // single outstanding document and call that the answer. WHICH ones are
          // outstanding is already tracked, per document and per party, by the
          // matter's own checklist (InPlaceIntake, "5/8 required"); this stage
          // records that the matter is parked waiting for them.
          key: "documents_outstanding",
          name: "Documents Outstanding",
          clientVisible: true,
          ownerRole: "staff_services",
        },
      ],
    },
    {
      key: "operations",
      internalName: "Operations",
      clientName: "Escalation in Progress",
      clientVisible: true,
      stages: [
        { key: "escalated_with_cot", name: "Escalation Lodged with Council", clientVisible: true, ownerRole: "staff_ops", waitingOn: "council" },
        {
          // Map §2/§3/§4 — "Clearance Blocked", one stage with five named
          // causes, identical across RCA, RCF and RCC. Modelled as outcomes so
          // the blocked matters can be counted by cause: "how many are sitting
          // on estimated readings" is the question this stage exists to answer.
          key: "clearance_blocked",
          name: "Clearance Blocked",
          clientVisible: true,
          ownerRole: "staff_ops",
          waitingOn: "council",
          outcomes: COT_CLEARANCE_BLOCKERS,
        },
        { key: "pending_cot_decision", name: "Pending COT Decision", clientVisible: true, ownerRole: "staff_ops", waitingOn: "council" },
        {
          key: "cot_decision",
          name: "COT Decision",
          clientVisible: true,
          ownerRole: "staff_ops",
          outcomes: [
            { key: "certificate_approved", label: "Certificate Approved", clientVisible: true },
            { key: "certificate_delayed", label: "Certificate Delayed", clientVisible: true, reasons: COUNCIL_ISSUES.certificateRejected },
            {
              key: "certificate_rejected",
              label: "Certificate Rejected",
              clientVisible: true,
              // The COT sheet's RCC issues (notes §2.3): W/A · CREDIT SHORT. ·
              // EST. Wrong account and estimated readings were missing here —
              // the sheet has them and the form did not.
              reasons: COUNCIL_ISSUES.certificateRejected,
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
        // Map §4 phase 4. Key preserved; invoicing moved to Offboarding.
        { key: "certificate_approved", name: "Rates Clearance Certificate Issued", clientVisible: true, ownerRole: "staff_delivery" },
        { key: "certificate_uploaded", name: "Rates Clearance Certificate Uploaded", clientVisible: true, ownerRole: "staff_delivery" },
      ],
    },
    {
      key: "offboarding",
      internalName: "Offboarding",
      clientVisible: false,
      stages: [
        { key: "invoice_issued", name: "Invoice Issued", clientVisible: true, ownerRole: "staff_delivery" },
        { key: "payment_outstanding", name: "Payment Outstanding", clientVisible: true, ownerRole: "staff_delivery" },
        { key: "payment_received", name: "Payment Received", clientVisible: true, ownerRole: "staff_delivery" },
      ],
    },
  ],
  terminal: { key: "successful", name: "Successful", clientVisible: true },
};
