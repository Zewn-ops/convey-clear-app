import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { STAFF_ROLES, type UserRole } from "@/types";

export const runtime = "nodejs";

// The property as an entity (056). Staff-only writes, matching properties_
// staff_write — a client correcting their own erf number after a clearance has
// issued is not a self-service action.
//   POST   create
//   PATCH  update
// No DELETE: property_transfers.property_id is ON DELETE SET NULL, so a stray
// delete would silently unlink every transfer on that property. Same call as
// property_transfers itself (026).

type PropertyFields = {
  label?: string;
  address?: string;
  erf_number?: string;
  municipality?: string;
  province?: string;
  suburb?: string;
  rates_account_no?: string;
  title_deed_no?: string;
  client_id?: string;
  notes?: string;
  /** 060 — PATCH only. Absent means "leave the sold state alone". */
  active?: boolean;
};

async function requireStaff() {
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
  if (!role || !STAFF_ROLES.includes(role)) {
    return { error: "Insufficient privilege", status: 403 as const };
  }
  return { callerId: me!.id as string };
}

function clean(v?: string | null): string | null {
  const s = (v ?? "").trim();
  return s.length ? s : null;
}

function payload(body: PropertyFields) {
  return {
    address: clean(body.address),
    erf_number: clean(body.erf_number),
    municipality: clean(body.municipality),
    province: clean(body.province),
    suburb: clean(body.suburb),
    rates_account_no: clean(body.rates_account_no),
    title_deed_no: clean(body.title_deed_no),
    client_id: clean(body.client_id),
    notes: clean(body.notes),
  };
}

export async function POST(request: Request) {
  if (!rateLimit(`property-create:${clientIp(request)}`, 30, 60_000)) {
    return NextResponse.json({ message: "Too many requests." }, { status: 429 });
  }
  const auth = await requireStaff();
  if ("error" in auth) return NextResponse.json({ message: auth.error }, { status: auth.status });

  let body: PropertyFields;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
  }

  const label = clean(body.label);
  if (!label) {
    return NextResponse.json({ message: "A property name is required." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("properties")
    .insert({ label, ...payload(body), created_by: auth.callerId })
    .select("id")
    .single();

  if (error) return NextResponse.json({ message: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, id: data.id });
}

export async function PATCH(request: Request) {
  const auth = await requireStaff();
  if ("error" in auth) return NextResponse.json({ message: auth.error }, { status: auth.status });

  let body: PropertyFields & { id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
  }

  const id = clean(body.id);
  if (!id) return NextResponse.json({ message: "id is required" }, { status: 400 });
  const label = clean(body.label);
  if (!label) {
    return NextResponse.json({ message: "A property name is required." }, { status: 400 });
  }

  // 060 / §92 — the manual half of active. Registering a transfer deactivates
  // the property on its own; this covers a sale done off-portal, and undoing one
  // registered in error. Only applied when the caller actually sent the field, so
  // an edit-form save that predates this deploy cannot silently reactivate a
  // sold property.
  //
  // `deactivated_at` is set here rather than left to the caller: the CHECK
  // constraint refuses active=false without it in one direction and active=true
  // with it in the other, and a client that has to know that will eventually get
  // it wrong.
  const activePatch: { active?: boolean; deactivated_at?: string | null } = {};
  if (typeof body.active === "boolean") {
    activePatch.active = body.active;
    activePatch.deactivated_at = body.active ? null : new Date().toISOString();
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("properties")
    .update({ label, ...payload(body), ...activePatch })
    .eq("id", id);

  if (error) return NextResponse.json({ message: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
