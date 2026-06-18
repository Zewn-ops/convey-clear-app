import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { STAFF_ROLES, type UserRole } from "@/types";
import { rateLimit, clientIp } from "@/lib/ratelimit";

export const runtime = "nodejs";

// B5 / Theme G — Council POC directory CRUD. Staff-only (internal contact book).
//   POST   create a POC (optionally link to a matter via matter_id).
//   PATCH  update a POC.
//   DELETE remove a POC (?id=...).
// Writes go through the service role after a staff check (council_pocs RLS is
// staff-only anyway, but the admin client keeps these routes uniform).

type PocFields = {
  first_name?: string;
  last_name?: string;
  email?: string;
  cell?: string;
  council?: string;
  department?: string;
  notes?: string;
};

async function requireStaff() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated", status: 401 as const };
  const { data: me } = await supabase.from("users").select("id, role").eq("auth_user_id", user.id).maybeSingle();
  const role = (me?.role ?? null) as UserRole | null;
  if (!role || !STAFF_ROLES.includes(role)) return { error: "Insufficient privilege", status: 403 as const };
  return { callerId: me!.id as string };
}

function clean(v?: string | null): string | null {
  const s = (v ?? "").trim();
  return s.length ? s : null;
}

function pocPayload(body: PocFields) {
  return {
    last_name: clean(body.last_name),
    email: clean(body.email),
    cell: clean(body.cell),
    council: clean(body.council),
    department: clean(body.department),
    notes: clean(body.notes),
  };
}

export async function POST(request: Request) {
  if (!rateLimit(`council-poc:${clientIp(request)}`, 60, 60_000)) {
    return NextResponse.json({ message: "Too many requests." }, { status: 429 });
  }
  const auth = await requireStaff();
  if ("error" in auth) return NextResponse.json({ message: auth.error }, { status: auth.status });

  let body: PocFields & { matter_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
  }

  const firstName = clean(body.first_name);
  if (!firstName) return NextResponse.json({ message: "A first name is required." }, { status: 400 });

  const admin = createAdminClient();
  const { data: poc, error } = await admin
    .from("council_pocs")
    .insert({ first_name: firstName, ...pocPayload(body), created_by: auth.callerId })
    .select("*")
    .single();
  if (error) return NextResponse.json({ message: error.message }, { status: 400 });

  // Optionally link to a matter in the same call (used by the matter POC card).
  const matterId = clean(body.matter_id);
  if (matterId) {
    const { error: linkErr } = await admin
      .from("matter_council_pocs")
      .insert({ matter_id: matterId, council_poc_id: poc.id });
    if (linkErr) return NextResponse.json({ message: linkErr.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, poc });
}

export async function PATCH(request: Request) {
  const auth = await requireStaff();
  if ("error" in auth) return NextResponse.json({ message: auth.error }, { status: auth.status });

  let body: PocFields & { id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
  }
  const id = clean(body.id);
  if (!id) return NextResponse.json({ message: "id is required" }, { status: 400 });
  const firstName = clean(body.first_name);
  if (!firstName) return NextResponse.json({ message: "A first name is required." }, { status: 400 });

  const admin = createAdminClient();
  const { data: poc, error } = await admin
    .from("council_pocs")
    .update({ first_name: firstName, ...pocPayload(body), updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
  if (error) return NextResponse.json({ message: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, poc });
}

export async function DELETE(request: Request) {
  const auth = await requireStaff();
  if ("error" in auth) return NextResponse.json({ message: auth.error }, { status: auth.status });

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ message: "id is required" }, { status: 400 });

  const admin = createAdminClient();
  const { error } = await admin.from("council_pocs").delete().eq("id", id);
  if (error) return NextResponse.json({ message: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
