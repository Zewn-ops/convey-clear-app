import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildMatterTitle } from "@/lib/matter-naming";
import { rateLimit, clientIp } from "@/lib/ratelimit";

export const runtime = "nodejs";

// A logged-in client requests a service → creates a matter (Phase 1) for them.
// If the client has no client record yet (self-signup), one is created + linked.
export async function POST(request: Request) {
  if (!rateLimit(`client-request:${clientIp(request)}`, 20, 60_000)) {
    return NextResponse.json({ message: "Too many requests." }, { status: 429 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ message: "Not authenticated" }, { status: 401 });
  const { data: me } = await supabase
    .from("users").select("id, role, client_id, email, full_name")
    .eq("auth_user_id", user.id).maybeSingle();
  if (!me || me.role !== "client") {
    return NextResponse.json({ message: "Client accounts only" }, { status: 403 });
  }

  let body: { service_id?: string; municipality?: string; property_description?: string; notes?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ message: "Invalid JSON" }, { status: 400 }); }

  const admin = createAdminClient();

  // Ensure the client has a clients record.
  let clientId = me.client_id as string | null;
  let clientName = (me.full_name as string | null) || "";
  if (!clientId) {
    const { data: c, error } = await admin.from("clients").insert({
      entity_type: "natural_person",
      full_name: clientName || (me.email as string),
      primary_email: me.email,
    }).select("id, full_name").single();
    if (error) return NextResponse.json({ message: error.message }, { status: 400 });
    clientId = c.id;
    clientName = c.full_name || clientName;
    await admin.from("users").update({ client_id: clientId }).eq("id", me.id);
  } else {
    const { data: c } = await admin.from("clients").select("full_name, business_name").eq("id", clientId).maybeSingle();
    clientName = c?.business_name || c?.full_name || clientName;
  }

  let serviceCode = "";
  if (body.service_id) {
    const { data: svc } = await admin.from("services").select("code").eq("id", body.service_id).maybeSingle();
    serviceCode = svc?.code ?? "";
  }

  const title = buildMatterTitle({
    municipality: body.municipality, serviceCode, clientName, property: body.property_description,
  });

  const { data: matter, error: mErr } = await admin.from("matters").insert({
    client_id: clientId,
    service_id: body.service_id || null,
    title,
    current_phase: "1",
    status: "new", // partner/client referrals await staff review (H1)
    priority: "standard",
    municipality: body.municipality || null,
    service_notes: body.notes || null,
  }).select("id").single();
  if (mErr) return NextResponse.json({ message: mErr.message }, { status: 400 });

  await admin.from("matter_activities").insert({
    matter_id: matter.id, author_id: me.id, activity_type: "post", body: "Service requested by client via portal.",
  });

  return NextResponse.json({ ok: true, matter_id: matter.id, title });
}
