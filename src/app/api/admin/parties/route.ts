import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { type UserRole } from "@/types";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { requireStaff } from "@/lib/staff";

export const runtime = "nodejs";

// Edit a captured matter party (buyer/seller/applicant) after matter creation.
// Staff-only — partners/clients can't relabel parties. Role is immutable here;
// only the descriptive/contact fields are editable.

const EDITABLE = [
  "entity_type",
  "first_name",
  "last_name",
  "full_name",
  "business_name",
  "registration_no",
  "id_number",
  "email",
  "cell",
  "physical_address",
  "contact_first_name",
  "contact_last_name",
  "contact_email",
  "contact_cell",
  "notes",
] as const;

export async function PATCH(request: Request) {
  if (!rateLimit(`party-edit:${clientIp(request)}`, 60, 60_000)) {
    return NextResponse.json({ message: "Too many requests." }, { status: 429 });
  }
  const auth = await requireStaff();
  if ("error" in auth) return NextResponse.json({ message: auth.error }, { status: auth.status });

  let body: Record<string, unknown> & { party_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
  }
  const partyId = (body.party_id ?? "") as string;
  if (!partyId) return NextResponse.json({ message: "party_id is required" }, { status: 400 });

  const patch: Record<string, unknown> = {};
  for (const key of EDITABLE) {
    if (key in body) {
      const v = body[key];
      patch[key] = typeof v === "string" ? v.trim() || null : v;
    }
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ message: "No editable fields supplied" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin.from("matter_parties").update(patch).eq("id", partyId);
  if (error) return NextResponse.json({ message: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
