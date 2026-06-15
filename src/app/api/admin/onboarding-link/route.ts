import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isStaffRole, type UserRole } from "@/types";
import { firePortalIntake } from "@/lib/n8n";
import { randomUUID } from "crypto";

export const runtime = "nodejs";

// Staff: get (or mint) an onboarding link for any matter, so FICA documents can
// be collected at any point — not only when the matter is created. Mirrors the
// partner route but without firm-ownership scoping (staff reach all matters).
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ message: "Not authenticated" }, { status: 401 });
  const { data: me } = await supabase
    .from("users")
    .select("role")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!isStaffRole((me?.role ?? null) as UserRole | null)) {
    return NextResponse.json({ message: "Staff only" }, { status: 403 });
  }

  let body: { matter_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.matter_id) {
    return NextResponse.json({ message: "matter_id is required" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: matter } = await admin
    .from("matters")
    .select("id, title, drive_folder_id")
    .eq("id", body.matter_id)
    .maybeSingle();
  if (!matter) return NextResponse.json({ message: "Matter not found" }, { status: 404 });

  // #6: if this matter has no Drive folder yet (portal-originated, pre-intake),
  // create one now so the uploads collected via this link land in Drive.
  if (!matter.drive_folder_id) {
    await firePortalIntake(matter.id, matter.title ?? body.matter_id);
  }

  // Reuse a live, unused link if one exists; otherwise mint a fresh 7-day token.
  const { data: existing } = await admin
    .from("onboarding_links")
    .select("token, expires_at, used")
    .eq("matter_id", body.matter_id)
    .eq("purpose", "onboarding")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const live =
    existing && !existing.used && (!existing.expires_at || new Date(existing.expires_at) > new Date());
  if (live) return NextResponse.json({ ok: true, token: existing!.token });

  const token = randomUUID();
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await admin.from("onboarding_links").insert({
    token,
    matter_id: body.matter_id,
    purpose: "onboarding",
    expires_at: expires,
  });
  if (error) return NextResponse.json({ message: error.message }, { status: 400 });

  return NextResponse.json({ ok: true, token });
}
