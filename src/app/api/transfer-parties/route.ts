import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { findOrCreateClientForParty } from "@/lib/party-client";
import { syncTransferFromParty } from "@/lib/transfer-party-sync";
import { notifyStaffNewClient } from "@/lib/notify";
import { STAFF_ROLES, type UserRole } from "@/types";

export const runtime = "nodejs";

/**
 * Is the signed-in caller staff?
 *
 * Only used to decide whether a party change may write back to the transfer's
 * denormalised columns. `business_partner_id` is the partner RLS scope, so a
 * partner-triggered write there could hand a firm access — or take another
 * firm's away. Partners may still add parties; their change simply does not
 * touch the columns. See lib/transfer-party-sync.ts.
 */
async function callerProfile(supabase: Awaited<ReturnType<typeof createClient>>, authId: string) {
  const { data } = await supabase
    .from("users")
    .select("role, business_partner_id")
    .eq("auth_user_id", authId)
    .maybeSingle();
  const role = (data?.role ?? null) as UserRole | null;
  return {
    role,
    firmId: (data?.business_partner_id ?? null) as string | null,
    isStaff: Boolean(role && STAFF_ROLES.includes(role)),
  };
}

async function callerIsStaff(supabase: Awaited<ReturnType<typeof createClient>>, authId: string) {
  return (await callerProfile(supabase, authId)).isStaff;
}

/**
 * Parties on a property transfer.
 *
 * Deliberately uses the CALLER's client, not the service role. RLS on
 * transfer_parties routes through can_access_transfer(), so a firm can only
 * touch parties on a transfer it already works — and there is no code path here
 * that could widen that by accident.
 */

