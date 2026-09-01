import { NextResponse } from "next/server";
import { findOrCreateClientForParty } from "@/lib/party-client";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logMatterActivity, logTransferActivity } from "@/lib/activity";
import { buildMatterTitle } from "@/lib/matter-naming";
import { getPipeline } from "@/lib/pipelines";
import { normalisePrcStage } from "@/lib/prc-docs";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { isStaffRole, composeFullName, type UserRole } from "@/types";
import { firePortalIntake } from "@/lib/n8n";
import { randomUUID } from "crypto";

export const runtime = "nodejs";

/** One side of a COO transaction as captured on the create-matter form. */
interface PartyInput {
  entity_type?: "natural_person" | "business" | "trust";
  first_name?: string;
  last_name?: string;
  business_name?: string;
  id_number?: string;
  email?: string;
  cell?: string;
}

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
    /** PRC only — RCA | RCF | RCC. Inherited from the checklist line when absent. */
    service_subtype?: string | null;
    municipality?: string;
    property_description?: string;
    priority?: string;
    notes?: string;
    transfer_id?: string;
    /** COO only — the two sides of the transaction, captured at creation. */
    seller?: PartyInput;
    buyer?: PartyInput;
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

  // ── The PRC stage (RCA | RCF | RCC) ────────────────────────────────────────
  //
  // 🔴 THE BUG THIS FIXES. `matters.service_subtype` (021) was read in ten
  // places and written in none, so EVERY PRC matter carried NULL. getPipeline()
  // requires the subtype to match for PRC, so `cot-rcf` and `cot-rcc` could
  // never resolve — the matter said "No pipeline configured" while the pipeline
  // sat right there — and InPlaceIntake fell to "Stage not chosen" and listed no
  // documents. One null field, both symptoms.
  //
  // The stage is chosen on the transfer's service checklist (075's
  // transfer_services.prc_subtype). It has to reach the matter, so read it off
  // the line this matter is about to adopt. The line is resolved BEFORE the
  // insert (rather than updated blindly afterwards) precisely so its subtype can
  // be copied down in the same breath, and so the adoption targets one known row
  // instead of "whichever lines happen to match".
  //
  // An explicit body.service_subtype wins, for a matter created outside any
  // transfer — there is no line to inherit from there.
  const isPrc = serviceCode.toUpperCase() === "PRC";
  let adoptLineId: string | null = null;
  let subtype: string | null = normalisePrcStage(body.service_subtype);
  if (transferId && serviceCode) {
    // Matching is by SERVICE CODE, and only onto a line that has no matter yet —
    // a transfer can legitimately carry two matters of the same service (a rates
    // clearance re-run after a failed one), and the first is the one the
    // checklist is tracking.
    const { data: line } = await admin
      .from("transfer_services")
      .select("id, prc_subtype")
      .eq("transfer_id", transferId)
      .eq("service_code", serviceCode.toUpperCase())
      .is("parent_id", null)
      .is("matter_id", null)
      .order("position", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (line) {
      adoptLineId = line.id as string;
      if (!subtype) subtype = normalisePrcStage((line as { prc_subtype?: string | null }).prc_subtype);
    }
  }

  const pipeline = getPipeline(serviceCode, body.municipality, subtype);

  const { data: matter, error: mErr } = await admin.from("matters").insert({
    client_id: clientId,
    service_id: body.service_id || null,
    title,
    current_phase: pipeline?.prePhase.key ?? null,
    status: "new",
    priority: body.priority || "standard",
    municipality: body.municipality || null,
    service_notes: body.notes || null,
    // Only ever set on a PRC matter: the column means the rates-clearance stage
    // and nothing else, so writing it on a COO would be a lie the pipeline
    // resolver happens to ignore today.
    service_subtype: isPrc ? subtype : null,
    current_owner_id: me?.id ?? null,
    transfer_id: transferId,
  }).select("id").single();
  if (mErr) return NextResponse.json({ message: mErr.message }, { status: 400 });

  // Attach the new matter to its line on the transfer's service checklist (063),
  // so the umbrella shows progress without anyone having to link the two by hand.
  // Best-effort on purpose: a checklist that has not been created, or a service
  // with no line item, must not fail the matter creation.
  if (adoptLineId) {
    await admin
      .from("transfer_services")
      .update({ matter_id: matter.id })
      .eq("id", adoptLineId)
      .is("matter_id", null);
  }

  // A COO matter is a two-sided transaction: it always has a seller (current
  // owner) and a buyer (new owner), each with their own identity documents and
  // their own document slots keyed on (matter, party, type).
  //
  // Until now this route created NO matter_parties at all — only /onboard and
  // the partner refer flow did. That was invisible while every matter arrived
  // through one of those, but a staff-created COO matter came out with no
  // parties, so the in-place intake rendered no buyer or seller section and
  // there was nowhere to file either side's FICA. Seed the two shells here so
  // the matter is usable the moment it is created; details are filled in via
  // Edit on the parties card, or by the client through the onboarding link.
  //
  // The shells carry the role word as their name because `chk_party_name`
  // rejects a nameless party. ⚠️ That placeholder is a real name field — if a
  // council pack were generated before the party is captured it would read
  // "Seller". Staff replace it via Edit on the parties card, and the buyer/seller
  // details captured on the creation form (below) are written straight in, so a
  // matter created with details never shows the placeholder at all.
  if (serviceCode.toUpperCase() === "COO") {
    const partyShell = (role: "seller" | "buyer", d?: PartyInput) => {
      const et = d?.entity_type ?? "natural_person";
      const person = composeFullName(d?.first_name, d?.last_name);
      const business = (d?.business_name ?? "").trim();
      const fallback = role === "seller" ? "Seller" : "Buyer";
      return {
        matter_id: matter.id,
        role,
        entity_type: et,
        first_name: et === "natural_person" ? d?.first_name?.trim() || null : null,
        last_name: et === "natural_person" ? d?.last_name?.trim() || null : null,
        full_name: et === "natural_person" ? person || fallback : null,
        business_name: et !== "natural_person" ? business || fallback : null,
        id_number: d?.id_number?.trim() || null,
        email: d?.email?.trim().toLowerCase() || null,
        cell: d?.cell?.trim() || null,
      };
    };
    const seed = [partyShell("seller", body.seller), partyShell("buyer", body.buyer)];

    // Since 2026-08-06 a party with real details also gets a real CLIENT record,
    // so it carries a FICA vault and is reusable on the next matter.
    //
    // ⚠️ Only when a real name was supplied. A shell still carries the role word
    // as its name (chk_party_name rejects a nameless party), and turning that
    // into a client record would create an actual client called "Seller" —
    // strictly worse than the placeholder, because it would then be offered in
    // every client picker and matched by the deduplicator forever after.
    for (const p of seed) {
      const placeholder = p.role === "seller" ? "Seller" : "Buyer";
      const name = p.entity_type === "natural_person" ? p.full_name : p.business_name;
      if (!name || name === placeholder) continue;

      const made = await findOrCreateClientForParty(admin, {
        entityType: p.entity_type as "natural_person" | "business" | "trust",
        fullName: p.full_name,
        businessName: p.business_name,
        idNumber: p.id_number,
        email: p.email,
        cell: p.cell,
      });
      // Non-fatal by design: the party row is still correct without the link,
      // and failing the whole matter creation over it would be a worse trade.
      if (made.ok) (p as Record<string, unknown>).client_id = made.clientId;
      else console.error("client record for", p.role, "failed:", made.error);
    }

    // Non-fatal: a matter without its party shells is recoverable (add them on
    // the matter), but a 500 here would strand an already-created matter.
    const { error: partyErr } = await admin.from("matter_parties").insert(seed);
    if (partyErr) console.error("COO party seed failed for matter", matter.id, partyErr.message);
  }

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
