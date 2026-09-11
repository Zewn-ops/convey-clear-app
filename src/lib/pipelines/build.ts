import type { Pipeline, StageOutcome, StageReason } from "./types";

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

/**
 * Offboarding is BILLING, and it is the same three steps for every service at
 * every council.
 *
 * Jukka's process map ("Map Process Services Breakdown", read 2026-09-11) writes
 * Phase 5 identically under all six City of Tshwane services: Invoice Issued,
 * Payment outstanding, Payment received. It replaces "Discuss Matter with
 * Client / Matter Resolved", which described talking to the client rather than
 * getting paid, and it takes invoicing OUT of Client Delivery — where
 * `invoice_sent` and `proof_of_payment_received` used to sit, so that phase
 * could not complete until the money had.
 *
 * Applied to the derived CoE and CoJ pipelines too, though the map is headed
 * City of Tshwane: raising an invoice and being paid for it is ConveyClear's own
 * process, and no council has a say in it. Everything in this file that IS the
 * council's stays council-scoped.
 */
const OFFBOARDING = {
  key: "offboarding",
  internalName: "Offboarding",
  clientVisible: false,
  stages: [
    { key: "invoice_issued", name: "Invoice Issued", clientVisible: true, ownerRole: "staff_delivery" as const },
    { key: "payment_outstanding", name: "Payment Outstanding", clientVisible: true, ownerRole: "staff_delivery" as const },
    { key: "payment_received", name: "Payment Received", clientVisible: true, ownerRole: "staff_delivery" as const },
  ],
};

/**
 * Why a clearance sits with the council and cannot move — City of Tshwane.
 *
 * Jukka's map lists these five under "Clearance Blocked" identically for RCA,
 * RCF and RCC. They overlap the handwritten sheets' vocabulary (COUNCIL_ISSUES
 * above, §2.2, confirmed by Zewn 2026-09-01) without matching it:
 *
 *   map                        sheet
 *   Pending Approval           —
 *   Billing Cycle Relapse      Billing
 *   Pending Journal Adjustment Outstanding journals
 *   Estimated Readings         Estimated readings
 *   Unallocated Credit         —
 *   —                          Wrong account
 *   —                          Mistake on application
 *
 * Two keys are deliberately REUSED rather than renamed — pending_journals and
 * estimated_readings — because they mean the same thing in both lists and a
 * matter that stored one of them still renders. The three the map does not carry
 * are not deleted from COUNCIL_ISSUES: that vocabulary still drives the decision
 * stages, and a reason already recorded against a matter must not become an
 * unresolvable key.
 *
 * ✅ ANSWERED, Zewn 2026-09-11: BOTH LISTS STAY, and they stay because they
 *   answer two different questions. "one option is we are waiting for council to
 *   respond or something and the other is what the council decided from it."
 *
 *     Clearance Blocked  → why we are WAITING on the council (this list)
 *     COT Decision       → what the council DECIDED (COUNCIL_ISSUES, above)
 *
 *   Nothing is deleted, so no reason already recorded against a matter becomes
 *   an unresolvable key. The stage names below carry the split so it reads off
 *   the screen instead of needing this comment.
 */
