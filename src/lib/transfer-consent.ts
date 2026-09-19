import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * POPIA consent on a property transfer (101).
 *
 * Consent is given ONCE on the transaction and covers every matter opened under
 * it — the COO, the rates clearance, the building plans, the refund. Zewn,
 * 2026-09-19: *"make it part of the property transfer and state that it is
 * therefore giving us POPIA consent for any matters related to that transfer."*
 *
 * ── WHAT IS ACTUALLY BEING RECORDED ────────────────────────────────────────
 *
 * Not the data subject's consent. The ATTORNEY'S WARRANTY that the firm holds
 * it, per named party, under its mandate. POPIA consent has to come from the
 * person whose information it is, and a transfer has at least two of those; what
 * a conveyancer can honestly give us is "I hold M. Dlamini's consent", which is
 * a claim with a name and a date attached to it.
 *
 * That is why this is per party and not one flag on the transfer. "This transfer
 * has consent" identifies nobody and can be true and useless at the same time —
 * it would go green on a transaction where the buyer had never been asked.
 *
 * ── WHICH PARTIES COUNT ────────────────────────────────────────────────────
 *
 * Only the ones whose personal information we actually process: the SELLER and
 * the BUYER. The conveyancing attorney, the bond attorney and the estate agent
 * are acting in a professional capacity on the transaction — they are not the
 * data subjects the consent is about, and requiring a POPIA tick from the firm
 * instructing us would be theatre.
 *
 * A transfer with no seller or buyer captured yet is NOT consented, and says so
 * as "no parties captured" rather than showing a satisfied gate. An empty
 * requirement list that reports success is the failure mode this project has hit
 * three times: the query found nothing and the screen said there was nothing to
 * find.
 */

/** Roles whose personal information this consent is about. */
export const CONSENT_REQUIRED_ROLES = ["seller", "buyer"] as const;

export interface ConsentPartyRow {
  id: string;
  role: string;
  /** Display name already resolved by the caller (client record or inline capture). */
  name: string;
}

export interface TransferConsentRow {
  transfer_party_id: string | null;
  party_name: string;
  party_role: string;
  granted: boolean;
  created_at: string;
  attested_by: string | null;
  evidence_document_id: string | null;
}

export interface ConsentPartyStatus {
  partyId: string;
  name: string;
  role: string;
  granted: boolean;
  /** The attestation currently in force, if any. */
  at: string | null;
  evidenceDocumentId: string | null;
}

export interface TransferConsentStatus {
  /** One entry per party the consent must cover, in seller-then-buyer order. */
  parties: ConsentPartyStatus[];
  /** Names still missing an attestation. */
  missing: string[];
  /** True only when every required party is covered AND there is at least one. */
  complete: boolean;
  /** No seller or buyer on the transfer yet — nothing to consent to. */
  noParties: boolean;
}

/**
 * Current consent position for a transfer.
 *
 * Rows are APPEND-ONLY (101), so the newest row per party is the position and
 * everything older is history. A withdrawal is a newer row with granted=false,
 * which is why this cannot simply look for the existence of a granted row.
 */
export function transferConsentStatus(
  parties: ConsentPartyRow[],
  rows: TransferConsentRow[]
): TransferConsentStatus {
  const required = parties.filter((p) =>
    (CONSENT_REQUIRED_ROLES as readonly string[]).includes(p.role)
  );

  // Newest first, so the first row seen for a party is the one in force.
  const newestFirst = [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at));

  const statuses: ConsentPartyStatus[] = required.map((p) => {
    const current = newestFirst.find((r) => r.transfer_party_id === p.id);
    return {
      partyId: p.id,
      name: p.name,
      role: p.role,
      granted: Boolean(current?.granted),
      at: current?.created_at ?? null,
      evidenceDocumentId: current?.evidence_document_id ?? null,
    };
  });

  // Seller before buyer, matching how every other surface on the transfer
  // orders them, rather than however the rows happened to come back.
  statuses.sort(
    (a, b) =>
      CONSENT_REQUIRED_ROLES.indexOf(a.role as (typeof CONSENT_REQUIRED_ROLES)[number]) -
      CONSENT_REQUIRED_ROLES.indexOf(b.role as (typeof CONSENT_REQUIRED_ROLES)[number])
  );

  const missing = statuses.filter((s) => !s.granted).map((s) => s.name);

  return {
    parties: statuses,
    missing,
    // ⚠️ `statuses.length > 0` is load-bearing. Without it a transfer with no
    // seller and no buyer returns complete=true, because "every required party
    // is covered" is vacuously true of an empty list — and the gate would open
    // on precisely the transaction we know least about.
    complete: statuses.length > 0 && missing.length === 0,
    noParties: statuses.length === 0,
  };
}

/**
 * Why ConveyClear may not work this transaction yet, or null if it may.
 *
 * The gate Zewn asked for: *"prevent ConveyClear from moving forward"*. It bites
 * when a matter is TAKEN ON and on every forward phase or stage move under the
 * transfer — not on the firm's own set-up, which stays open so a transaction can
 * be assembled before consent comes back.
 *
 * Reverting is never blocked, for the same reason the transfer gate does not
 * block it: a matter that got ahead of its consent must be able to come back, or
 * the gate traps the work instead of stopping it.
 */
export function consentBlockedReason(status: TransferConsentStatus): string | null {
  if (status.noParties) {
    return "Capture the seller and buyer, then record POPIA consent, before working this transaction.";
  }
  if (!status.complete) {
    const who = status.missing.join(" and ");
    return `POPIA consent is outstanding for ${who}. It is needed before ConveyClear can work any matter on this transaction.`;
  }
  return null;
}

/**
 * Consent position for the transfer behind a matter, for the gates.
 *
 * Returns null when the matter has no transfer — there is then no transaction
 * consent to check, and a standalone matter must not be blocked by the absence
 * of something that cannot exist.
 *
 * ⚠️ READ WITH A CLIENT THAT CAN SEE BOTH TABLES. Called from staff paths with
 * the service role or a staff session; a partner-scoped client would return no
 * parties and report "not consented" for a transaction the firm has properly
 * consented, turning an RLS gap into a work stoppage.
 */
export async function transferConsentForMatter(
  db: SupabaseClient,
  transferId: string | null | undefined
): Promise<TransferConsentStatus | null> {
  if (!transferId) return null;

  const [{ data: partyRows }, { data: consentRows }] = await Promise.all([
    db.from("transfer_parties").select("id, role, full_name, business_name, clients(full_name, business_name)").eq("transfer_id", transferId),
    db
      .from("transfer_consents")
      .select("transfer_party_id, party_name, party_role, granted, created_at, attested_by, evidence_document_id")
      .eq("transfer_id", transferId),
  ]);

  type Raw = {
    id: string;
    role: string;
    full_name: string | null;
    business_name: string | null;
    clients?: { full_name: string | null; business_name: string | null } | null;
  };

  // `as unknown as` because supabase-js types an embedded relation as an ARRAY
  // even where the FK makes it at most one row. The runtime shape is the object.
  const parties = ((partyRows ?? []) as unknown as Raw[]).map((r) => ({
    id: r.id,
    role: r.role,
    who:
      r.clients?.business_name?.trim() ||
      r.clients?.full_name?.trim() ||
      r.business_name?.trim() ||
      r.full_name?.trim() ||
      "Unnamed party",
  }));

  return transferConsentStatus(
    parties.map((p) => ({ id: p.id, role: p.role, name: p.who })),
    (consentRows ?? []) as TransferConsentRow[]
  );
}
