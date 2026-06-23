import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildMatterTitle } from "@/lib/matter-naming";
import { getPipeline } from "@/lib/pipelines";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { isStaffRole, composeFullName, type UserRole } from "@/types";
import { firePortalIntake } from "@/lib/n8n";
import { randomUUID } from "crypto";

export const runtime = "nodejs";

// Staff create a matter directly in the portal (portal-first; no Pipedrive needed).
// Pick an existing client OR create a new one, then create the matter (Phase 1)
// with the standard COT_COO_CLIENT_PROPERTY title + an onboarding link for docs.
export async function POST(request: Request) {
  if (!rateLimit(`admin-matters:${clientIp(request)}`, 40, 60_000)) {
    return NextResponse.json({ message: "Too many requests." }, { status: 429 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ message: "Not authenticated" }, { status: 401 });
  const { data: me } = await supabase.from("users").select("id, role").eq("auth_user_id", user.id).maybeSingle();
  if (!isStaffRole((me?.role ?? null) as UserRole | null)) {
    return NextResponse.json({ message: "Staff only" }, { status: 403 });
  }

  let body: {
    client_id?: string;
    entity_type?: "natural_person" | "business" | "trust";
    first_name?: string;
    last_name?: string;
    full_name?: string;
    business_name?: string;
    email?: string;
    cell?: string;
    service_id?: string;
    municipality?: string;
    property_description?: string;
    priority?: string;
    notes?: string;
  };
  try { body = await request.json(); } catch { return NextResponse.json({ message: "Invalid JSON" }, { status: 400 }); }

  const admin = createAdminClient();

  // Resolve / create client
  let clientId = body.client_id ?? null;
  let clientName = "";
  if (clientId) {
    const { data: c } = await admin.from("clients").select("full_name, business_name").eq("id", clientId).maybeSingle();
    clientName = c?.business_name || c?.full_name || "";
  } else {
    const entityType = body.entity_type ?? "natural_person";
    const personName = composeFullName(body.first_name, body.last_name) || (body.full_name ?? "").trim();
    clientName = entityType === "natural_person" ? personName : (body.business_name ?? "").trim();
    if (!clientName) return NextResponse.json({ message: "Client name is required" }, { status: 400 });
    const { data: newClient, error: cErr } = await admin.from("clients").insert({
      entity_type: entityType,
      first_name: entityType === "natural_person" ? body.first_name?.trim() || null : null,
      last_name: entityType === "natural_person" ? body.last_name?.trim() || null : null,
      full_name: entityType === "natural_person" ? clientName : null,
      business_name: entityType !== "natural_person" ? clientName : null,
      primary_email: (body.email || "").toLowerCase() || null,
      primary_cell: body.cell || null,
    }).select("id").single();
    if (cErr) return NextResponse.json({ message: cErr.message }, { status: 400 });
    clientId = newClient.id;
  }

  // Service code (for the title)
  let serviceCode = "";
  if (body.service_id) {
    const { data: svc } = await admin.from("services").select("code").eq("id", body.service_id).maybeSingle();
    serviceCode = svc?.code ?? "";
  }

  const title = buildMatterTitle({
    municipality: body.municipality, serviceCode, clientName, property: body.property_description,
  });
  const pipeline = getPipeline(serviceCode, body.municipality);

  const { data: matter, error: mErr } = await admin.from("matters").insert({
    client_id: clientId,
    service_id: body.service_id || null,
    title,
    current_phase: pipeline?.prePhase.key ?? null,
    status: "new",
    priority: body.priority || "standard",
    municipality: body.municipality || null,
    service_notes: body.notes || null,
    current_owner_id: me?.id ?? null,
  }).select("id").single();
  if (mErr) return NextResponse.json({ message: mErr.message }, { status: 400 });

  // Onboarding link so staff can collect FICA docs immediately
  const token = randomUUID();
  await admin.from("onboarding_links").insert({
    token, matter_id: matter.id, purpose: "onboarding",
    expires_at: new Date(Date.now() + 7 * 864e5).toISOString(),
  });
  await admin.from("matter_activities").insert({
    matter_id: matter.id, author_id: me?.id ?? null, activity_type: "post", body: "Matter created in portal by staff.",
  });

  // #6: have n8n create the Drive folder for this portal-originated matter so
  // FICA uploads have somewhere to land. Best-effort — never blocks creation.
  await firePortalIntake(matter.id, title);

  return NextResponse.json({ ok: true, matter_id: matter.id, client_id: clientId, title, onboarding_token: token });
}
