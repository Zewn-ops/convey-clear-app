// ConveyClear — pipeline (phase/stage) definitions as typed config.
// SOURCE OF TRUTH for the CRM pipeline trees. One Pipeline per
// (service, municipality[, subtype]). The matter row stores only its POSITION
// (current_phase key, current_stage key, + outcome/reason in service_data);
// the tree itself lives here so it is type-safe, code-reviewed, and needs no
// migration to tweak a stage.
//
// Visibility model (Vision Board 2026-06-22): clientVisible=true → shown to the
// client/partner AND drives a client notification (orange). false → admin-only,
// staff notification only (blue).

export type PipelineOwnerRole = "staff_services" | "staff_ops" | "staff_delivery" | "admin";

// A single selectable reason under a branching outcome (the "or" fields), e.g.
// a delayed memo's reason = Estimated readings | Billing | Pending Journals | …
export interface StageReason {
  key: string;
  label: string;
}

// A branching outcome of a decision stage (e.g. Memo Approved / Delayed / Rejected).
export interface StageOutcome {
  key: string;
  label: string;
  clientVisible: boolean;
  reasons?: StageReason[]; // one-of, when this outcome needs a reason
}

export interface PipelineStage {
  key: string;
  name: string;
  clientVisible: boolean;     // orange = client+admin · false = admin-only (blue)
  ownerRole?: PipelineOwnerRole;
  // Who the matter is actually blocked on while it sits here. Absent means US —
  // ConveyClear has the next move. Set it ONLY where the stage unambiguously
  // means "submitted / escalated, now waiting for the council to respond".
  //
  // ownerRole cannot answer this: every stage has a staff owner, including the
  // ones where that staff member is doing nothing but waiting. The distinction
  // drives the admin queue split (DESIGN.md: orange = we are the blocker, amber
  // = the council is), and it is the difference between a work list and a list.
  //
  // Deliberately conservative: anything unmarked counts as ours. Over-surfacing
  // work is recoverable; silently parking a matter as "waiting" is not.
  waitingOn?: "council";
  // When set, this stage is a DECISION POINT — staff pick one outcome, and some
  // outcomes require a one-of reason. Stored on the matter as
  // service_data.stage_outcome / service_data.stage_reason.
  outcomes?: StageOutcome[];
}

export interface PipelinePhase {
  key: string;
  internalName: string;       // admin-facing phase name (e.g. "Operations")
  clientName?: string;        // client-facing alias (e.g. "COO in Progress")
  clientVisible: boolean;     // whether the phase header itself shows to the client
  stages: PipelineStage[];
}

export interface Pipeline {
  serviceCode: string;        // "COO" | "PRC"
  municipality: string;       // "COT"
  /**
   * True for the GENERIC fallback (see buildDefaultPipeline). A matter running
   * one of these is not on a mapped process — it is on a four-step placeholder
   * so that staff can still move it, report on it and show a client where it is.
   *
   * 🔒 Staff-only signal. Zewn, 2026-09-01: "make a note saying its a default
   * pipeline so that only conveyclear members can see the note and not attorneys
   * or clients." A client being told their matter is on a default pipeline
   * learns only that we have not built theirs yet.
   */
  isDefault?: boolean;
  subtype?: string;           // "RCA" | "RCF" | "RCC" (PRC stages, 072)
  label: string;              // human label e.g. "City of Tshwane — Change of Ownership"
  prePhase: { key: string; name: string };               // "New Instruction"
  phases: PipelinePhase[];
  terminal: { key: string; name: string; clientVisible: boolean }; // "Successful"
}

// The client-facing name of a phase (falls back to the internal name).
export function phaseClientName(p: PipelinePhase): string {
  return p.clientName ?? p.internalName;
}
