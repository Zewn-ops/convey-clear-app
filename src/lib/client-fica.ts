import type { ClientDocument } from "@/types";

// What a client's FICA vault SHOULD hold, by entity type — so the vault can show
// what is missing, not just what happens to be there.
//
// Mirrors the per-party rules the matter intake already uses (`cooPartyDocs` in
// lib/coo-docs.ts): certified ID always; COR 14.3 for a business; letter of
// authority for a trust. Kept as its own module because the vault is
// CLIENT-scoped — there is no party role and no municipality here.

export type VaultEntity = "natural_person" | "business" | "trust";

export interface VaultDocRule {
  docType: string;
  /** Not required — captured when available, never counts against completeness. */
  optional?: boolean;
  /** Why it's asked for. Shown under the slot when empty. */
  hint?: string;
  /** Typical validity in months. Drives the suggested expiry date on upload. */
  validMonths?: number;
}

/** The documents this client is expected to have on file. */
export function vaultDocRules(entity: string | null | undefined): VaultDocRule[] {
  const e = (entity ?? "natural_person") as VaultEntity;

  const rules: VaultDocRule[] = [
    { docType: "id_certified", hint: "Certified copy of the ID document" },
  ];

  if (e === "business") {
    rules.push({ docType: "cor_14_3", hint: "CIPC registration certificate" });
    rules.push({ docType: "cipc_docs", optional: true });
  } else if (e === "trust") {
    rules.push({ docType: "letter_of_authority", hint: "Issued by the Master of the High Court" });
  }

  rules.push(
    { docType: "proof_of_address", optional: true, validMonths: 3, hint: "Usually accepted for 3 months" },
    { docType: "poa", optional: true, hint: "Power of attorney, where someone signs on the client's behalf" },
    { docType: "tax_clearance", optional: true, validMonths: 12 }
  );

  return rules;
}

/** Every type the vault will offer, including the ones not expected for this entity. */
export function allVaultDocTypes(): string[] {
  return [
    "id_certified",
    "cor_14_3",
    "letter_of_authority",
    "cipc_docs",
    "proof_of_address",
    "poa",
    "tax_clearance",
    "other",
  ];
}

export type ExpiryState = "none" | "valid" | "expiring" | "expired";

/** Expiring = inside 30 days. FICA renewals are not same-day, so warn early. */
export function expiryState(expiry: string | null | undefined, now = new Date()): ExpiryState {
  if (!expiry) return "none";
  const end = new Date(`${expiry}T00:00:00`);
  if (Number.isNaN(end.getTime())) return "none";
  const days = Math.floor((end.getTime() - now.getTime()) / 86_400_000);
  if (days < 0) return "expired";
  if (days <= 30) return "expiring";
  return "valid";
}

export function daysUntil(expiry: string, now = new Date()): number {
  return Math.floor((new Date(`${expiry}T00:00:00`).getTime() - now.getTime()) / 86_400_000);
}

/** A suggested expiry, when the type has a typical validity. Staff can override. */
export function suggestedExpiry(docType: string, entity?: string | null): string | null {
  const rule = vaultDocRules(entity).find((r) => r.docType === docType);
  if (!rule?.validMonths) return null;
  const d = new Date();
  d.setMonth(d.getMonth() + rule.validMonths);
  return d.toISOString().slice(0, 10);
}

export interface VaultSlot {
  rule: VaultDocRule;
  /** Every current document of this type — a business may hold one ID per director. */
  docs: ClientDocument[];
}

export interface VaultSummary {
  slots: VaultSlot[];
  /** Documents on file whose type isn't expected for this entity. */
  extras: ClientDocument[];
  requiredTotal: number;
  requiredHeld: number;
  /** Current documents that are expired or expiring — the thing worth chasing. */
  attention: ClientDocument[];
  complete: boolean;
}

/**
 * Fold the client's documents against the rules for their entity type.
 * Only `current` documents count — superseded and archived ones are history.
 */
export function summariseVault(
  entity: string | null | undefined,
  docs: ClientDocument[]
): VaultSummary {
  const current = docs.filter((d) => (d.status ?? "current") === "current");
  const rules = vaultDocRules(entity);
  const ruleTypes = new Set(rules.map((r) => r.docType));

  const slots: VaultSlot[] = rules.map((rule) => ({
    rule,
    docs: current.filter((d) => d.document_type === rule.docType),
  }));

  const extras = current.filter((d) => !ruleTypes.has(d.document_type));

  const required = slots.filter((s) => !s.rule.optional);
  const requiredHeld = required.filter((s) => s.docs.length > 0).length;

  const attention = current.filter((d) => {
    const s = expiryState(d.expiry_date);
    return s === "expired" || s === "expiring";
  });

  return {
    slots,
    extras,
    requiredTotal: required.length,
    requiredHeld,
    attention,
    complete: requiredHeld === required.length,
  };
}
