import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePartner } from "@/lib/partner";
import { findOrCreateClientForParty } from "@/lib/party-client";
import { logMatterActivity } from "@/lib/activity";
import { buildMatterTitle } from "@/lib/matter-naming";
import { getPipeline } from "@/lib/pipelines";
import { normalisePrcStage } from "@/lib/prc-docs";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { notifyStaff } from "@/lib/notify";

export const runtime = "nodejs";

/**
 * A firm opens a matter on one of its transfers.
 *
 * Until now an attorney could only REQUEST a service and wait for a ConveyClear
 * admin to convert it by hand. Marlene, Francois and Marina all pushed on the
 * same point in one week: clicking a service should land the attorney on a
 * matter page, pre-filled from the transfer, and let them get the documents in
 * while they are already thinking about it.
 *
 * TWO RULES SHAPE THIS ROUTE, both from the 2026-09-15 meeting:
 *
 *   1. The matter MUST belong to a property transfer. Jukka: "if any attorney
 *      wants to use our service, they'll have to first create a property
 *      transfer for that matter to rest under" — the packaged fee is invoiced
 *      per transfer, so an unattached matter has nothing to bill against. There
 *      is no code path here that creates one without a transfer_id.
 *
 *   2. ConveyClear decides whether to take it. Marlene: it lands "in a draft
 *      stage" and ConveyClear approves or rejects "based on what was provided".
 *      So this writes firm_review_state='pending' (098) and nothing else about
 *      the matter is treated as live work until a staff member answers.
 */
