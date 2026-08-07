import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { STAFF_ROLES, type UserRole } from "@/types";

export const runtime = "nodejs";

// Close off a refused-signup request (057). Staff-only. This does NOT create the
// login — provisioning lives in /admin/users, which is already role-aware, and a
// second path into it would be a second thing to keep correct.
export async function POST(request: Request) {
  if (!rateLimit(`signup-request-review:${clientIp(request)}`, 40, 60_000)) {
    return NextResponse.json({ message: "Too many requests." }, { status: 429 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ message: "Not authenticated" }, { status: 401 });
  const { data: me } = await supabase
    .from("users")
    .select("id, role")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!me || !STAFF_ROLES.includes(me.role as UserRole)) {
    return NextResponse.json({ message: "Insufficient privilege" }, { status: 403 });
  }

  let body: { id?: string; status?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
  }

  const id = (body.id ?? "").trim();
  const status = (body.status ?? "").trim();
  if (!id) return NextResponse.json({ message: "id is required" }, { status: 400 });
  if (status !== "actioned" && status !== "dismissed") {
    return NextResponse.json({ message: "status must be actioned or dismissed" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("signup_requests")
    .update({ status, actioned_by: me.id, actioned_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return NextResponse.json({ message: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
