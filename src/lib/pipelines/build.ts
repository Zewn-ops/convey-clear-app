import type { Pipeline, StageReason } from "./types";

/**
 * Pipeline builders — one shape, three councils.
 *
 * WHY THIS EXISTS
 * ---------------
 * City of Tshwane had four hand-written pipelines and CoE and CoJ had none, so
 * `getPipeline()` returned null for every matter at two of the three councils
 * we actually work. Zewn, 2026-09-01: "how tf is there no pipelines for COE and
 * COJ i sent you the handwritten notes? just make it up based on the knowledge
 * you have already based on COT and the notes."
 *
 * That is the right call and the notes support it. The handwritten sheets
 * (2026-08-31) describe the three councils as variations on ONE process, not
 * three processes: CoE's RCF issue list is written "SAME AS COT", its RCC list
 * "SAME AS COT + HANGING", and the whole COJ sheet is "same as CoE" plus an
 * attorney code and a practice number. §5.15 was decided on exactly this
 * evidence — a shared shell with per-council config, not per-council layouts.
 *
 * So the PHASES are shared and only what the councils genuinely differ on is
 * passed in: the council's name in the stage labels, and its own failure-reason
 * vocabulary.
 *
 * ⚠️ DERIVED, NOT TRANSCRIBED. COT's four pipelines came from the Vision Board
 * 2026-06-22 and stay in their own files as the transcribed originals. What is
 * built here is the same process with the council swapped, because that is what
 * the notes say the councils are. Where a council turns out to run a genuinely
 * different sequence, give it its own file the way COT has — a matter stores its
 * POSITION, so replacing a pipeline definition costs no migration.
 */

/** Reasons a rates-clearance FIGURES request stalls. */
export interface CouncilIssueVocabulary {
  /** Delayed / stalled figures (COT sheet, §2.2 — confirmed by Zewn 2026-09-01). */
  figuresDelayed: StageReason[];
  /** A rejected certificate (COT sheet, §2.3). */
  certificateRejected: StageReason[];
  /** An application to open the account that could not be processed. */
  applicationDelayed: StageReason[];
}

/**
 * The COT vocabulary, from the handwritten sheet.
 *
 * §2.2 lists five reasons an RCF stalls: JOURNALS OUTS. · EST. [READINGS] ·
 * BILLING · W/A — C. · MISTAKE ON APP. — L.ATT. Zewn confirmed all five on
 * 2026-09-01: W/A is a wrong account, and "mistake on application" means
 * incorrect details.
 *
 * `system_error` and `memo_expired` are NOT on the handwritten sheet — they come
 * from the Vision Board 2026-06-22 and are kept because a council system that
 * falls over is a real thing that happens and staff had the option before.
 */
export const COUNCIL_ISSUES: CouncilIssueVocabulary = {
  figuresDelayed: [
    { key: "pending_journals", label: "Outstanding journals" },
    { key: "estimated_readings", label: "Estimated readings" },
    { key: "billing", label: "Billing" },
    { key: "wrong_account", label: "Wrong account" },
    { key: "mistake_on_application", label: "Mistake on application (incorrect details)" },
    { key: "system_error", label: "System error" },
  ],
  certificateRejected: [
    { key: "wrong_account", label: "Wrong account" },
    { key: "credit_short", label: "Credit short" },
    { key: "estimated_readings", label: "Estimated readings" },
    { key: "pending_journals", label: "Outstanding journals" },
    { key: "proof_of_payment_not_uploaded", label: "Proof of payment not uploaded" },
    { key: "system_error", label: "System error" },
  ],
  applicationDelayed: [
    { key: "estimated_readings", label: "Estimated readings" },
    { key: "missing_meter_readings", label: "Missing meter readings" },
    { key: "billing", label: "Billing" },
    { key: "pending_journals", label: "Outstanding journals" },
    { key: "wrong_account", label: "Wrong account" },
    { key: "system_error", label: "System error" },
  ],
};

/**
 * "+ HANGING (4.)" on the CoE sheet's RCC block (§3.5).
 *
 * Zewn, 2026-09-01: "hanging is related to the hanging of the portal. if the
 * portal is moving slow or not loading or something." So it is a council-portal
 * availability failure, distinct from `system_error` — the portal is up and
 * unusable rather than erroring — and it is why the CoE list is written as
 * COT's plus one.
 */
export const PORTAL_HANGING: StageReason = {
  key: "portal_hanging",
  label: "Council portal hanging / not loading",
};

const withHanging = (rs: StageReason[]): StageReason[] => [...rs, PORTAL_HANGING];

/**
 * CoE and CoJ inherit COT's vocabulary. CoE's RCC adds the hanging portal, and
 * the COJ sheet is written as "same as CoE", so it takes the same list.
 */
export const ISSUES_BY_COUNCIL: Record<string, CouncilIssueVocabulary> = {
  COT: COUNCIL_ISSUES,
  COE: { ...COUNCIL_ISSUES, certificateRejected: withHanging(COUNCIL_ISSUES.certificateRejected) },
  COJ: { ...COUNCIL_ISSUES, certificateRejected: withHanging(COUNCIL_ISSUES.certificateRejected) },
};

const OFFBOARDING = {
  key: "offboarding",
  internalName: "Offboarding",
  clientVisible: false,
  stages: [
    { key: "discuss_matter_with_client", name: "Discuss Matter with Client", clientVisible: false, ownerRole: "staff_delivery" as const },
    { key: "matter_resolved", name: "Matter Resolved", clientVisible: true, ownerRole: "staff_delivery" as const },
  ],
};

const TERMINAL = { key: "successful", name: "Successful", clientVisible: true };
const PRE_PHASE = { key: "new_instruction", name: "New Instruction" };

