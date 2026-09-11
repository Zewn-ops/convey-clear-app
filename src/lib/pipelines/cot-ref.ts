import type { Pipeline } from "./types";

/**
 * City of Tshwane — Refund Application (seller account refunds).
 *
 * TRANSCRIBED from Jukka's process map ("Map Process Services Breakdown", read
 * 2026-09-11), §6.
 *
 * 🔴 THIS SERVICE HAD NO PIPELINE EITHER. A refund is one of the seven lines on
 * every property transfer's checklist and one of the services a matter can be
 * opened on, and it drew the generic rail.
 *
 * Documents required (map §6, listed there under Documents Outstanding):
 *   Transfer Confirmation (including the buyer's contact details and the
 *   seller's refund request) · Updated Deed Search · Rates Clearance Figures ·
 *   Proof of Payment for the RCF · Seller's FICA · the conveyancing attorney's
 *   bank details
 *
 * That last one is the reason this service cannot simply reuse the COO tree: a
 * refund pays money OUT, to an account someone has to have given us.
 */
export const cotRef: Pipeline = {
  serviceCode: "REF",
  municipality: "COT",
  label: "City of Tshwane — Refund Application",
  prePhase: { key: "new_instruction", name: "New Instruction" },
  phases: [
    {
      key: "onboarding",
      internalName: "Onboarding",
      clientName: "Request Received",
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
      clientName: "With the Council",
      clientVisible: true,
      stages: [
        {
          key: "application_lodged",
          name: "Application Lodged with Council",
          clientVisible: true,
          ownerRole: "staff_ops",
          waitingOn: "council",
        },
        {
          key: "refund_blocked",
          name: "Refund Blocked",
          clientVisible: true,
          ownerRole: "staff_ops",
          waitingOn: "council",
          outcomes: [
            {
              key: "pending_proof_of_payment",
              label: "Pending proof of payment for credit adjustments",
              clientVisible: true,
            },
            {
              key: "pending_credit_confirmation",
              label: "Pending confirmation of the credit calculation from Billing",
              clientVisible: true,
            },
          ],
        },
        {
          // The map lists these as two separate approvals, and they are: the
          // council signs off the CALCULATION, then the money waits for a
          // payment run. A refund routinely sits weeks in the second one with
          // the first long since done, and collapsing them would hide that.
          key: "pending_calculation_approval",
          name: "Pending Approval for Calculations",
          clientVisible: true,
          ownerRole: "staff_ops",
          waitingOn: "council",
        },
        {
          key: "pending_payment_run",
          name: "Pending Approval for Payment Run",
          clientVisible: true,
          ownerRole: "staff_ops",
          waitingOn: "council",
        },
      ],
    },
    {
      key: "client_delivery",
      internalName: "Client Delivery",
      clientVisible: false,
      stages: [
        { key: "refund_approved", name: "Refund Approved by Municipality", clientVisible: true, ownerRole: "staff_delivery" },
        { key: "payout_processing", name: "Payout Processing", clientVisible: true, ownerRole: "staff_delivery" },
        {
          // The map: "Confirmation from Attorney to receive refund". The money
          // lands in the conveyancer's account, so the matter is not delivered
          // until they say it arrived — ConveyClear cannot see that from here.
          key: "attorney_confirmed_receipt",
          name: "Attorney Confirmed Receipt",
          clientVisible: true,
          ownerRole: "staff_delivery",
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
