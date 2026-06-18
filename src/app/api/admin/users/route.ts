import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  ADMIN_ROLES,
  ASSIGNABLE_ROLES_BY_ADMIN,
  ASSIGNABLE_ROLES_BY_SUPER,
  type UserRole,
} from "@/types";
import { rateLimit, clientIp } from "@/lib/ratelimit";

export const runtime = "nodejs";

// ============================================================================
// Privileged user management. Only admin / super_admin may call.
//  POST  → create a login (client / staff / partner). Returns a one-time temp
//          password so staff can hand it to the new user (email is sandboxed).
//  PATCH → update an existing user (active toggle / role change).
// Privilege rule: a plain admin may NOT mint or elevate to admin/super_admin —
// only a super_admin can. Enforced here AND by the DB guard trigger (013).
// ============================================================================

function genTempPassword(): string {
  // Readable-ish, strong enough for a one-time handover. e.g. CC-7Q4F-9XK2-MB
  const A = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no ambiguous chars
  const pick = (n: number) =>
    Array.from(
      crypto.getRandomValues(new Uint32Array(n)),
      (x) => A[x % A.length]
    ).join("");
  return `CC-${pick(4)}-${pick(4)}-${pick(2)}`;
}

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated", status: 401 as const };

  const { data: me } = await supabase
    .from("users")
    .select("id, role")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  const role = (me?.role ?? null) as UserRole | null;
  if (!role || !ADMIN_ROLES.includes(role)) {
    return { error: "Insufficient privilege", status: 403 as const };
  }
  return { callerId: me!.id as string, callerRole: role };
}

export async function POST(request: Request) {
  if (!rateLimit(`admin-users:${clientIp(request)}`, 30, 60_000)) {
    return NextResponse.json({ message: "Too many requests." }, { status: 429 });
  }
  const auth = await requireAdmin();
  if ("error" in auth) {
    return NextResponse.json({ message: auth.error }, { status: auth.status });
  }

  let body: {
    email?: string;
    full_name?: string;
    role?: UserRole;
    password?: string;
    entity_type?: "natural_person" | "business" | "trust";
    business_name?: string;
    primary_cell?: string;
    business_partner_id?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
  }

  const email = (body.email ?? "").trim().toLowerCase();
  const fullName = (body.full_name ?? "").trim();
  const role = (body.role ?? "client") as UserRole;

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ message: "A valid email is required" }, { status: 400 });
  }

  // Tier check: which roles may this caller assign?
  const allowed =
    auth.callerRole === "super_admin"
      ? ASSIGNABLE_ROLES_BY_SUPER
      : ASSIGNABLE_ROLES_BY_ADMIN;
  if (!allowed.includes(role)) {
    return NextResponse.json(
      { message: `Your role may not assign "${role}".` },
      { status: 403 }
    );
  }
  if (role === "business_partner" && !body.business_partner_id) {
    return NextResponse.json(
      { message: "A business partner (firm) must be selected for a partner login." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const tempPassword = body.password && body.password.length >= 8 ? body.password : genTempPassword();

  // 1. Create the auth account (confirmed → can log in immediately).
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { full_name: fullName, provisioned: true },
  });
  if (createErr || !created?.user) {
    return NextResponse.json(
      { message: createErr?.message ?? "Could not create the account." },
      { status: 400 }
    );
  }
  const authUserId = created.user.id;

  // 2. The handle_new_user trigger created/linked a public.users row (as 'client').
  //    Resolve it, then apply the real role + links. Service-role bypasses RLS
  //    and the guard trigger, so the privilege rule above is the gate.
  const { data: profileRow } = await admin
    .from("users")
    .select("id, client_id")
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  // 3. If this is a CLIENT, create the client record (the pipeline's "new client").
  let clientId: string | null = profileRow?.client_id ?? null;
  if (role === "client" && !clientId) {
    const entityType = body.entity_type ?? "natural_person";
    const { data: clientRow, error: clientErr } = await admin
      .from("clients")
      .insert({
        entity_type: entityType,
        full_name: entityType === "natural_person" ? fullName || null : null,
        business_name: entityType !== "natural_person" ? body.business_name || fullName || null : null,
        primary_email: email,
        primary_cell: body.primary_cell || null,
        business_partner_id: body.business_partner_id || null,
      })
      .select("id")
      .single();
    if (clientErr) {
      // roll back the orphan auth user so we don't leave a half-made account
      await admin.auth.admin.deleteUser(authUserId);
      return NextResponse.json({ message: clientErr.message }, { status: 400 });
    }
    clientId = clientRow.id;
  }

  // 4. Apply role + links to the profile row.
  const patch: Record<string, unknown> = {
    role,
    full_name: fullName || null,
    client_id: role === "client" ? clientId : null,
    business_partner_id: role === "business_partner" ? body.business_partner_id ?? null : null,
    active: true,
    updated_at: new Date().toISOString(),
  };
  const { error: updErr } = await admin
    .from("users")
    .update(patch)
    .eq("auth_user_id", authUserId);
  if (updErr) {
    return NextResponse.json({ message: updErr.message }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    user: { id: profileRow?.id, email, role, client_id: clientId },
    // One-time credential handover — emails are sandboxed tonight.
    temp_password: tempPassword,
  });
}