/** Change of Ownership, for a council other than COT. */
export function buildCoo(municipality: string, councilName: string): Pipeline {
  return {
    serviceCode: "COO",
    municipality,
    label: `${councilName} — Change of Ownership`,
    prePhase: PRE_PHASE,
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
          { key: "coo_submitted", name: "COO Submitted", clientVisible: true, ownerRole: "staff_ops", waitingOn: "council" },
          { key: "escalation_initiated", name: "Escalation Initiated", clientVisible: true, ownerRole: "staff_ops", waitingOn: "council" },
          { key: "welcome_letter_received", name: "Welcome Letter Received", clientVisible: false, ownerRole: "staff_ops" },
        ],
      },
      {
        key: "client_delivery",
        internalName: "Client Delivery",
        clientVisible: false,
        stages: [
          { key: "welcome_letter_uploaded", name: "Welcome Letter Uploaded", clientVisible: true, ownerRole: "staff_delivery" },
          { key: "invoice_sent", name: "Invoice Sent", clientVisible: true, ownerRole: "staff_delivery" },
          { key: "proof_of_payment_received", name: "Proof of Payment Received", clientVisible: true, ownerRole: "staff_delivery" },
        ],
      },
      OFFBOARDING,
    ],
    // COO names no council in its stages — COT's transcribed version does not
    // either, and the council is already in the label.
    terminal: TERMINAL,
  };
}

/** RCA — opens the rates clearance account. */
export function buildRca(municipality: string, councilName: string, short: string): Pipeline {
  const issues = ISSUES_BY_COUNCIL[municipality] ?? COUNCIL_ISSUES;
  return {
    serviceCode: "PRC",
    municipality,
    subtype: "RCA",
    label: `${councilName} — Rates Clearance Application (open the account)`,
    prePhase: PRE_PHASE,
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
          { key: "application_submitted", name: `Application Submitted to ${short}`, clientVisible: true, ownerRole: "staff_ops", waitingOn: "council" },
          { key: "pending_council_decision", name: `Pending ${short} Decision`, clientVisible: true, ownerRole: "staff_ops", waitingOn: "council" },
          {
            key: "council_decision",
            name: `${short} Decision`,
            clientVisible: true,
            ownerRole: "staff_ops",
            outcomes: [
              { key: "account_opened", label: "Account Opened", clientVisible: true },
              { key: "application_delayed", label: "Application Delayed", clientVisible: true, reasons: issues.applicationDelayed },
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
          // The deliverable of an RCA is the account number itself — captured on
          // the matter, so the figures request has something to quote.
          { key: "account_number_issued", name: "Account Number Issued", clientVisible: true, ownerRole: "staff_delivery" },
          { key: "account_details_sent", name: "Account Details Sent to Client", clientVisible: true, ownerRole: "staff_delivery" },
        ],
      },
      OFFBOARDING,
    ],
    terminal: TERMINAL,
  };
}

/** RCF — gets the figures from an open account. */
export function buildRcf(municipality: string, councilName: string, short: string): Pipeline {
  const issues = ISSUES_BY_COUNCIL[municipality] ?? COUNCIL_ISSUES;
  return {
    serviceCode: "PRC",
    municipality,
    subtype: "RCF",
    label: `${councilName} — Rates Clearance Figures (Memo)`,
    prePhase: PRE_PHASE,
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
          { key: "escalated_with_council", name: `Escalated with ${short}`, clientVisible: false, ownerRole: "staff_ops", waitingOn: "council" },
          { key: "pending_council_decision", name: `Pending ${short} Decision`, clientVisible: true, ownerRole: "staff_ops", waitingOn: "council" },
          {
            key: "council_decision",
            name: `${short} Decision`,
            clientVisible: true,
            ownerRole: "staff_ops",
            outcomes: [
              { key: "memo_approved", label: "Memo Approved", clientVisible: true },
              { key: "memo_delayed", label: "Memo Delayed", clientVisible: true, reasons: issues.figuresDelayed },
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
      OFFBOARDING,
    ],
    terminal: TERMINAL,
  };
}

/** RCC — gets the certificate, once the figures are settled. */
export function buildRcc(municipality: string, councilName: string, short: string): Pipeline {
  const issues = ISSUES_BY_COUNCIL[municipality] ?? COUNCIL_ISSUES;
  return {
    serviceCode: "PRC",
    municipality,
    subtype: "RCC",
    label: `${councilName} — Rates Clearance Certificate`,
    prePhase: PRE_PHASE,
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
          { key: "escalated_with_council", name: `Escalated with ${short}`, clientVisible: false, ownerRole: "staff_ops", waitingOn: "council" },
          { key: "pending_council_decision", name: `Pending ${short} Decision`, clientVisible: true, ownerRole: "staff_ops", waitingOn: "council" },
          {
            key: "council_decision",
            name: `${short} Decision`,
            clientVisible: true,
            ownerRole: "staff_ops",
            outcomes: [
              { key: "certificate_approved", label: "Certificate Approved", clientVisible: true },
              { key: "certificate_delayed", label: "Certificate Delayed", clientVisible: true, reasons: issues.certificateRejected },
              { key: "certificate_rejected", label: "Certificate Rejected", clientVisible: true, reasons: issues.certificateRejected },
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
      OFFBOARDING,
    ],
    terminal: TERMINAL,
  };
}

/**
 * Everything ConveyClear runs at a council that is not COT.
 *
 * COT keeps its four transcribed files; these are the derived ones.
 */
export function buildCouncilPipelines(municipality: string, councilName: string, short: string): Pipeline[] {
  return [
    buildCoo(municipality, councilName),
    buildRca(municipality, councilName, short),
    buildRcf(municipality, councilName, short),
    buildRcc(municipality, councilName, short),
  ];
}
