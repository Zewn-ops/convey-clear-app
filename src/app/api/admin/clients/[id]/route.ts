import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionProfile } from "@/lib/auth";
import { isStaffRole } from "@/types";
import { ficaFields } from "@/lib/fica";

export const runtime = "nodejs";

// Edit a client's details from their profile page. Staff-only.
//
// The editable field set comes from ficaFields() — the SAME definition the
// in-place FICA form on a matter uses. One source of truth for "what does a client
// of this entity type have", so the two surfaces cannot drift into disagreeing
// about which fields exist or which are required.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const session = await getSessionProfile();
  if (!isStaffRole(session?.profile?.role)) {
    return NextResponse.json({ message: "Insufficient privilege" }, { status: 403 });
  }

  let body: { entity_type?: string; details?: Record<string, string | null> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("clients")
    .select("id, entity_type")
    .eq("id", id)
    .maybeSingle();
  if (!existing) return NextResponse.json({ message: "Client not found" }, { status: 404 });

  const patch: Record<string, unknown> = {};

  // The entity type drives which documents the vault requires and which fields the
  // forms ask for, so changing it is a real edit, not cosmetic. Whitelist it.
  const entity = body.entity_type ?? (existing.entity_type as string);
  if (body.entity_type !== undefined) {
    if (!["natural_person", "business", "trust"].includes(body.entity_type)) {
      return NextResponse.json({ message: "Unknown entity type" }, { status: 400 });
    }
    patch.entity_type = body.entity_type;
  }

  if (body.details) {
    // Only fields the entity type actually has. Anything else is ignored rather
    // than trusted — the client sends what its form rendered, not what's allowed.
    for (const f of ficaFields(entity)) {
      if (!(f.key in body.details)) continue;
      const v = body.details[f.key];
      patch[f.key] = v === "" || v === undefined ? null : v;
    }
    // id_number isn't in the FICA field list for a business/trust (the ID belongs
    // to a person, not the entity), but the clients table carries it and staff may
    // legitimately correct it on an individual.
    if (entity === "natural_person" && "id_number" in body.details) {
      patch.id_number = body.details.id_number || null;
    }
  }

  // full_name is denormalised from first/last (migration 023). Keep it in step, or
  // the client keeps showing their old name everywhere full_name is rendered.
  if ("first_name" in patch || "last_name" in patch) {
    const first = (patch.first_name ?? null) as string | null;
    const last = (patch.last_name ?? null) as string | null;
    patch.full_name = `${first ?? ""} ${last ?? ""}`.trim() || null;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ message: "Nothing to update" }, { status: 400 });
  }

  patch.updated_at = new Date().toISOString();

  const { error } = await admin.from("clients").update(patch).eq("id", id);
  if (error) return NextResponse.json({ message: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
