import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { STAFF_ROLES, type UserRole } from "@/types";
import { rateLimit, clientIp } from "@/lib/ratelimit";

export const runtime = "nodejs";

// Create a standalone CLIENT entity from the Clients tab — no matter required.
// The workflow (Jukka, 2026-07-24): capture clients up front, provision their
// logins (see clients/[id]/create-login), then retroactively attach legacy /
// existing matters to the entity. Staff-only. This creates the CRM record only;
// the login is a separate, deliberate second step.

type Body = {
  entity_type?: "natural_person" | "business" | "trust";
  full_name?: string;
  business_name?: string;
  primary_email?: string;
  primary_cell?: string;
};

function clean(v?: string | null): string | null {
  const s = (v ?? "").trim();
  return s.length ? s : null;
}

export async function POST(request: Request) {
  if (!rateLimit(`client-create:${clientIp(request)}`, 60, 60_000)) {
    return NextResponse.json({ message: "Too many requests." }, { status: 429 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ message: "Not authenticated" }, { status: 401 });
  const { data: me } = await supabase.from("users").select("id, role").eq("auth_user_id", user.id).maybeSingle();
  if (!STAFF_ROLES.includes((me?.role ?? null) as UserRole)) {
    return NextResponse.json({ message: "Staff only" }, { status: 403 });
  }

  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
  }

  const entityType = body.entity_type === "business" || body.entity_type === "trust" ? body.entity_type : "natural_person";
  const isPerson = entityType === "natural_person";
  const fullName = clean(body.full_name);
  const businessName = clean(body.business_name);

  // A person needs a name; a business/trust needs a business name.
  const name = isPerson ? fullName : businessName;
  if (!name) {
    return NextResponse.json(
      { message: isPerson ? "A full name is required." : "A business/trust name is required." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { data: client, error } = await admin
    .from("clients")
    .insert({
      entity_type: entityType,
      full_name: isPerson ? fullName : null,
      business_name: isPerson ? null : businessName,
      primary_email: clean(body.primary_email),
      primary_cell: clean(body.primary_cell),
    })
    .select("id")
    .single();
  if (error) return NextResponse.json({ message: error.message }, { status: 400 });

  return NextResponse.json({ ok: true, client_id: client.id });
}
