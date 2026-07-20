import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logMatterActivity, logTransferActivity } from "@/lib/activity";
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
    transfer_id?: string;
  };
  try { body = await request.json(); } catch { return NextResponse.json({ message: "Invalid JSON" }, { status: 400 }); }

  const admin = createAdminClient();

  // Created INSIDE a property transfer (Jukka, meeting 1: the transfer is the
  // primary object — "create matters within the property transfer immediately"
  // rather than making one and linking it afterwards).
  //
  // Resolved through the CALLER's client, not the service role: a transfer the
  // caller cannot see must not become a transfer they can attach a matter to.
  // Staff can see all of them, so this is belt-and-braces today — but this route
  // is the one place a transfer_id arrives from a browser.
  let transferId: string | null = null;
  let transferFirm: string | null = null;
  if (body.transfer_id) {
    const { data: t } = await supabase
      .from("property_transfers")
      .select("id, reference, business_partner_id")
      .eq("id", body.transfer_id)
      .maybeSingle();
    if (!t) return NextResponse.json({ message: "Transfer not found or access denied" }, { status: 403 });
    transferId = t.id;
    transferFirm = (t.business_partner_id as string | null) ?? null;
  }

  // Resolve / create client
  let clientId = body.client_id ?? null;
  let clientName = "";
  if (clientId) {
    const { data: c } = await admin
      .from("clients")
      .select("full_name, business_name, business_partner_id")
      .eq("id", clientId)
      .maybeSingle();
    clientName = c?.business_name || c?.full_name || "";

    // ONE TRANSFER = ONE FIRM (see api/admin/property-transfers/link for the
    // full reasoning). Everything on a matter syncs up to its transfer, and the
    // transfer is readable by the firm that owns it — so a matter for another
    // firm's client cannot be created inside it.
    const clientFirm = (c?.business_partner_id as string | null) ?? null;
    if (transferFirm && clientFirm && clientFirm !== transferFirm) {
      return NextResponse.json(
        {
          message:
            "That client belongs to a different firm. A property transfer belongs to one firm — create a separate transfer for the other firm.",
        },
        { status: 409 }
      );
    }
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
    transfer_id: transferId,
  }).select("id").single();
  if (mErr) return NextResponse.json({ message: mErr.message }, { status: 400 });

  // Onboarding link so staff can collect FICA docs immediately
  const token = randomUUID();
  await admin.from("onboarding_links").insert({
    token, matter_id: matter.id, purpose: "onboarding",
    expires_at: new Date(Date.now() + 7 * 864e5).toISOString(),
  });
  await logMatterActivity(admin, {
    matterId: matter.id, authorId: me?.id ?? null, activityType: "post",
    body: transferId ? "Matter created in portal by staff, inside this property transfer." : "Matter created in portal by staff.",
  });

  // Mirror it onto the transfer's feed — same as the link route, because to the
  // transaction "a matter was created in it" and "a matter was linked to it" are
  // the same event. Without this, matters made the new way are invisible in the
  // transfer's own history.
  if (transferId) {
    await logTransferActivity(admin, {
      transferId,
      authorId: me?.id ?? null,
      activityType: "matter_linked",
      body: `${title} was created in this transfer`,
    });
  }

  // #6: have n8n create the Drive folder for this portal-originated matter so
  // FICA uploads have somewhere to land. Best-effort — never blocks creation.
  await firePortalIntake(matter.id, title);

  return NextResponse.json({ ok: true, matter_id: matter.id, client_id: clientId, title, onboarding_token: token });
}
