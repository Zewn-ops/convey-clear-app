import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { STAFF_ROLES, type UserRole } from "@/types";
import { rateLimit, clientIp } from "@/lib/ratelimit";

export const runtime = "nodejs";

// A8 — create an account from a captured party (buyer/seller).
//   mode "contact" → a clients CRM record (no login).
//   mode "login"   → a client login (auth account + temp password) that can see
//                    THIS matter (added as a matter subscriber).
// Staff-only. Pre-filled from the party's captured data.

function genTempPassword(): string {
  const A = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const pick = (n: number) =>
    Array.from(crypto.getRandomValues(new Uint32Array(n)), (x) => A[x % A.length]).join("");
  return `CC-${pick(4)}-${pick(4)}-${pick(2)}`;
}

async function requireStaff() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated", status: 401 as const };
  const { data: me } = await supabase.from("users").select("id, role").eq("auth_user_id", user.id).maybeSingle();
  const role = (me?.role ?? null) as UserRole | null;
  if (!role || !STAFF_ROLES.includes(role)) return { error: "Insufficient privilege", status: 403 as const };
  return { callerId: me!.id as string };
}

export async function POST(request: Request) {
  if (!rateLimit(`party-account:${clientIp(request)}`, 30, 60_000)) {
    return NextResponse.json({ message: "Too many requests." }, { status: 429 });
  }
  const auth = await requireStaff();
  if ("error" in auth) return NextResponse.json({ message: auth.error }, { status: auth.status });

  let body: { party_id?: string; mode?: "contact" | "login" };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
  }
  const partyId = body.party_id ?? "";
  const mode = body.mode === "login" ? "login" : "contact";
  if (!partyId) return NextResponse.json({ message: "party_id is required" }, { status: 400 });

  const admin = createAdminClient();

  const { data: party } = await admin
    .from("matter_parties")
    .select("id, matter_id, entity_type, first_name, last_name, full_name, business_name, registration_no, id_number, email, cell, physical_address, contact_email")
    .eq("id", partyId)
    .maybeSingle();
  if (!party) return NextResponse.json({ message: "Party not found" }, { status: 404 });

  const { data: matter } = await admin
    .from("matters")
    .select("id, business_partner_id")
    .eq("id", party.matter_id)
    .maybeSingle();

  const isPerson = party.entity_type === "natural_person";
  const name = (isPerson ? party.full_name : party.business_name) || "Party";
  const email = (party.email || party.contact_email || "").trim().toLowerCase();

  const clientPayload = {
    entity_type: party.entity_type,
    first_name: isPerson ? party.first_name || null : null,
    last_name: isPerson ? party.last_name || null : null,
    full_name: isPerson ? party.full_name || null : null,
    business_name: !isPerson ? party.business_name || null : null,
    registration_no: party.registration_no || null,
    id_number: party.id_number || null,
    primary_email: email || null,
    primary_cell: party.cell || null,
    physical_address: party.physical_address || null,
    business_partner_id: matter?.business_partner_id || null,
  };

  // ----- CONTACT (CRM record only) -----
  if (mode === "contact") {
    const { data: client, error } = await admin.from("clients").insert(clientPayload).select("id").single();
    if (error) return NextResponse.json({ message: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, mode: "contact", client_id: client.id, name });
  }

  // ----- LOGIN (auth account + temp password) -----
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json(
      { message: "This party has no email — add one before creating a login." },
      { status: 400 }
    );
  }

  const tempPassword = genTempPassword();
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { full_name: name, provisioned: true },
  });
  if (createErr || !created?.user) {
    return NextResponse.json({ message: createErr?.message ?? "Could not create the account." }, { status: 400 });
  }
  const authUserId = created.user.id;

  // The handle_new_user trigger created/linked a public.users row (role 'client').
  const { data: profileRow } = await admin
    .from("users")
    .select("id, client_id")
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  let clientId = profileRow?.client_id ?? null;
  if (!clientId) {
    const { data: client, error: clientErr } = await admin.from("clients").insert(clientPayload).select("id").single();
    if (clientErr) {
      await admin.auth.admin.deleteUser(authUserId);
      return NextResponse.json({ message: clientErr.message }, { status: 400 });
    }
    clientId = client.id;
    if (profileRow) await admin.from("users").update({ client_id: clientId }).eq("id", profileRow.id);
  }

  // Let the new login see THIS matter (RLS can_access_matter checks subscribers).
  await admin.from("matter_subscribers").insert({ matter_id: party.matter_id, user_id: profileRow?.id }).select();

  return NextResponse.json({ ok: true, mode: "login", client_id: clientId, email, temp_password: tempPassword, name });
}
