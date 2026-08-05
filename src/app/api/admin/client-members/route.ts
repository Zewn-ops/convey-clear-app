import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ADMIN_ROLES, type UserRole } from "@/types";
import { rateLimit, clientIp } from "@/lib/ratelimit";

export const runtime = "nodejs";

/**
 * Membership: which logins may act for an entity (public.clients).
 *
 *   POST    attach a user to an entity with a role
 *   PATCH   change a role, or move the default
 *   DELETE  detach
 *
 * ADMIN-TIER, not any staff. Attaching a person to an entity hands them that
 * entity's entire matter and document history, including its FICA vault. That
 * is closer to provisioning a login than to editing a field, so it sits behind
 * the same guard as user creation.
 */

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
    return { error: "Admins only.", status: 403 as const };
  }
  return { ok: true as const };
}

const ROLES = ["owner", "member"] as const;
type MemberRole = (typeof ROLES)[number];

export async function POST(req: Request) {
  const gate = await requireAdmin();
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });

  if (!rateLimit(`client-members:${clientIp(req)}`, 20, 60_000)) {
    return NextResponse.json({ error: "Too many requests. Try again shortly." }, { status: 429 });
  }

  let body: { userId?: string; clientId?: string; role?: string; isDefault?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const { userId, clientId } = body;
  const role = (body.role ?? "member") as MemberRole;

  if (!userId || !clientId) {
    return NextResponse.json({ error: "userId and clientId are required." }, { status: 400 });
  }
  if (!ROLES.includes(role)) {
    return NextResponse.json(
      { error: `role must be one of: ${ROLES.join(", ")}.` },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // A user attached to an entity should be able to see it the moment they log
  // in, so the first membership becomes their default. Later ones do not, or
  // adding a second entity would silently move where someone lands.
  const { count } = await admin
    .from("client_members")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  const isDefault = body.isDefault ?? (count ?? 0) === 0;

  if (isDefault) {
    await admin.from("client_members").update({ is_default: false }).eq("user_id", userId);
  }

  const { data, error } = await admin
    .from("client_members")
    .insert({ user_id: userId, client_id: clientId, role, is_default: isDefault })
    .select("id")
    .single();

  if (error) {
    // 23505 = the (user_id, client_id) unique constraint. Not an error worth
    // showing as one: the desired state already holds.
    if (error.code === "23505") {
      return NextResponse.json({ error: "That user is already a member of this entity." }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, id: data.id });
}

export async function PATCH(req: Request) {
  const gate = await requireAdmin();
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });

  let body: { id?: string; role?: string; isDefault?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }
  if (!body.id) return NextResponse.json({ error: "id is required." }, { status: 400 });

  const admin = createAdminClient();
  const patch: Record<string, unknown> = {};

  if (body.role !== undefined) {
    if (!ROLES.includes(body.role as MemberRole)) {
      return NextResponse.json({ error: `role must be one of: ${ROLES.join(", ")}.` }, { status: 400 });
    }
    patch.role = body.role;
  }

  if (body.isDefault === true) {
    // Clear the old default first: the partial unique index refuses a second
    // one, so without this the update fails rather than moving it.
    const { data: row } = await admin
      .from("client_members")
      .select("user_id")
      .eq("id", body.id)
      .maybeSingle();
    if (row?.user_id) {
      await admin.from("client_members").update({ is_default: false }).eq("user_id", row.user_id);
    }
    patch.is_default = true;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  const { error } = await admin.from("client_members").update(patch).eq("id", body.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const gate = await requireAdmin();
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required." }, { status: 400 });

  const admin = createAdminClient();

  // Removing someone's default would leave them with memberships but no landing
  // entity, so promote another one rather than leaving that state behind.
  const { data: row } = await admin
    .from("client_members")
    .select("user_id, is_default")
    .eq("id", id)
    .maybeSingle();

  const { error } = await admin.from("client_members").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  if (row?.is_default && row.user_id) {
    const { data: next } = await admin
      .from("client_members")
      .select("id")
      .eq("user_id", row.user_id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (next?.id) {
      await admin.from("client_members").update({ is_default: true }).eq("id", next.id);
    }
  }

  return NextResponse.json({ ok: true });
}
