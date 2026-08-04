import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ADMIN_ROLES, PARTNER_TYPES, type PartnerType, type UserRole } from "@/types";
import { rateLimit, clientIp } from "@/lib/ratelimit";

export const runtime = "nodejs";

// Business-partner (firm) orgs. Admin / super_admin only.
//   POST   create a firm. A partner USER is then created against it via /api/admin/users.
//   PATCH  update a firm, including deactivating it.
// No DELETE: users, clients, matters and property_transfers all carry a
// business_partner_id FK. Retiring a firm = `active: false`, which drops it from
// the pickers while every historical row keeps pointing at a real org.

type FirmFields = {
  name?: string;
  abbreviation?: string;
  partner_type?: string;
  primary_email?: string;
  primary_cell?: string;
  physical_address?: string;
  notes?: string;
  active?: boolean;
};

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
  return { callerId: me!.id as string };
}

function clean(v?: string | null): string | null {
  const s = (v ?? "").trim();
  return s.length ? s : null;
}

function partnerType(v?: string): PartnerType {
  return PARTNER_TYPES.includes(v as PartnerType) ? (v as PartnerType) : "law_firm";
}

// The abbreviation is a short firm code ("BSI") shown next to matter titles, so
// it is upper-cased on write rather than trusted from the form.
function firmPayload(body: FirmFields) {
  const abbr = clean(body.abbreviation);
  return {
    partner_type: partnerType(body.partner_type),
    abbreviation: abbr ? abbr.toUpperCase() : null,
    primary_email: clean(body.primary_email),
    primary_cell: clean(body.primary_cell),
    physical_address: clean(body.physical_address),
    notes: clean(body.notes),
  };
}

export async function POST(request: Request) {
  if (!rateLimit(`firm:${clientIp(request)}`, 40, 60_000)) {
    return NextResponse.json({ message: "Too many requests." }, { status: 429 });
  }
  const auth = await requireAdmin();
  if ("error" in auth) return NextResponse.json({ message: auth.error }, { status: auth.status });

  let body: FirmFields;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
  }

  const name = clean(body.name);
  if (!name) return NextResponse.json({ message: "Firm name is required" }, { status: 400 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("firms")
    .insert({ name, ...firmPayload(body), created_by: auth.callerId })
    .select("*")
    .single();

  if (error) return NextResponse.json({ message: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, partner: data });
}

export async function PATCH(request: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return NextResponse.json({ message: auth.error }, { status: auth.status });

  let body: FirmFields & { id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
  }

  const id = clean(body.id);
  if (!id) return NextResponse.json({ message: "id is required" }, { status: 400 });

  const name = clean(body.name);
  if (!name) return NextResponse.json({ message: "Firm name is required" }, { status: 400 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("firms")
    .update({
      name,
      ...firmPayload(body),
      ...(typeof body.active === "boolean" ? { active: body.active } : {}),
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ message: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, partner: data });
}
