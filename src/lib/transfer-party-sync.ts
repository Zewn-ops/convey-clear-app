import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Keeps `property_transfers`' denormalised party columns and `transfer_parties`
 * rows saying the same thing.
 *
 * WHY THIS EXISTS
 *   `026` gave a transfer four scattered FKs — seller_client_id, buyer_client_id,
 *   business_partner_id, estate_agent_partner_id. `050` then introduced
 *   `transfer_parties`, a proper per-role table, *beside* them without ever
 *   making one the source of truth. Every surface then picked a side:
 *
 *     Edit / New transfer form  →  writes the four columns
 *     Parties card + the gate   →  read transfer_parties
 *
 *   So a transfer could show "Attorney firm: Sterling & Hayes" in its detail
 *   card while the parties card said "Not linked" four times, and
 *   `transferProgressBlockedReason()` refused to register it for want of
 *   parties it was already displaying. Reported 2026-08-11.
 *
 * WHY NOT JUST COLLAPSE THE TWO
 *   `business_partner_id` **is the partner RLS scope** (`026:42`) — it is what
 *   grants an attorney firm sight of the transfer and every matter under it.
 *   It cannot become a derived value, so the columns stay and this syncs them.
 *
 * SCOPE — deliberately only the four roles the columns can represent.
 *   `bond_attorney`, `cancellation_attorney`, `other` and every inline capture
 *   are never read or written here. A transfer can hold a bond attorney and a
 *   cancellation attorney at once; the columns cannot express that, so anything
 *   they cannot express is none of this file's business.
 */

type LinkKind = "client" | "firm";

interface RoleMapping {
  role: string;
  /** The `property_transfers` column holding the same fact. */
  column: "seller_client_id" | "buyer_client_id" | "business_partner_id" | "estate_agent_partner_id";
  /** Which `transfer_parties` FK the value lands in. */
  kind: LinkKind;
}

export const SYNCED_PARTY_ROLES: readonly RoleMapping[] = [
  { role: "seller", column: "seller_client_id", kind: "client" },
  { role: "buyer", column: "buyer_client_id", kind: "client" },
  { role: "conveyancing_attorney", column: "business_partner_id", kind: "firm" },
  { role: "estate_agent", column: "estate_agent_partner_id", kind: "firm" },
] as const;

export type SyncedRole = (typeof SYNCED_PARTY_ROLES)[number]["role"];

/** The four columns as the transfer routes already shape them. */
export interface TransferPartyColumns {
  seller_client_id?: string | null;
  buyer_client_id?: string | null;
  business_partner_id?: string | null;
  estate_agent_partner_id?: string | null;
}

interface PartyRow {
  id: string;
  role: string;
  client_id: string | null;
  firm_id: string | null;
}

const linkColumn = (kind: LinkKind) => (kind === "client" ? "client_id" : "firm_id");

/** A party row that points at a real record, as opposed to an inline capture. */
const isLinked = (p: PartyRow) => Boolean(p.client_id || p.firm_id);

/**
 * Reconcile `transfer_parties` to match the four columns.
 *
 * Called AFTER the transfer row is written, with the values that were saved.
 * Reconciles to the target rather than diffing against the previous values, so
 * it also HEALS transfers already saved before this existed — of which staging
 * has several, and production will have more.
 *
 * Best-effort by design: a sync failure must not fail the save the user asked
 * for. The transfer is written either way; the worst case is the old behaviour.
 */
export async function syncPartiesFromTransfer(
  admin: SupabaseClient,
  transferId: string,
  saved: TransferPartyColumns
): Promise<void> {
  const { data, error } = await admin
    .from("transfer_parties")
    .select("id, role, client_id, firm_id")
    .eq("transfer_id", transferId);
  if (error) return;

  const parties = (data ?? []) as PartyRow[];

  for (const { role, column, kind } of SYNCED_PARTY_ROLES) {
    // `undefined` means the caller did not send this field — leave it alone.
    // `null` is an explicit clear and is handled below.
    if (!(column in saved)) continue;
    const target = saved[column] ?? null;
    const col = linkColumn(kind);
    const linked = parties.filter((p) => p.role === role && isLinked(p));

    if (target) {
      if (linked.some((p) => p[col] === target)) continue; // already correct

      if (linked.length === 1) {
        // Re-point the existing row rather than inserting a second one: seller
        // and buyer carry a one-per-transfer unique index, so an insert here
        // would be rejected and the party would silently stay wrong.
        await admin
          .from("transfer_parties")
          .update({ client_id: null, firm_id: null, [col]: target })
          .eq("id", linked[0].id);
      } else {
        await admin
          .from("transfer_parties")
          .insert({ transfer_id: transferId, role, [col]: target });
      }
      continue;
    }

    // Cleared. Only remove a row this column could actually have put there:
    // exactly one linked row for the role. If there are several — which the
    // schema allows for the two firm roles — the column cannot tell us which
    // one it meant, so removing any of them would be a guess. Leave them; the
    // parties card has a delete button per row and is unambiguous.
    if (linked.length === 1) {
      await admin.from("transfer_parties").delete().eq("id", linked[0].id);
    }
  }
}

/**
 * The reverse: a party was added or removed on the parties card, so bring the
 * matching column into line.
 *
 * ⚠️ STAFF ONLY, and the caller must enforce that. `business_partner_id` is the
 * partner RLS scope, so writing it from a partner-triggered action would let a
 * firm rewrite who can see a transfer — including revoking another firm. The
 * parties card is reachable by partners on transfers they already work, which
 * is exactly why this is gated on the caller rather than on RLS: the admin
 * client used below has no RLS to stop it.
 *
 * Best-effort, for the same reason as above.
 */
export async function syncTransferFromParty(
  admin: SupabaseClient,
  transferId: string,
  party: { role: string; client_id?: string | null; firm_id?: string | null },
  action: "added" | "removed"
): Promise<void> {
  const mapping = SYNCED_PARTY_ROLES.find((m) => m.role === party.role);
  if (!mapping) return; // bond attorney, cancellation attorney, other — not ours

  const value = mapping.kind === "client" ? party.client_id ?? null : party.firm_id ?? null;
  if (!value) return; // an inline capture has no record for the column to hold

  if (action === "added") {
    await admin.from("property_transfers").update({ [mapping.column]: value }).eq("id", transferId);
    return;
  }

  // Removed: only clear the column if it was pointing at THIS party. Another
  // row of the same role may still hold it, and clearing on a stale match would
  // revoke a firm's access to a transfer it still works.
  await admin
    .from("property_transfers")
    .update({ [mapping.column]: null })
    .eq("id", transferId)
    .eq(mapping.column, value);
}
