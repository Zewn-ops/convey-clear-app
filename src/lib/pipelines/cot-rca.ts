import type { Pipeline } from "./types";
import { COUNCIL_ISSUES } from "./build";

// City of Tshwane — Property Rates Clearance, RCA (Rates Clearance Application).
//
// ⚠️ DERIVED, NOT TRANSCRIBED. The Vision Board (2026-06-22) defined RCF and RCC
// only, and the handwritten notes (2026-08-31 §2.1) give RCA's DOCUMENT list and
// nothing about its phases — they carry issue vocabularies for RCF and RCC but
// none for RCA. So the shape below follows cot-rcf, which is defensible because
// RCA / RCF / RCC are sequential stages of one process at one council: the same
// team, the same portal, the same decision point.
//
// What is genuinely RCA-specific rather than copied:
//   · the decision produces an ACCOUNT, not a memo — the outcome vocabulary is
//     Account Opened / Application Delayed / Application Rejected;
//   · the delivery phase ends when the rates account number is captured on the
//     matter, because that number is what the RCF (the next stage) is applied
//     for against;
//   · there is no proof-of-payment step — opening an account is not billed to
//     the client the way a memo is.
//
// ▶ CONFIRM WITH JUKKA. If COT runs RCA through different stages, this file is
// the only thing that changes — a matter stores its position, not the tree.
export const cotRca: Pipeline = {
  serviceCode: "PRC",
  municipality: "COT",
  subtype: "RCA",
  label: "City of Tshwane — Rates Clearance Application (open the account)",
  prePhase: { key: "new_instruction", name: "New Instruction" },
  phases: [
    {
      key: "onboarding",
      internalName: "Onboarding",
      clientName: "Application Received",
      clientVisible: true,
      stages: [
        { key: "documents_received", name: "Documents Received", clientVisible: true, ownerRole: "staff_services" },
        { key: "documents_verified", name: "Documents Verified", clientVisible: true, ownerRole: "staff_services" },
      ],
    },
    {
      key: "operations",
      internalName: "Operations",
      clientName: "Application with the Council",
      clientVisible: true,
      stages: [
        { key: "application_submitted", name: "Application Submitted to COT", clientVisible: true, ownerRole: "staff_ops", waitingOn: "council" },
        { key: "pending_cot_decision", name: "Pending COT Decision", clientVisible: true, ownerRole: "staff_ops", waitingOn: "council" },
        {
          key: "cot_decision",
          name: "COT Decision",
          clientVisible: true,
          ownerRole: "staff_ops",
          outcomes: [
            { key: "account_opened", label: "Account Opened", clientVisible: true },
            {
              key: "application_delayed",
              label: "Application Delayed",
              clientVisible: true,
              // Shared vocabulary with the RCF's delay reasons (notes §2.2) —
              // the same council systems stall an application for the same
              // reasons they stall a memo. "Missing meter readings" is added
              // because the RCA is the step that captures them (§2.1: METER
              // READING (W + E) sits on the RCA line, not the RCF's).
              reasons: COUNCIL_ISSUES.applicationDelayed,
            },
            {
              key: "application_rejected",
              label: "Application Rejected",
              clientVisible: true,
              reasons: [
                { key: "wrong_account", label: "Wrong account" },
                { key: "documents_insufficient", label: "Documents insufficient" },
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
        // The deliverable of an RCA is the account number itself — capture it on
        // the matter (Rates account number, below the pipeline card) and the
        // figures request has something to quote.
        { key: "account_number_issued", name: "Account Number Issued", clientVisible: true, ownerRole: "staff_delivery" },
        { key: "account_details_sent", name: "Account Details Sent to Client", clientVisible: true, ownerRole: "staff_delivery" },
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
