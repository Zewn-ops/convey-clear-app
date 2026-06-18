import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { STAFF_ROLES, type UserRole } from "@/types";

export const runtime = "nodejs";

// B5 / Theme G — link or unlink an existing Council POC to a matter.
//   POST   { matter_id, council_poc_id }  → link  (idempotent; UNIQUE pair)
//   DELETE ?matter_id=&council_poc_id=    → unlink

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
  const auth = await requireStaff();
  if ("error" in auth) return NextResponse.json({ message: auth.error }, { status: auth.status });

  let body: { matter_id?: string; council_poc_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
  }
  const matterId = (body.matter_id ?? "").trim();
  const pocId = (body.council_poc_id ?? "").trim();
  if (!matterId || !pocId) {
    return NextResponse.json({ message: "matter_id and council_poc_id are required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("matter_council_pocs")
    .upsert({ matter_id: matterId, council_poc_id: pocId }, { onConflict: "matter_id,council_poc_id", ignoreDuplicates: true });
  if (error) return NextResponse.json({ message: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const auth = await requireStaff();
  if ("error" in auth) return NextResponse.json({ message: auth.error }, { status: auth.status });

  const url = new URL(request.url);
  const matterId = url.searchParams.get("matter_id");
  const pocId = url.searchParams.get("council_poc_id");
  if (!matterId || !pocId) {
    return NextResponse.json({ message: "matter_id and council_poc_id are required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("matter_council_pocs")
    .delete()
    .eq("matter_id", matterId)
    .eq("council_poc_id", pocId);
  if (error) return NextResponse.json({ message: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
