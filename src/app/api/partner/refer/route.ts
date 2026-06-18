import { NextResponse } from "next/server";
import { requirePartner } from "@/lib/partner";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { buildMatterTitle } from "@/lib/matter-naming";
import { firePortalIntake } from "@/lib/n8n";
import { notifyStaff } from "@/lib/notify";
import { randomUUID } from "crypto";

export const runtime = "nodejs";

type EntityType = "natural_person" | "business" | "trust";

interface PartyInput {
  role?: "buyer" | "seller" | "owner" | "applicant" | "other";
  entity_type?: EntityType;
  full_name?: string;
  business_name?: string;
  registration_no?: string;
  id_number?: string;
  email?: string;
  cell?: string;
  physical_address?: string;
  // contact person — business / trust parties (A1)
  contact_name?: string;
  contact_email?: string;
  contact_cell?: string;
}

const partyDisplayName = (p: PartyInput): string =>
  ((p.entity_type ?? "natural_person") === "natural_person" ? p.full_name : p.business_name)?.trim() ?? "";

// A partner refers a new matter. Two shapes:
//   • Single-client (BC etc.): one client bound to the firm + matter.
//   • Multi-party (COO): NO client account — buyer + seller captured as
//     matter_parties data records under one matter. Either way the matter is
//     linked DIRECTLY to the partner firm (matters.business_partner_id) so RLS
//     surfaces it, and we mint an onboarding link + auto-subscribe the partner.
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
    municipality?: string;
    property_description?: string;
    notes?: string;
    partner_file_ref?: string;
    parties?: PartyInput[];
    // legacy single-client fields
    entity_type?: EntityType;
    full_name?: string;
    business_name?: string;
    registration_no?: string;
    email?: string;
    cell?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
  }

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

  const parties = Array.isArray(body.parties) ? body.parties.filter((p) => partyDisplayName(p)) : [];

  // ==========================================================================
  // MULTI-PARTY PATH (COO buyer/seller) — no client account
  // ==========================================================================
  if (parties.length > 0) {
    const buyer = parties.find((p) => p.role === "buyer");
    const seller = parties.find((p) => p.role === "seller");
    if (!buyer || !partyDisplayName(buyer)) {
      return NextResponse.json({ message: "Buyer name is required" }, { status: 400 });
    }
    if (!seller || !partyDisplayName(seller)) {
      return NextResponse.json({ message: "Seller name is required" }, { status: 400 });
    }

    // Title uses the buyer (incoming owner) as the client segment.
    const title = buildMatterTitle({
      municipality: body.municipality,
      serviceCode,
      clientName: partyDisplayName(buyer),
      property: body.property_description,
    });

    const { data: matter, error: matterErr } = await admin
      .from("matters")
      .insert({
        client_id: null,
        business_partner_id: auth.partnerId,
        service_id: serviceId,
        title,
        current_phase: "1",
        status: "open",
        priority: "standard",
        municipality: body.municipality || null,
        service_notes: body.notes || null,
        partner_file_ref: body.partner_file_ref?.trim() || null,
      })
      .select("id")
      .single();
    if (matterErr) return NextResponse.json({ message: matterErr.message }, { status: 400 });

    const partyRows = parties.map((p) => {
      const et = p.entity_type ?? "natural_person";
      return {
        matter_id: matter.id,
        role: p.role ?? "other",
        entity_type: et,
        full_name: et === "natural_person" ? partyDisplayName(p) || null : null,
        business_name: et !== "natural_person" ? partyDisplayName(p) || null : null,
        registration_no: et !== "natural_person" ? p.registration_no?.trim() || null : null,
        id_number: p.id_number?.trim() || null,
        email: p.email?.trim().toLowerCase() || null,
        cell: p.cell?.trim() || null,
        physical_address: p.physical_address?.trim() || null,
        contact_name: et !== "natural_person" ? p.contact_name?.trim() || null : null,
        contact_email: et !== "natural_person" ? p.contact_email?.trim().toLowerCase() || null : null,
        contact_cell: et !== "natural_person" ? p.contact_cell?.trim() || null : null,
      };
    });
    const { error: partyErr } = await admin.from("matter_parties").insert(partyRows);
    if (partyErr) return NextResponse.json({ message: partyErr.message }, { status: 400 });

    await admin.from("matter_subscribers").insert({ matter_id: matter.id, user_id: auth.userId }).select();

    const token = randomUUID();
    const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    await admin.from("onboarding_links").insert({
      token,
      matter_id: matter.id,
      purpose: "onboarding",
      expires_at: expires,
    });

    await admin.from("matter_activities").insert({
      matter_id: matter.id,
      author_id: auth.userId,
      activity_type: "post",
      body: "Change-of-ownership matter referred by partner (buyer + seller captured).",
    });

    await firePortalIntake(matter.id, title);
    await notifyStaff({ type: "referral", title: `New matter referred: ${title}`, link: `/admin/matters/${matter.id}`, matter_id: matter.id });

    return NextResponse.json({ ok: true, matter_id: matter.id, onboarding_token: token });
  }

  // ==========================================================================
  // SINGLE-CLIENT PATH (BC etc.) — client bound to the firm
  // ==========================================================================
  const entityType = body.entity_type ?? "natural_person";
  const email = (body.email ?? "").trim().toLowerCase();
  const name = entityType === "natural_person" ? (body.full_name ?? "").trim() : (body.business_name ?? "").trim();
  if (!name) return NextResponse.json({ message: "Client / entity name is required" }, { status: 400 });

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

  const title = buildMatterTitle({
    municipality: body.municipality, serviceCode, clientName: name, property: body.property_description,
  });
  const { data: matter, error: matterErr } = await admin
    .from("matters")
    .insert({
      client_id: client.id,
      business_partner_id: auth.partnerId,
      service_id: serviceId,
      title,
      current_phase: "1",
      status: "new", // partner referral awaits staff review (H1)
      priority: "standard",
      municipality: body.municipality || null,
      service_notes: body.notes || null,
      partner_file_ref: body.partner_file_ref?.trim() || null,
    })
    .select("id")
    .single();
  if (matterErr) return NextResponse.json({ message: matterErr.message }, { status: 400 });

  await admin.from("matter_subscribers").insert({ matter_id: matter.id, user_id: auth.userId }).select();

  const token = randomUUID();
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  await admin.from("onboarding_links").insert({
    token,
    matter_id: matter.id,
    purpose: "onboarding",
    expires_at: expires,
  });

  await admin.from("matter_activities").insert({
    matter_id: matter.id,
    author_id: auth.userId,
    activity_type: "post",
    body: "Matter referred by partner.",
  });

  await firePortalIntake(matter.id, title);
  await notifyStaff({ type: "referral", title: `New matter referred: ${title}`, link: `/admin/matters/${matter.id}`, matter_id: matter.id });

  return NextResponse.json({ ok: true, matter_id: matter.id, client_id: client.id, onboarding_token: token });
}
