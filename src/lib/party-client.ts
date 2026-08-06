import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Turning a captured party into a real client record.
 *
 * Zewn's decision, 2026-08-06: buyer and seller — and attorneys and estate
 * agents — must EACH be a real client record, created automatically when there
 * is not one already. The old inline capture wrote names and contact details
 * onto the party row itself, which is what the UI was honestly labelling
 * "captured, not a client record": no FICA vault, no login, no reuse across
 * matters.
 *
 * ⚠️ Every lookup here runs under the CALLER's RLS, deliberately.
 * Deduplicating against records the caller cannot see would need the service
 * role, and linking a party to an invisible client record would then render
 * that record's name, email and cell straight back onto the party card — an
 * information leak dressed up as convenience. A duplicate client record is
 * recoverable by merging; a leak is not. So: staff dedupe against everything
 * they can see, a partner firm dedupes against its own, and the worst case is
 * a duplicate rather than a disclosure.
 */

export type PartyIdentity = {
  entityType: "natural_person" | "business" | "trust";
  fullName?: string | null;
  businessName?: string | null;
  idNumber?: string | null;
  registrationNo?: string | null;
  email?: string | null;
  cell?: string | null;
  physicalAddress?: string | null;
};

export type FindOrCreateResult =
  | { ok: true; clientId: string; created: boolean }
  | { ok: false; error: string };

const clean = (v: string | null | undefined) => {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
};

/**
 * Find an existing client for this identity, or create one.
 *
 * Match order is strongest-first: a government ID or a registration number
 * identifies a legal person, an email address only identifies an inbox. Matching
 * on email alone would merge a husband and wife sharing an address into one
 * client record, so it is the last resort rather than the first.
 */
export async function findOrCreateClientForParty(
  supabase: SupabaseClient,
  identity: PartyIdentity,
  opts: {
    /**
     * Restrict matching to one firm's own clients, and stamp a newly created
     * record with that firm.
     *
     * Required whenever the SERVICE ROLE is doing the lookup on behalf of a
     * partner firm — the partner-referral route has no caller-scoped client, so
     * without this the deduplicator would happily match another firm's client
     * and render their name, email and cell onto the referring firm's party
     * card. Staff paths pass nothing, because staff can see everything anyway.
     */
    scopeToFirmId?: string | null;
  } = {}
): Promise<FindOrCreateResult> {
  const entityType = identity.entityType;
  const fullName = clean(identity.fullName);
  const businessName = clean(identity.businessName);
  const idNumber = clean(identity.idNumber);
  const registrationNo = clean(identity.registrationNo);
  const email = clean(identity.email);
  const cell = clean(identity.cell);
  const physicalAddress = clean(identity.physicalAddress);

  // chk_client_identifier: a person needs full_name, a business or trust needs
  // business_name. Checked here so the caller gets a sentence, not a 23514.
  if (entityType === "natural_person" ? !fullName : !businessName) {
    return { ok: false, error: "A name is required to create a client record." };
  }

  const firmId = opts.scopeToFirmId ?? null;

  const tryMatch = async (column: string, value: string) => {
    let q = supabase.from("clients").select("id").eq(column, value);
    if (firmId) q = q.eq("business_partner_id", firmId);
    const { data } = await q.limit(1).maybeSingle();
    return (data as { id: string } | null)?.id ?? null;
  };

  let existing: string | null = null;
  if (entityType === "natural_person" && idNumber) existing = await tryMatch("id_number", idNumber);
  if (!existing && entityType !== "natural_person" && registrationNo) {
    existing = await tryMatch("registration_no", registrationNo);
  }
  if (!existing && email) existing = await tryMatch("primary_email", email);
  if (existing) return { ok: true, clientId: existing, created: false };

  const { data, error } = await supabase
    .from("clients")
    .insert({
      entity_type: entityType,
      full_name: entityType === "natural_person" ? fullName : null,
      business_name: entityType === "natural_person" ? null : businessName,
      id_number: idNumber,
      registration_no: registrationNo,
      primary_email: email,
      primary_cell: cell,
      physical_address: physicalAddress,
      // Stamped so the next referral from the same firm deduplicates against it
      // rather than creating a second copy on every matter.
      ...(firmId ? { business_partner_id: firmId } : {}),
    })
    .select("id")
    .single();

  if (error) {
    // RLS refusing the insert surfaces as 42501, not a 403.
    if (error.code === "42501") {
      return { ok: false, error: "You cannot create client records here." };
    }
    return { ok: false, error: error.message };
  }
  return { ok: true, clientId: (data as { id: string }).id, created: true };
}
