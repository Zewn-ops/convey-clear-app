import type { Pipeline } from "@/lib/pipelines";
import { phaseOrder } from "@/lib/pipelines";

/**
 * The two stop-gates agreed at Portal Bi-Weekly Meeting 2 (2026-08-06).
 *
 * Both are "you may create it incomplete, you may not advance it incomplete".
 * That shape was chosen deliberately over refusing the create: a transfer is
 * opened when a seller lists, which is before there is a buyer to name, and a
 * matter is often opened off a phone call before the file exists. Refusing the
 * create would mean staff keep that work outside the portal until it is tidy,
 * which is exactly how the portal stops being the system of record.
 */

/**
 * Services whose matters cannot progress without a property transfer.
 *
 * ⚠️ Deliberately NOT every service. Business Compliance, Trading Licences,
 * Fire Safety, Hawkers and Liquor never involve a property transaction, so a
 * blanket rule would make those service lines impossible to run. `PRC` is the
 * service code for Property Rates Clearance (stages RCA/RCF/RCC; renamed from
 * `RCF` by 072, which separated the umbrella from the stage of the same name).
 */
export const TRANSFER_GATED_SERVICES = ["COO", "PRC"] as const;

export function requiresTransfer(serviceCode?: string | null): boolean {
  const code = (serviceCode ?? "").toUpperCase();
  return (TRANSFER_GATED_SERVICES as readonly string[]).includes(code);
}

/**
 * Why this matter may not move, or null if it may.
 *
 * A gated matter with no transfer may sit on the pre-phase and go nowhere else.
 * Stages are only defined inside real phases (`flattenStages` never walks the
 * pre-phase or terminal), so selecting ANY stage is by definition progression.
 *
 * Reverting is not blocked — only forward movement. A matter that somehow got
 * ahead of its transfer must be able to come back, or the gate traps it.
 */
export function matterProgressBlockedReason(args: {
  pipeline: Pipeline | null;
  serviceCode?: string | null;
  transferId?: string | null;
  target: { phaseKey?: string | null; stageKey?: string | null };
}): string | null {
  const { pipeline, serviceCode, transferId, target } = args;
  if (!requiresTransfer(serviceCode)) return null;
  if (transferId) return null;

  const movingToStage = !!target.stageKey;
  // phaseOrder returns 0 for the pre-phase, -1 for a key this pipeline doesn't
  // define. An unknown key is treated as not-progression rather than guessed at.
  const phaseIndex = pipeline && target.phaseKey ? phaseOrder(pipeline, target.phaseKey) : -1;
  const movingPastPrePhase = phaseIndex > 0;

  if (!movingToStage && !movingPastPrePhase) return null;

  return "Link a property transfer before progressing this matter.";
}

/**
 * Parties a transfer must carry before it can leave `open`.
 *
 * Decision, Meeting 2: mandatory means a FULL CLIENT RECORD, never a loose
 * name — so the check below counts linked rows only. `transfer_parties` has
 * carried `client_id`/`firm_id` on every new party since 2026-08-06 (a capture
 * creates a real client), but rows written before that may still be inline, and
 * those must not satisfy the gate.
 */
export const TRANSFER_REQUIRED_ROLES = [
  { role: "seller", label: "seller" },
  { role: "buyer", label: "buyer" },
  { role: "conveyancing_attorney", label: "conveyancing attorney" },
] as const;

export interface TransferPartyRow {
  role: string;
  client_id: string | null;
  firm_id: string | null;
}

/** Roles still missing a linked record. Empty array = the transfer may progress. */
export function missingTransferRoles(parties: TransferPartyRow[]): string[] {
  return TRANSFER_REQUIRED_ROLES.filter(
    ({ role }) => !parties.some((p) => p.role === role && (p.client_id || p.firm_id))
  ).map(({ label }) => label);
}

/**
 * Why this transfer may not be marked registered, or null if it may.
 *
 * Only `registered` is gated. Cancelling or putting a transfer on hold must
 * stay available precisely when the file is incomplete — that is often WHY it
 * is being cancelled.
 */
export function transferProgressBlockedReason(
  targetStatus: string,
  parties: TransferPartyRow[]
): string | null {
  if (targetStatus !== "registered") return null;
  const missing = missingTransferRoles(parties);
  if (missing.length === 0) return null;
  const list =
    missing.length === 1
      ? missing[0]
      : `${missing.slice(0, -1).join(", ")} and ${missing[missing.length - 1]}`;
  return `This transfer needs a linked ${list} before it can be registered.`;
}
