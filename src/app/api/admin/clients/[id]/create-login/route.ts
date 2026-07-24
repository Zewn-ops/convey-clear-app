import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { STAFF_ROLES, type UserRole } from "@/types";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { sendEmail } from "@/lib/email";
import { credentialsEmail } from "@/lib/email-templates";

export const runtime = "nodejs";

// Provision a portal LOGIN for an existing client entity — the second step of
// the standalone-client workflow (Jukka, 2026-07-24). No matter required: the
// client gets in, then legacy/existing matters are attached to their entity
// afterwards (RLS matches matters.client_id → users.client_id).
//
// Mirrors the "login" half of admin/parties/create-account, but keyed on a
// clients row rather than a matter_party, and with no matter_subscriber (there
// is no matter yet). Admin/staff only. The temp password is returned so staff
// can relay it if the email channel is still dark.

function genTempPassword(): string {
  const A = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const pick = (n: number) =>
    Array.from(crypto.getRandomValues(new Uint32Array(n)), (x) => A[x % A.length]).join("");
  return `CC-${pick(4)}-${pick(4)}-${pick(2)}`;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  if (!rateLimit(`client-login:${clientIp(request)}`, 20, 60_000)) {
    return NextResponse.json({ message: "Too many requests." }, { status: 429 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ message: "Not authenticated" }, { status: 401 });
  const { data: me } = await supabase.from("users").select("id, role").eq("auth_user_id", user.id).maybeSingle();
  if (!STAFF_ROLES.includes((me?.role ?? null) as UserRole)) {
    return NextResponse.json({ message: "Staff only" }, { status: 403 });
  }

  const admin = createAdminClient();

  const { data: client } = await admin
    .from("clients")
    .select("id, entity_type, full_name, business_name, primary_email")
    .eq("id", id)
    .maybeSingle();
  if (!client) return NextResponse.json({ message: "Client not found" }, { status: 404 });

  const email = (client.primary_email || "").trim().toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json(
      { message: "This client has no valid email — add one before creating a login." },
      { status: 400 }
    );
  }

  // Already has a login linked to this entity? Succeed idempotently rather than
  // minting a second account.
  const { data: existing } = await admin
    .from("users")
    .select("id, auth_user_id")
    .eq("client_id", id)
    .not("auth_user_id", "is", null)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ ok: true, already_exists: true, email });
  }

  const name = (client.entity_type === "natural_person" ? client.full_name : client.business_name) || "Client";
  const tempPassword = genTempPassword();

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { full_name: name, provisioned: true },
  });
  if (createErr || !created?.user) {
    // Most common: the email already has an account (e.g. the client self-signed
    // up). Surface it plainly rather than a raw Supabase string.
    const msg = /already|registered|exists/i.test(createErr?.message ?? "")
      ? "An account already exists for this email. Link it to this client instead of creating a new login."
      : createErr?.message ?? "Could not create the account.";
    return NextResponse.json({ message: msg }, { status: 400 });
  }
  const authUserId = created.user.id;

  // handle_new_user created a public.users row (role 'client'). Link it to this
  // client entity and hold it at /auth/change-password (migration 031).
  const { data: profileRow } = await admin
    .from("users")
    .select("id")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  if (profileRow) {
    const { error: linkErr } = await admin
      .from("users")
      .update({ client_id: id, must_change_password: true })
      .eq("id", profileRow.id);
    if (linkErr) {
      // Don't strand a half-made account — roll the auth user back.
      await admin.auth.admin.deleteUser(authUserId);
      return NextResponse.json({ message: linkErr.message }, { status: 400 });
    }
  }

  const base = process.env.NEXT_PUBLIC_APP_URL || "https://portal.conveyclear.co.za";
  const { subject, html } = credentialsEmail({ loginUrl: `${base}/auth/login`, email, tempPassword });
  const emailed = await sendEmail({ to: email, subject, html });

  return NextResponse.json({ ok: true, email, temp_password: tempPassword, emailed });
}