// PATCH — edit an existing user: details (name/email/phone), role, active,
// and (optionally) set a new login password. Tiering:
//   • A plain admin may NOT edit a super_admin/admin account, nor assign those
//     roles — only a super_admin can (mirrors the create-side rule + DB guard).
//   • No self-lockout: a caller can't deactivate or change their own role.
// Email + password changes also update the auth account (service role).
export async function PATCH(request: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) {
    return NextResponse.json({ message: auth.error }, { status: auth.status });
  }

  let body: {
    user_id?: string;
    full_name?: string;
    email?: string;
    phone?: string;
    active?: boolean;
    role?: UserRole;
    password?: string;          // explicit new password (>= 8 chars)
    generate_password?: boolean; // mint a one-time temp password (returned)
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.user_id) {
    return NextResponse.json({ message: "user_id is required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const isSuper = auth.callerRole === "super_admin";

  // Resolve the target so we can enforce tiering + reach the auth account.
  const { data: target } = await admin
    .from("users")
    .select("id, auth_user_id, role, email")
    .eq("id", body.user_id)
    .maybeSingle();
  if (!target) return NextResponse.json({ message: "User not found" }, { status: 404 });

  // A plain admin cannot edit a privileged (admin/super_admin) account.
  if (!isSuper && ADMIN_ROLES.includes(target.role as UserRole)) {
    return NextResponse.json(
      { message: "Only a super admin can edit an admin or super-admin account." },
      { status: 403 }
    );
  }

  const isSelf = target.id === auth.callerId;
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (typeof body.full_name === "string") patch.full_name = body.full_name.trim() || null;
  if (typeof body.phone === "string") patch.phone = body.phone.trim() || null;

  if (typeof body.active === "boolean") {
    if (isSelf && body.active === false) {
      return NextResponse.json({ message: "You can't deactivate your own account." }, { status: 400 });
    }
    patch.active = body.active;
  }

  if (body.role) {
    if (isSelf && body.role !== target.role) {
      return NextResponse.json({ message: "You can't change your own role." }, { status: 400 });
    }
    const allowed = isSuper ? ASSIGNABLE_ROLES_BY_SUPER : ASSIGNABLE_ROLES_BY_ADMIN;
    if (!allowed.includes(body.role)) {
      return NextResponse.json({ message: `Your role may not assign "${body.role}".` }, { status: 403 });
    }
    patch.role = body.role;
  }

  // Email change — update the auth account first (must stay in sync).
  const newEmail = (body.email ?? "").trim().toLowerCase();
  if (newEmail && newEmail !== (target.email ?? "").toLowerCase()) {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(newEmail)) {
      return NextResponse.json({ message: "A valid email is required" }, { status: 400 });
    }
    if (!target.auth_user_id) {
      return NextResponse.json({ message: "This user has no login account — email can't be changed." }, { status: 400 });
    }
    const { error: emailErr } = await admin.auth.admin.updateUserById(target.auth_user_id, {
      email: newEmail,
      email_confirm: true,
    });
    if (emailErr) return NextResponse.json({ message: emailErr.message }, { status: 400 });
    patch.email = newEmail;
  }

  // Password set — generate a one-time temp password or use the one provided.
  let tempPassword: string | null = null;
  if (body.generate_password || (body.password && body.password.length >= 8)) {
    if (!target.auth_user_id) {
      return NextResponse.json({ message: "This user has no login account — password can't be set." }, { status: 400 });
    }
    const newPw = body.generate_password ? genTempPassword() : body.password!;
    const { error: pwErr } = await admin.auth.admin.updateUserById(target.auth_user_id, { password: newPw });
    if (pwErr) return NextResponse.json({ message: pwErr.message }, { status: 400 });
    if (body.generate_password) tempPassword = newPw; // only echo generated ones
  }

  const { error } = await admin.from("users").update(patch).eq("id", body.user_id);
  if (error) return NextResponse.json({ message: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, temp_password: tempPassword });
}
