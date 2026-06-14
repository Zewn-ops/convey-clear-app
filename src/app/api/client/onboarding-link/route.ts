import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { randomUUID } from "crypto";

export const runtime = "nodejs";

// Mint/reuse an onboarding link for the logged-in client's OWN matter, so they can
// upload documents via the proven /onboard flow. Ownership is verified server-side.
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ message: "Not authenticated" }, { status: 401 });
  const { data: me } = await supabase.from("users").select("client_id, role").eq("auth_user_id", user.id).maybeSingle();
  if (!me || me.role !== "client" || !me.client_id) {
    return NextResponse.json({ message: "Client accounts only" }, { status: 403 });
  }

  let body: { matter_id?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ message: "Invalid JSON" }, { status: 400 }); }
  if (!body.matter_id) return NextResponse.json({ message: "matter_id is required" }, { status: 400 });

  const admin = createAdminClient();
  const { data: matter } = await admin.from("matters").select("id, client_id").eq("id", body.matter_id).maybeSingle();
  if (!matter || matter.client_id !== me.client_id) {
    return NextResponse.json({ message: "Matter not found" }, { status: 404 });
  }

  const { data: existing } = await admin
    .from("onboarding_links").select("token, expires_at, used")
    .eq("matter_id", body.matter_id).eq("purpose", "onboarding")
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (existing && !existing.used && (!existing.expires_at || new Date(existing.expires_at) > new Date())) {
    return NextResponse.json({ ok: true, token: existing.token });
  }

  const token = randomUUID();
  const { error } = await admin.from("onboarding_links").insert({
    token, matter_id: body.matter_id, purpose: "onboarding",
    expires_at: new Date(Date.now() + 7 * 864e5).toISOString(),
  });
  if (error) return NextResponse.json({ message: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, token });
}
