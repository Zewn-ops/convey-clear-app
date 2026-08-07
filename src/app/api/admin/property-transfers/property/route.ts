import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { STAFF_ROLES, type UserRole } from "@/types";
import { logTransferActivity } from "@/lib/activity";

export const runtime = "nodejs";

// Link or unlink a transfer's property (056). Staff-only, matching every other
// write to property_transfers. Its own route rather than a field on the main
// PATCH because that route requires a reference and a status on every call —
// linking a property should not be able to fail on an unrelated validation.
export async function POST(request: Request) {
  if (!rateLimit(`transfer-property:${clientIp(request)}`, 40, 60_000)) {
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

  let body: { transfer_id?: string; property_id?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
  }

  const transferId = (body.transfer_id ?? "").trim();
  if (!transferId) {
    return NextResponse.json({ message: "transfer_id is required" }, { status: 400 });
  }
  const propertyId = body.property_id ? String(body.property_id).trim() : null;

  const admin = createAdminClient();

  // Resolve the label before writing so the feed entry can name the property
  // rather than printing a uuid at someone.
  let label: string | null = null;
  if (propertyId) {
    const { data: property } = await admin
      .from("properties")
      .select("id, label")
      .eq("id", propertyId)
      .maybeSingle();
    if (!property) return NextResponse.json({ message: "Property not found" }, { status: 404 });
    label = property.label as string;
  }

  const { error } = await admin
    .from("property_transfers")
    .update({ property_id: propertyId })
    .eq("id", transferId);
  if (error) return NextResponse.json({ message: error.message }, { status: 400 });

  await logTransferActivity(admin, {
    transferId,
    authorId: me.id,
    activityType: "system",
    body: label ? `Property linked: ${label}` : "Property unlinked",
  });

  return NextResponse.json({ ok: true });
}