export const COT_CLEARANCE_BLOCKERS: StageOutcome[] = [
  { key: "pending_approval", label: "Pending approval", clientVisible: true },
  { key: "billing_cycle_relapse", label: "Billing cycle relapse", clientVisible: true },
  { key: "pending_journals", label: "Pending journal adjustment", clientVisible: true },
  { key: "estimated_readings", label: "Estimated readings", clientVisible: true },
  { key: "unallocated_credit", label: "Unallocated credit", clientVisible: true },
];

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
          // Invoicing lives in OFFBOARDING now, for every council — see the
          // note on that constant. It used to sit here as well, which would
          // have billed the client twice on the rail the moment Offboarding
          // became the billing phase.
          { key: "welcome_letter_uploaded", name: "Welcome Letter Uploaded", clientVisible: true, ownerRole: "staff_delivery" },
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
          // An RCA ends with figures, at every council. Zewn, 2026-09-11: "RCA
          // does end with figures. once we have gotten through the application
          // we then get the figures." Applied to the derived councils for the
          // same reason Offboarding was — §5.15 treats the three as one process
          // with per-council issue lists, and an RCA that ended differently at
          // CoE than at COT would be a divergence nobody asked for.
          //
          // The account number is still recorded: `account_opened` is an outcome
          // of the decision stage above, which is where the council's answer
          // belongs. Delivery is what we hand over.
          { key: "figures_issued", name: "Rates Clearance Figures Issued", clientVisible: true, ownerRole: "staff_delivery" },
          { key: "figures_uploaded", name: "Rates Clearance Figures Uploaded", clientVisible: true, ownerRole: "staff_delivery" },
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

/**
 * The GENERIC four-step pipeline, used for any (service, council) with no
 * definition of its own.
 *
 * Zewn, 2026-09-01: "please can we try and create a general very basic 4 step
 * pipeline for anything that doesnt have a pre-existing pipeline built in
 * already."
 *
 * WHAT IT FIXES. Twelve pipelines now exist and they cover COO and the three
 * rates-clearance stages at three councils. Everything else — EBP, COC, MAD, REF
 * and OTHER, at every council — resolved to null, and a null pipeline is not a
 * neutral state: the matter reports "No pipeline configured", draws no progress
 * circles anywhere, cannot be advanced, and reads to a client as though nothing
 * is happening. A placeholder that says "received → with the council → back from
 * the council → done" is true of all of them, and is the difference between a
 * matter that looks unstarted and one that looks in progress.
 *
 * DELIBERATELY SHALLOW. Four phases, one or two stages each, no decision
 * outcomes and no failure vocabulary. Guessing at a service's real stages would
 * put words in the council's mouth; this claims only what is true of any council
 * request. When a service earns a real pipeline, add it to PIPELINES and it wins
 * — nothing here has to be removed.
 *
 * 🔒 Marked `isDefault` so staff, and only staff, are told which matters are on
 * it. See the flag's note in ./types.
 */
export function buildDefaultPipeline(serviceCode: string, municipality: string): Pipeline {
  const council = municipality.toUpperCase();
  // "the council" rather than its name: this pipeline is the one used where we
  // have not mapped the council's own process, so naming it would imply we had.
  return {
    serviceCode: serviceCode.toUpperCase(),
    municipality: council,
    isDefault: true,
    label: "General process",
    prePhase: PRE_PHASE,
    phases: [
      {
        key: "onboarding",
        internalName: "Onboarding",
        clientName: "Request Received",
        clientVisible: true,
        stages: [
          { key: "documents_received", name: "Documents Received", clientVisible: true, ownerRole: "staff_services" },
          { key: "documents_verified", name: "Documents Verified", clientVisible: true, ownerRole: "staff_services" },
        ],
      },
      {
        key: "operations",
        internalName: "Operations",
        clientName: "With the Council",
        clientVisible: true,
        stages: [
          { key: "submitted", name: "Submitted to the council", clientVisible: true, ownerRole: "staff_ops", waitingOn: "council" },
          { key: "pending_council", name: "Pending the council", clientVisible: true, ownerRole: "staff_ops", waitingOn: "council" },
        ],
      },
      {
        key: "client_delivery",
        internalName: "Client Delivery",
        clientVisible: false,
        stages: [
          { key: "outcome_received", name: "Outcome Received", clientVisible: true, ownerRole: "staff_delivery" },
          { key: "delivered_to_client", name: "Delivered to Client", clientVisible: true, ownerRole: "staff_delivery" },
        ],
      },
      OFFBOARDING,
    ],
    terminal: TERMINAL,
  };
}
