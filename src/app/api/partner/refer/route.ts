import { NextResponse } from "next/server";
import { requirePartner } from "@/lib/partner";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { buildMatterTitle } from "@/lib/matter-naming";
import { randomUUID } from "crypto";

export const runtime = "nodejs";

// A partner refers a new client + matter. The client is bound to the partner's
// firm (business_partner_id) so RLS will surface it to them automatically. We
// also auto-subscribe the partner to the matter (notification basis) and mint an
// onboarding link so they can immediately complete FICA on the client's behalf.
export async function POST(request: Request) {
  if (!rateLimit(`partner-refer:${clientIp(request)}`, 30, 60_000)) {
    return NextResponse.json({ message: "Too many requests." }, { status: 429 });
  }
  const auth = await requirePartner();
  if ("error" in auth) {
    return NextResponse.json({ message: auth.error }, { status: auth.status });
  }

  let body: {
    service_id?: string;
    service_code?: string;
    entity_type?: "natural_person" | "business" | "trust";
    full_name?: string;
    business_name?: string;
    registration_no?: string;
    email?: string;
    cell?: string;
    municipality?: string;
    property_description?: string;
    notes?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
  }

  const entityType = body.entity_type ?? "natural_person";
  const email = (body.email ?? "").trim().toLowerCase();
  const name = entityType === "natural_person" ? (body.full_name ?? "").trim() : (body.business_name ?? "").trim();
  if (!name) return NextResponse.json({ message: "Client / entity name is required" }, { status: 400 });

  const admin = createAdminClient();

  // Resolve service_id + code (code feeds the matter-naming convention).
  let serviceId: string | null = body.service_id ?? null;
  let serviceCode: string = body.service_code ?? "";
  if (serviceId) {
    const { data: svc } = await admin.from("services").select("code").eq("id", serviceId).maybeSingle();
    serviceCode = svc?.code ?? serviceCode;
  } else if (body.service_code) {
    const { data: svc } = await admin.from("services").select("id").eq("code", body.service_code).maybeSingle();
    serviceId = svc?.id ?? null;
  }

  // 1. Client (bound to the partner firm).
  const { data: client, error: clientErr } = await admin
    .from("clients")
    .insert({
      entity_type: entityType,
      full_name: entityType === "natural_person" ? name : null,
      business_name: entityType !== "natural_person" ? name : null,
      registration_no: entityType !== "natural_person" ? (body.registration_no || null) : null,
      primary_email: email || null,
      primary_cell: body.cell || null,
      business_partner_id: auth.partnerId,
    })
    .select("id")
    .single();
  if (clientErr) return NextResponse.json({ message: clientErr.message }, { status: 400 });

  // 2. Matter (Phase 1 — Initial Contact & Setup). Standard naming convention.
  const title = buildMatterTitle({
    municipality: body.municipality, serviceCode, clientName: name, property: body.property_description,
  });
  const { data: matter, error: matterErr } = await admin
    .from("matters")
    .insert({
      client_id: client.id,
      service_id: serviceId,
      title,
      current_phase: "1",
      status: "open",
      priority: "standard",
      municipality: body.municipality || null,
      service_notes: body.notes || null,
    })
    .select("id")
    .single();
  if (matterErr) return NextResponse.json({ message: matterErr.message }, { status: 400 });

  // 3. Subscribe the partner user to the matter (notification basis).
  await admin.from("matter_subscribers").insert({ matter_id: matter.id, user_id: auth.userId }).select();

  // 4. Mint an onboarding link (7-day, single-use) so they can complete FICA now.
  const token = randomUUID();
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  await admin.from("onboarding_links").insert({
    token,
    matter_id: matter.id,
    purpose: "onboarding",
    expires_at: expires,
  });

  // 5. Activity feed entry.
  await admin.from("matter_activities").insert({
    matter_id: matter.id,
    author_id: auth.userId,
    activity_type: "post",
    content: "Matter referred by partner.",
  });

  return NextResponse.json({
    ok: true,
    matter_id: matter.id,
    client_id: client.id,
    onboarding_token: token,
  });
}
