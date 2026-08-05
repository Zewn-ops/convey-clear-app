import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimit, clientIp } from "@/lib/ratelimit";

export const runtime = "nodejs";

/**
 * Parties on a property transfer.
 *
 * Deliberately uses the CALLER's client, not the service role. RLS on
 * transfer_parties routes through can_access_transfer(), so a firm can only
 * touch parties on a transfer it already works — and there is no code path here
 * that could widen that by accident.
 */

const ROLES = [
  "seller",
  "buyer",
  "estate_agent",
  "conveyancing_attorney",
  "bond_attorney",
  "cancellation_attorney",
  "other",
] as const;
type Role = (typeof ROLES)[number];

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  if (!rateLimit(`transfer-parties:${clientIp(req)}`, 30, 60_000)) {
    return NextResponse.json({ error: "Too many requests. Try again shortly." }, { status: 429 });
  }

  let b: Record<string, unknown>;
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const transferId = typeof b.transferId === "string" ? b.transferId : null;
  const role = b.role as Role;
  if (!transferId) return NextResponse.json({ error: "transferId is required." }, { status: 400 });
  if (!ROLES.includes(role)) {
    return NextResponse.json({ error: `role must be one of: ${ROLES.join(", ")}.` }, { status: 400 });
  }

  const clientId = typeof b.clientId === "string" && b.clientId ? b.clientId : null;
  const firmId = typeof b.firmId === "string" && b.firmId ? b.firmId : null;

  const row: Record<string, unknown> = { transfer_id: transferId, role };

  if (clientId && firmId) {
    return NextResponse.json(
      { error: "A party links to an entity or a firm, not both." },
      { status: 400 }
    );
  }

  if (clientId) {
    row.client_id = clientId;
  } else if (firmId) {
    row.firm_id = firmId;
  } else {
    // Inline capture. The database enforces this too; checking here turns a
    // constraint violation into a sentence someone can act on.
    const entityType = b.entityType as string | undefined;
    const fullName = typeof b.fullName === "string" ? b.fullName.trim() : "";
    const businessName = typeof b.businessName === "string" ? b.businessName.trim() : "";
    if (!entityType || !["natural_person", "business", "trust"].includes(entityType)) {
      return NextResponse.json({ error: "Pick a person, business or trust." }, { status: 400 });
    }
    if (entityType === "natural_person" ? !fullName : !businessName) {
      return NextResponse.json({ error: "A name is required." }, { status: 400 });
    }
    Object.assign(row, {
      entity_type: entityType,
      full_name: fullName || null,
      business_name: businessName || null,
      id_number: (b.idNumber as string) || null,
      registration_no: (b.registrationNo as string) || null,
      email: (b.email as string) || null,
      cell: (b.cell as string) || null,
    });
  }

  const { data, error } = await supabase
    .from("transfer_parties")
    .insert(row)
    .select("id")
    .single();

  if (error) {
    // The one-seller / one-buyer partial indexes.
    if (error.code === "23505") {
      return NextResponse.json(
        { error: `This transfer already has a ${role.replace(/_/g, " ")}.` },
        { status: 409 }
      );
    }
    // RLS refusing the insert looks like this rather than a 403.
    if (error.code === "42501") {
      return NextResponse.json({ error: "You cannot edit this transfer." }, { status: 403 });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, id: data.id });
}

export async function DELETE(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required." }, { status: 400 });

  const { error } = await supabase.from("transfer_parties").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
