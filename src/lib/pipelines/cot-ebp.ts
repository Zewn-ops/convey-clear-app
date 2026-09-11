import type { Pipeline } from "./types";

/**
 * City of Tshwane — Obtaining Existing Building Plans.
 *
 * TRANSCRIBED from Jukka's process map ("Map Process Services Breakdown", read
 * 2026-09-11), §1. Not derived from a sibling service: every phase and stage
 * below is written out in that document.
 *
 * 🔴 THIS SERVICE HAD NO PIPELINE AT ALL. COT defined COO and the three rates
 * clearance stages and nothing else, so getPipeline() fell through to
 * buildDefaultPipeline for every City of Tshwane building-plans matter. Those
 * matters drew the generic Onboarding / Operations rail and a staff-only note
 * saying the council had not been mapped — on production 2026-09-10 that was
 * COT_EBP_JUKKA HOLL_ERF 2609 ZUAAN and COT_BP_THABO MOLEFE, both reading
 * "Phase 1 of 6 · —" because the default pipeline has no name for the phase they
 * were sitting in.
 *
 * Documents required (map §1) — the council's list, not this file's job to
 * enforce; src/lib/councils carries the checklist:
 *   Power of Attorney (signed by owner/seller) · Owner/Seller FICA ·
 *   Rates Account Statement
 */
export const cotEbp: Pipeline = {
  serviceCode: "EBP",
  municipality: "COT",
  label: "City of Tshwane — Existing Building Plans",
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
          key: "request_submitted",
          name: "Request Submitted with Council",
          clientVisible: true,
          ownerRole: "staff_ops",
          waitingOn: "council",
        },
        {
          key: "search_in_progress",
          name: "Search in Progress",
          clientVisible: true,
          ownerRole: "staff_ops",
          waitingOn: "council",
        },
        {
          // The map nests two causes under "Search Blocked". They are outcomes
          // rather than free text so the blocked matters can be counted: "how
          // many are waiting on microfilm" is the question a blocked queue
          // exists to answer.
          key: "search_blocked",
          name: "Search Blocked",
          clientVisible: true,
          ownerRole: "staff_ops",
          waitingOn: "council",
          outcomes: [
            { key: "archive_file_missing", label: "Archive file missing", clientVisible: true },
            { key: "microfilm_missing", label: "Microfilm missing", clientVisible: true },
          ],
        },
      ],
    },
    {
      key: "client_delivery",
      internalName: "Client Delivery",
      clientVisible: false,
      stages: [
        {
          // The map's two delivery outcomes are "No records — proof uploaded"
          // and "Yes record — proof uploaded for: building plans / section title
          // plans / certificate of occupancy". A nil return is a real, billable
          // result here: the council searched and found nothing, and the proof
          // of that is the deliverable.
          key: "search_outcome",
          name: "Search Outcome",
          clientVisible: true,
          ownerRole: "staff_delivery",
          outcomes: [
            { key: "no_records_found", label: "No records — proof uploaded", clientVisible: true },
            { key: "building_plans", label: "Building plans — proof uploaded", clientVisible: true },
            { key: "section_title_plans", label: "Section title plans — proof uploaded", clientVisible: true },
            { key: "certificate_of_occupancy", label: "Certificate of occupancy — proof uploaded", clientVisible: true },
          ],
        },
        { key: "proof_uploaded", name: "Proof Uploaded", clientVisible: true, ownerRole: "staff_delivery" },
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