export async function POST(request: Request) {
  if (!rateLimit(`partner-matters:${clientIp(request)}`, 20, 60_000)) {
    return NextResponse.json({ message: "Too many requests." }, { status: 429 });
  }

  const guard = await requirePartner();
  if ("error" in guard) {
    return NextResponse.json({ message: guard.error }, { status: guard.status });
  }
  const { userId, partnerId } = guard;

  let body: {
    transfer_id?: string;
    service_code?: string;
    service_subtype?: string | null;
    priority?: string;
    notes?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid request body" }, { status: 400 });
  }

  const transferId = (body.transfer_id ?? "").trim();
  const serviceCode = (body.service_code ?? "").trim().toUpperCase();
  if (!transferId || !serviceCode) {
    return NextResponse.json({ message: "A transfer and a service are required" }, { status: 400 });
  }

  const supabase = await createClient();

  // 🔴 REACHED THROUGH THE GRANT, NOT THE POINTER.
  //
  // property_transfers.business_partner_id is "the current primary firm pointer
  // the UI reads" (051's own words) and is NOT the permission. Access lives in
  // transfer_access_grants, and the two drifted far enough apart that on
  // 2026-09-10 the admin page listed a firm on 14 transfers while that firm
  // could open 9. Reading the column here would let a firm open a matter on a
  // transfer it cannot see — the exact inversion of that bug.
  //
  // This SELECT runs as the CALLER, so RLS decides, which is the same answer
  // the portal gives them. No separate grant query to drift from it.
  const { data: transfer } = await supabase
    .from("property_transfers")
    .select(
      "id, reference, property_description, municipality, status, business_partner_id, seller_client_id, buyer_client_id"
    )
    .eq("id", transferId)
    .maybeSingle();
  if (!transfer) {
    return NextResponse.json({ message: "Transfer not found" }, { status: 404 });
  }
  if (transfer.status === "cancelled") {
    return NextResponse.json({ message: "That transfer has been cancelled" }, { status: 400 });
  }

  // The checklist line this matter answers. Read as the caller for the same
  // reason as above, and it must be UNCLAIMED: a service already opened as a
  // matter is not a second matter, it is the one that exists.
  const { data: line } = await supabase
    .from("transfer_services")
    .select("id, service_code, prc_subtype, matter_id, status, position")
    .eq("transfer_id", transferId)
    .is("parent_id", null)
    .ilike("service_code", serviceCode)
    .is("matter_id", null)
    .order("position", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!line) {
    return NextResponse.json(
      { message: "That service is not open on this transfer, or already has a matter." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // The service row the matter points at. Matched on code because that is what
  // the checklist carries; the firm never sees a services.id.
  const { data: service } = await admin
    .from("services")
    .select("id, code")
    .ilike("code", serviceCode)
    .maybeSingle();
  if (!service) {
    return NextResponse.json({ message: "Unknown service" }, { status: 400 });
  }

  // PRC inherits its stage from the checklist line, exactly as the admin route
  // does — otherwise the title says COT_PRC_… and the created matter is an RCF.
  const subtype =
    serviceCode === "PRC"
      ? normalisePrcStage(body.service_subtype ?? (line as { prc_subtype?: string | null }).prc_subtype)
      : null;

  // ── The client ────────────────────────────────────────────────────────────
  // matters.client_id is NOT NULL, so the matter needs one before it can exist.
  // The transfer's seller is the subject of every service ConveyClear renders
  // (clearances, plans and certificates are all about the property as the
  // current owner holds it), so that is the default, with the buyer as the
  // fallback for a transfer captured the other way round.
  let clientId = transfer.seller_client_id ?? transfer.buyer_client_id ?? null;

  if (!clientId) {
    // Since 2026-09-02 a firm's transfer request writes its parties as inline
    // captures — real detail, no client record — so this is the common case,
    // not the edge one. Promote the seller capture into a client record.
    //
    // scopeToFirmId is REQUIRED here: the lookup runs as the service role on
    // behalf of one firm, and without it the deduplicator can match another
    // firm's client and render their name and contact details onto this firm's
    // matter. Staff paths pass nothing because staff can see everything anyway.
    const { data: party } = await admin
      .from("transfer_parties")
      .select("role, entity_type, full_name, first_name, last_name, business_name, id_number, email, cell")
      .eq("transfer_id", transferId)
      .in("role", ["seller", "buyer"])
      .order("role", { ascending: true }) // buyer before seller alphabetically; seller preferred below
      .limit(2);
    const preferred =
      (party ?? []).find((p) => p.role === "seller") ?? (party ?? [])[0] ?? null;
    if (!preferred) {
      return NextResponse.json(
        { message: "This transfer has no parties captured yet — add the seller before opening a matter." },
        { status: 400 }
      );
    }
    const result = await findOrCreateClientForParty(
      admin,
      {
        entityType: (preferred.entity_type as "natural_person" | "business" | "trust") ?? "natural_person",
        fullName: preferred.full_name,
        firstName: preferred.first_name,
        lastName: preferred.last_name,
        businessName: preferred.business_name,
        idNumber: preferred.id_number,
        email: preferred.email,
        cell: preferred.cell,
      },
      { scopeToFirmId: partnerId }
    );
    if (!result.ok) {
      // A failure here is not "no client" — it is a duplicate-detection or
      // validation refusal, and creating the matter anyway would leave a
      // NOT NULL client_id with nothing to point at.
      return NextResponse.json({ message: result.error }, { status: 400 });
    }
    clientId = result.clientId;
  }

  const pipeline = getPipeline(serviceCode, transfer.municipality, subtype);
  const title = buildMatterTitle({
    municipality: transfer.municipality,
    serviceCode,
    serviceSubtype: subtype,
    transferReference: transfer.reference,
    clientName: null,
    property: transfer.property_description,
  });

  const { data: matter, error: mErr } = await admin
    .from("matters")
    .insert({
      client_id: clientId,
      service_id: service.id,
      title,
      current_phase: pipeline?.prePhase.key ?? null,
      // status stays 'new', the value it has always had for unstarted work.
      // The draft-ness lives in firm_review_state — adding 'draft' to the
      // status CHECK is what broke submission on 089 and send-back on 090.
      status: "new",
      priority: body.priority || "standard",
      municipality: transfer.municipality || null,
      service_notes: (body.notes ?? "").trim() || null,
      service_subtype: serviceCode === "PRC" ? subtype : null,
      // Deliberately UNASSIGNED. Nobody at ConveyClear has accepted this yet,
      // and stamping an owner would put it on someone's default list as though
      // they had. The reviewer takes it on approval.
      current_owner_id: null,
      transfer_id: transferId,
      business_partner_id: partnerId,
      firm_review_state: "pending",
      submitted_by_user_id: userId,
    })
    .select("id")
    .single();
  if (mErr) return NextResponse.json({ message: mErr.message }, { status: 400 });

  // Claim the checklist line. Conditional on it still being unclaimed, so two
  // attorneys clicking the same service at the same moment cannot both win.
  const { error: adoptErr } = await admin
    .from("transfer_services")
    .update({ matter_id: matter.id })
    .eq("id", line.id)
    .is("matter_id", null);
  if (adoptErr) {
    // Logged, not swallowed. The same write was silently refused on every
    // matter for a month because an error on this path was discarded (see the
    // note in the admin route).
    console.error(
      `[partner/matters] could not attach matter ${matter.id} to service line ${line.id}:`,
      adoptErr.message
    );
  }

  await logMatterActivity(admin, {
    matterId: matter.id,
    authorId: userId,
    activityType: "system",
    body: "Submitted by the firm — awaiting ConveyClear review",
  });

  await notifyStaff(
    {
      type: "matter",
      title: `New matter from a firm: ${title}`,
      body: (body.notes ?? "").trim().slice(0, 140) || "No note provided.",
      matter_id: matter.id,
    },
    { enquiryPref: false }
  );

  return NextResponse.json({ id: matter.id, title }, { status: 201 });
}
