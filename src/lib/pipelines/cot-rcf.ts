import type { Pipeline } from "./types";
import { COUNCIL_ISSUES, COT_CLEARANCE_BLOCKERS } from "./build";

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
        // Map §3 phase 4. The memo IS the figures at COT, so the key stays and
        // only the name changes. Invoicing left this phase for Offboarding,
        // where the map puts it — delivery used not to complete until the
        // client had paid, which conflated handing over the work with being
        // paid for it.
        { key: "memo_approved", name: "Rates Clearance Figures Issued", clientVisible: true, ownerRole: "staff_delivery" },
        { key: "figures_uploaded", name: "Rates Clearance Figures Uploaded", clientVisible: true, ownerRole: "staff_delivery" },
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
