import type { Pipeline } from "./types";

// City of Tshwane — Change of Ownership (COT_COO).
//
// Vision Board 2026-06-22 for the clientVisible flags (transcribed from the
// orange/blue highlighting); PHASES AND STAGES REVISED 2026-09-11 against
// Jukka's process map ("Map Process Services Breakdown", §5), which is the first
// document to write this process out end to end.
//
// Stage KEYS are preserved wherever the map describes the same step under a
// different name — a matter stores its position as a key, and renaming one stops
// the stepper finding where an in-flight matter is standing. New keys appear
// only for steps that did not exist.
//
// Documents required (map §5): Transfer Confirmation (with the buyer's contact
// details and the seller's refund request) · Updated Deed Search · Rates
// Clearance Figures · Proof of Payment for the RCF · Seller's FICA · Buyer's
// FICA.
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
      clientName: "COO in Progress",
      clientVisible: true,
      stages: [
        {
          // Map §5: one lodgement that moves five things at once — the rates and
          // refuse account, the utilities account (water, electricity and/or
          // sanitation), any prepaid account, the consumer deposit paid to the
          // municipality, and the final meter readings. They are one stage
          // because the council takes them as one application; what has and has
          // not come back is Client Delivery's business, below.
          key: "coo_submitted",
          name: "Application Lodged with Council",
          clientVisible: true,
          ownerRole: "staff_ops",
          waitingOn: "council",
        },
        { key: "escalation_initiated", name: "Escalation Initiated", clientVisible: true, ownerRole: "staff_ops", waitingOn: "council" },
        { key: "welcome_letter_received", name: "Welcome Letter Received", clientVisible: false, ownerRole: "staff_ops" },
      ],
    },
    {
      key: "client_delivery",
      internalName: "Client Delivery",
      clientVisible: false, // blue phase header — stages still surface to client
      stages: [
        { key: "proof_received", name: "Proof Received", clientVisible: true, ownerRole: "staff_delivery" },
        {
          // Map §5 phase 4 names the two artefacts the council returns. Keeping
          // the old key (`welcome_letter_uploaded`) because the welcome letter
          // IS how COT issues the buyer's new account number — the map's name
          // for the step is better, the step is the same one.
          key: "welcome_letter_uploaded",
          name: "Proof Uploaded",
          clientVisible: true,
          ownerRole: "staff_delivery",
          outcomes: [
            { key: "new_account_number", label: "New account number for the buyer", clientVisible: true },
            { key: "consumer_deposit_receipt", label: "Consumer deposit receipt", clientVisible: true },
          ],
        },
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
