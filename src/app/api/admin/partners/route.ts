import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ADMIN_ROLES, type UserRole } from "@/types";

export const runtime = "nodejs";

// Create a business-partner (firm) org. Admin / super_admin only.
// A partner USER is then created against this org via /api/admin/users.
export async function POST(request: Request) {
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
  const role = (me?.role ?? null) as UserRole | null;
  if (!role || !ADMIN_ROLES.includes(role)) {
    return NextResponse.json({ message: "Insufficient privilege" }, { status: 403 });
  }

  let body: {
    name?: string;
    partner_type?: string;
    primary_email?: string;
    primary_cell?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
  }

  const name = (body.name ?? "").trim();
  if (!name) return NextResponse.json({ message: "Firm name is required" }, { status: 400 });

  const allowedTypes = ["attorney", "conveyancer", "law_firm", "estate_agent", "other"];
  const partnerType = allowedTypes.includes(body.partner_type ?? "")
    ? body.partner_type
    : "law_firm";

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("business_partners")
    .insert({
      name,
      partner_type: partnerType,
      primary_email: body.primary_email || null,
      primary_cell: body.primary_cell || null,
      created_by: me?.id ?? null,
    })
    .select("id, name, partner_type")
    .single();

  if (error) return NextResponse.json({ message: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, partner: data });
}
