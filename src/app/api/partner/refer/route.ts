import { NextResponse } from "next/server";
import { requirePartner } from "@/lib/partner";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { buildMatterTitle } from "@/lib/matter-naming";
import { getPipeline } from "@/lib/pipelines";
import { composeFullName } from "@/types";
import { firePortalIntake } from "@/lib/n8n";
import { notifyStaff } from "@/lib/notify";
import { randomUUID } from "crypto";

export const runtime = "nodejs";

type EntityType = "natural_person" | "business" | "trust";

interface PartyInput {
  role?: "buyer" | "seller" | "owner" | "applicant" | "other";
  entity_type?: EntityType;
  first_name?: string;
  last_name?: string;
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

const partyDisplayName = (p: PartyInput): string => {
  if ((p.entity_type ?? "natural_person") === "natural_person") {
    return (composeFullName(p.first_name, p.last_name) || (p.full_name ?? "")).trim();
  }
  return (p.business_name ?? "").trim();
};

// A partner refers a new matter. Shapes:
//   • Multi-party (COO): buyer + seller captured as matter_parties.
//   • Single-party (PRC): the seller/applicant captured as one matter_party +
//     referral fields in service_data (note 2026-06-22 — merged into parties).
//   • Single-client (BC etc.): one client bound to the firm.
// Either way the matter links to the partner firm (matters.business_partner_id),
// starts at the pipeline pre-phase, status 'new', and mints an onboarding link.
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
    service_subtype?: string;
    service_data?: Record<string, unknown>;
    parties?: PartyInput[];
    // legacy single-client fields
    entity_type?: EntityType;
    first_name?: string;
    last_name?: string;
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

  // Resolve service_id + code (code feeds matter-naming + the pipeline lookup).
  let serviceId: string | null = body.service_id ?? null;
  let serviceCode: string = body.service_code ?? "";
  if (serviceId) {
    const { data: svc } = await admin.from("services").select("code").eq("id", serviceId).maybeSingle();
    serviceCode = svc?.code ?? serviceCode;
  } else if (body.service_code) {
    const { data: svc } = await admin.from("services").select("id").eq("code", body.service_code).maybeSingle();
    serviceId = svc?.id ?? null;
  }

  // New matters start at the pipeline pre-phase ("New Instruction"); staff advance.
  const pipeline = getPipeline(serviceCode, body.municipality, body.service_subtype);
  const initialPhase = pipeline?.prePhase.key ?? null;

  const title = buildMatterTitle({
    internalRef: body.partner_file_ref,
    property: body.property_description,
    municipality: body.municipality,
    serviceCode,
  });

  const parties = Array.isArray(body.parties) ? body.parties.filter((p) => partyDisplayName(p)) : [];

  // ==========================================================================
  // MULTI-PARTY PATH (COO buyer/seller · PRC seller) — no client account
  // ==========================================================================
  if (parties.length > 0) {
    const isCoo = serviceCode.toUpperCase() === "COO";
    if (isCoo) {
      const buyer = parties.find((p) => p.role === "buyer");
      const seller = parties.find((p) => p.role === "seller");
      if (!buyer || !partyDisplayName(buyer)) {
        return NextResponse.json({ message: "Buyer name is required" }, { status: 400 });
      }
      if (!seller || !partyDisplayName(seller)) {
        return NextResponse.json({ message: "Seller name is required" }, { status: 400 });
      }
    } else if (!partyDisplayName(parties[0])) {
      return NextResponse.json({ message: "Seller / applicant name is required" }, { status: 400 });
    }

    const { data: matter, error: matterErr } = await admin
      .from("matters")
      .insert({
        client_id: null,
        business_partner_id: auth.partnerId,
        service_id: serviceId,
        title,
        current_phase: initialPhase,
        status: "new", // all partner referrals await staff review (note 12)
        priority: "standard",
        municipality: body.municipality || null,
        service_notes: body.notes || null,
        partner_file_ref: body.partner_file_ref?.trim() || null,
        service_subtype: body.service_subtype || null,
        service_data: body.service_data ?? {},
      })
      .select("id")
      .single();
    if (matterErr) return NextResponse.json({ message: matterErr.message }, { status: 400 });

    const partyRows = parties.map((p) => {
      const et = p.entity_type ?? "natural_person";
      const first = p.first_name?.trim() || null;
      const last = p.last_name?.trim() || null;
      return {
        matter_id: matter.id,
        role: p.role ?? "other",
        entity_type: et,
        first_name: et === "natural_person" ? first : null,
        last_name: et === "natural_person" ? last : null,
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
    await admin.from("onboarding_links").insert({ token, matter_id: matter.id, purpose: "onboarding", expires_at: expires });

    await admin.from("matter_activities").insert({
      matter_id: matter.id,
      author_id: auth.userId,
      activity_type: "post",
      body: "Matter referred by partner.",
    });

    await firePortalIntake(matter.id, title);
    await notifyStaff({ type: "referral", title: "New matter referred", link: `/admin/matters/${matter.id}`, matter_id: matter.id });

    return NextResponse.json({ ok: true, matter_id: matter.id, onboarding_token: token });
  }

  // ==========================================================================
  // SINGLE-CLIENT PATH (BC etc.) — client bound to the firm
  // ==========================================================================
  const entityType = body.entity_type ?? "natural_person";
  const email = (body.email ?? "").trim().toLowerCase();
  const personName = composeFullName(body.first_name, body.last_name) || (body.full_name ?? "").trim();
  const name = entityType === "natural_person" ? personName : (body.business_name ?? "").trim();
  if (!name) return NextResponse.json({ message: "Client / entity name is required" }, { status: 400 });

  const { data: client, error: clientErr } = await admin
    .from("clients")
    .insert({
      entity_type: entityType,
      first_name: entityType === "natural_person" ? body.first_name?.trim() || null : null,
      last_name: entityType === "natural_person" ? body.last_name?.trim() || null : null,
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

  const { data: matter, error: matterErr } = await admin
    .from("matters")
    .insert({
      client_id: client.id,
      business_partner_id: auth.partnerId,
      service_id: serviceId,
      title,
      current_phase: initialPhase,
      status: "new",
      priority: "standard",
      municipality: body.municipality || null,
      service_notes: body.notes || null,
      partner_file_ref: body.partner_file_ref?.trim() || null,
      service_subtype: body.service_subtype || null,
      service_data: body.service_data ?? {},
    })
    .select("id")
    .single();
  if (matterErr) return NextResponse.json({ message: matterErr.message }, { status: 400 });

  await admin.from("matter_subscribers").insert({ matter_id: matter.id, user_id: auth.userId }).select();

  const token = randomUUID();
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  await admin.from("onboarding_links").insert({ token, matter_id: matter.id, purpose: "onboarding", expires_at: expires });

  await admin.from("matter_activities").insert({
    matter_id: matter.id,
    author_id: auth.userId,
    activity_type: "post",
    body: "Matter referred by partner.",
  });

  await firePortalIntake(matter.id, title);
  await notifyStaff({ type: "referral", title: "New matter referred", link: `/admin/matters/${matter.id}`, matter_id: matter.id });

  return NextResponse.json({ ok: true, matter_id: matter.id, client_id: client.id, onboarding_token: token });
}