const ROLES = [
  "seller",
  "buyer",
  "estate_agent",
  "conveyancing_attorney",
  "bond_attorney",
  "cancellation_attorney",
  "other",
] as const;
type Role = (typeof ROLES)[number];

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  if (!rateLimit(`transfer-parties:${clientIp(req)}`, 30, 60_000)) {
    return NextResponse.json({ error: "Too many requests. Try again shortly." }, { status: 429 });
  }

  let b: Record<string, unknown>;
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const transferId = typeof b.transferId === "string" ? b.transferId : null;
  const role = b.role as Role;
  if (!transferId) return NextResponse.json({ error: "transferId is required." }, { status: 400 });
  if (!ROLES.includes(role)) {
    return NextResponse.json({ error: `role must be one of: ${ROLES.join(", ")}.` }, { status: 400 });
  }

  const clientId = typeof b.clientId === "string" && b.clientId ? b.clientId : null;
  const firmId = typeof b.firmId === "string" && b.firmId ? b.firmId : null;

  // Read once, up here, because the capture branch below needs the caller's firm
  // to scope the client record it creates — 070's INSERT policy only accepts a
  // row stamped with the caller's own firm id. It was previously read after the
  // party insert, where only the write-back needed it.
  const me = await callerProfile(supabase, user.id);

  const row: Record<string, unknown> = { transfer_id: transferId, role };
  let createdClient: { id: string; name: string } | null = null;

  if (clientId && firmId) {
    return NextResponse.json(
      { error: "A party links to an entity or a firm, not both." },
      { status: 400 }
    );
  }

  if (clientId) {
    row.client_id = clientId;
  } else if (firmId) {
    row.firm_id = firmId;
    // 059 — the individual at the firm. One way or the other, never both: the
    // DB enforces that too (transfer_parties_contact_one_way), but refusing
    // here gives a sentence instead of a constraint name.
    const contactUserId = typeof b.contactUserId === "string" && b.contactUserId ? b.contactUserId : null;
    const contactName = typeof b.contactName === "string" ? b.contactName.trim() : "";
    if (contactUserId && contactName) {
      return NextResponse.json(
        { error: "Name the contact by picking their login or by typing a name, not both." },
        { status: 400 }
      );
    }
    if (contactUserId) row.contact_user_id = contactUserId;
    else if (contactName) row.contact_name = contactName;
  } else {
    // Capture. Since 2026-08-06 this no longer writes an inline party: a
    // captured party BECOMES a real client record, so it carries a FICA vault
    // and can be reused on the next matter. The inline columns stay on the
    // table for the rows created before this, and for the PATCH path.
    const entityType = b.entityType as string | undefined;
    const businessName = typeof b.businessName === "string" ? b.businessName.trim() : "";
    // A person's name arrives in halves now — ficaFields() requires both, and
    // splitting one field on a space gets "van der Merwe" wrong. `fullName` is
    // still what the rest of the portal displays, so it is composed here rather
    // than asked for twice.
    const firstName = typeof b.firstName === "string" ? b.firstName.trim() : "";
    const lastName = typeof b.lastName === "string" ? b.lastName.trim() : "";
    const fullName =
      [firstName, lastName].filter(Boolean).join(" ") ||
      (typeof b.fullName === "string" ? b.fullName.trim() : "");

    if (!entityType || !["natural_person", "business", "trust"].includes(entityType)) {
      return NextResponse.json({ error: "Pick a person, business or trust." }, { status: 400 });
    }
    if (entityType === "natural_person" ? !fullName : !businessName) {
      return NextResponse.json({ error: "A name is required." }, { status: 400 });
    }

    const email = typeof b.email === "string" ? b.email.trim() : "";
    const cell = typeof b.cell === "string" ? b.cell.trim() : "";
    // The one FICA-required field enforced rather than merely marked.
    //
    // ficaFields() requires cell AND email AND (ID | registration number), and
    // walling all of those off would break the ordinary case: an attorney adds
    // a seller knowing a name and one way to reach them, and the rest arrives
    // with the FICA pack. The form marks every required field and says what is
    // still outstanding.
    //
    // But this creates a real client record, and a client record with no way to
    // reach the person cannot be invited, chased or FICA-verified — it can only
    // sit there. So: at least one contact route, and the form says which.
    if (!email && !cell) {
      return NextResponse.json(
        { error: "An email address or a cell number is required — this creates a client record, and one with neither cannot be contacted." },
        { status: 400 }
      );
    }

    const made = await findOrCreateClientForParty(supabase, {
      entityType: entityType as "natural_person" | "business" | "trust",
      fullName,
      firstName,
      lastName,
      businessName,
      idNumber: b.idNumber as string,
      registrationNo: b.registrationNo as string,
      email,
      cell,
      physicalAddress: b.physicalAddress as string,
      // 070 — a partner may only create a client stamped with their OWN firm,
      // and the deduplicator must search that same scope or it would match (and
      // then render) another firm's client. Staff pass nothing: they dedupe
      // against everything, because they can see everything.
    }, { scopeToFirmId: me.isStaff ? null : me.firmId });
    if (!made.ok) return NextResponse.json({ error: made.error }, { status: 400 });
    row.client_id = made.clientId;
    // §108 — an attorney assigning a party who is not in the system creates them
    // as a new client. §44 then wants a human to verify that record. Held until
    // after the party row inserts: if RLS refuses the party, the client is not
    // one anybody needs to check yet.
    if (made.created) {
      createdClient = { id: made.clientId, name: entityType === "natural_person" ? fullName : businessName };
    }
  }

  const { data, error } = await supabase
    .from("transfer_parties")
    .insert(row)
    .select("id")
    .single();

  if (error) {
    // The one-seller / one-buyer partial indexes.
    if (error.code === "23505") {
      return NextResponse.json(
        { error: `This transfer already has a ${role.replace(/_/g, " ")}.` },
        { status: 409 }
      );
    }
    // RLS refusing the insert looks like this rather than a 403.
    if (error.code === "42501") {
      return NextResponse.json({ error: "You cannot edit this transfer." }, { status: 403 });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // Keep the transfer's own columns in step, so the Edit form and the detail
  // card show the party that was just added. Staff only — see callerProfile.
  if (me.isStaff) {
    await syncTransferFromParty(
      createAdminClient(),
      transferId,
      { role, client_id: row.client_id as string | null, firm_id: row.firm_id as string | null },
      "added"
    );
  }

  if (createdClient) {
    let firmName: string | null = null;
    if (me.firmId) {
      const { data: firm } = await createAdminClient()
        .from("firms")
        .select("name")
        .eq("id", me.firmId)
        .maybeSingle();
      firmName = (firm as { name: string } | null)?.name ?? null;
    }
    await notifyStaffNewClient({
      clientId: createdClient.id,
      name: createdClient.name,
      createdByRole: me.role,
      firmName,
    });
  }

  return NextResponse.json({ ok: true, id: data.id });
}

/**
 * Edit an INLINE-captured party's contact details.
 *
 * Only the inline columns are writable. A party linked to a client or a firm
 * reads its details through to that record, so editing it here would either be
 * ignored or quietly create a second, divergent copy of a client's contact
 * details — the guard below refuses rather than letting that happen. Those are
 * edited on the client or firm page, which is where the pencil points.
 */
export async function PATCH(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  if (!rateLimit(`transfer-parties-patch:${clientIp(req)}`, 30, 60_000)) {
    return NextResponse.json({ error: "Too many requests. Try again shortly." }, { status: 429 });
  }

  let b: Record<string, unknown>;
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const id = typeof b.id === "string" ? b.id : null;
  if (!id) return NextResponse.json({ error: "id is required." }, { status: 400 });

  // Read it first so the refusal below is a sentence, not a silent no-op. RLS
  // applies to this select too, so a transfer the caller cannot reach 404s here.
  const { data: existing, error: readErr } = await supabase
    .from("transfer_parties")
    .select("id, client_id, firm_id, entity_type")
    .eq("id", id)
    .maybeSingle();
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 400 });
  if (!existing) return NextResponse.json({ error: "Party not found." }, { status: 404 });

  const row = existing as { client_id: string | null; firm_id: string | null; entity_type: string | null };
  if (row.client_id || row.firm_id) {
    return NextResponse.json(
      { error: "This party's details live on its client or firm record. Edit them there." },
      { status: 409 }
    );
  }

  const str = (k: string) => {
    const v = b[k];
    if (typeof v !== "string") return undefined;
    const t = v.trim();
    return t === "" ? null : t;
  };

  const patch: Record<string, unknown> = {};
  for (const [key, col] of [
    ["fullName", "full_name"],
    ["businessName", "business_name"],
    ["idNumber", "id_number"],
    ["registrationNo", "registration_no"],
    ["email", "email"],
    ["cell", "cell"],
    ["physicalAddress", "physical_address"],
  ] as const) {
    const v = str(key);
    if (v !== undefined) patch[col] = v;
  }
  if (!Object.keys(patch).length) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  // An inline row must keep a name — the same rule the create path enforces.
  const nameCol = row.entity_type === "natural_person" ? "full_name" : "business_name";
  if (nameCol in patch && !patch[nameCol]) {
    return NextResponse.json({ error: "A name is required." }, { status: 400 });
  }

  const { error } = await supabase.from("transfer_parties").update(patch).eq("id", id);
  if (error) {
    if (error.code === "42501") {
      return NextResponse.json({ error: "You cannot edit this transfer." }, { status: 403 });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required." }, { status: 400 });

  // Read before deleting: once it is gone there is no way to tell which of the
  // transfer's columns, if any, was pointing at it. RLS applies to this select,
  // so a party the caller cannot reach is simply not found.
  const { data: doomed } = await supabase
    .from("transfer_parties")
    .select("transfer_id, role, client_id, firm_id")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase.from("transfer_parties").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  if (doomed && (await callerIsStaff(supabase, user.id))) {
    const p = doomed as { transfer_id: string; role: string; client_id: string | null; firm_id: string | null };
    await syncTransferFromParty(
      createAdminClient(),
      p.transfer_id,
      { role: p.role, client_id: p.client_id, firm_id: p.firm_id },
      "removed"
    );
  }

  return NextResponse.json({ ok: true });
}
