import { NextResponse } from "next/server";
import { requirePartner } from "@/lib/partner";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { ensureTransferServices } from "@/lib/transfer-services-init";

export const runtime = "nodejs";

// A partner firm creates a property transfer for ITSELF (Meeting 2, 2026-07-16:
// Jukka could only refer matters on the demo — the business-partner role had no
// transfer-create path at all, which read to him as a permission bug but was a
// missing feature). This is that feature.
//
// Same shape as the staff route (api/admin/property-transfers) but locked down:
//   • business_partner_id is FORCED to the caller's own firm. A partner can
//     never create a transfer owned by a different firm — that firm would then
//     get read access to it via can_access_transfer.
//   • seller/buyer, if given, must be clients OF the caller's firm. Otherwise a
//     partner could pull an arbitrary client id (they appear in URLs) onto their
//     transfer and, worse, later reach that client's matters through it.
//   • the estate agent is not settable here — a partner sets up their own
//     transaction; cross-firm agent linking stays a staff action for now.
//
// Written with the service role after authorisation (property_transfers grants
// partners SELECT only — writes are route-authorised, same as every other
// partner mutation). No migration: can_access_transfer already lets the firm
// read a transfer whose business_partner_id is theirs, so it appears the instant
// it is created.
const STATUSES = ["open", "registered", "cancelled", "on_hold"];

function clean(v?: string | null): string | null {
  const s = (v ?? "").trim();
  return s.length ? s : null;
}

function referenceTaken(message: string): boolean {
  return /uq_property_transfers_reference|duplicate key/i.test(message);
}

// 🔴 DISABLED 2026-08-07 — Meeting 2 (2026-08-06) moved transfer creation behind
// ConveyClear so one vetted client database is maintained without firms reaching
// each other's contacts (§84). Firms now lodge a request instead:
// POST /api/partner/transfer-requests → /admin/transfer-requests → approved.
//
// ⚠️ THIS REVERSES THE 2026-07-16 DECISION that added this route, so it is
// disabled rather than deleted: delete the guard below and it works again.
// Confirm with Jukka before removing the code — he asked for direct create
// three weeks ago and may not have intended to give it up.
const PARTNER_DIRECT_CREATE_DISABLED = true;

export async function POST(request: Request) {
  if (!rateLimit(`partner-transfer:${clientIp(request)}`, 30, 60_000)) {
    return NextResponse.json({ message: "Too many requests." }, { status: 429 });
  }
  if (PARTNER_DIRECT_CREATE_DISABLED) {
    return NextResponse.json(
      {
        message:
          "ConveyClear now opens property transfers. Send us the details and we will set it up.",
        request_instead: "/partner/transfers/new",
      },
      { status: 403 }
    );
  }
  const auth = await requirePartner();
  if ("error" in auth) {
    return NextResponse.json({ message: auth.error }, { status: auth.status });
  }

  let body: {
    reference?: string;
    property_description?: string;
    municipality?: string;
    status?: string;
    seller_client_id?: string;
    buyer_client_id?: string;
    notes?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
  }

  const reference = clean(body.reference);
  if (!reference) return NextResponse.json({ message: "A transfer reference is required." }, { status: 400 });

  const status = clean(body.status) ?? "open";
  if (!STATUSES.includes(status)) return NextResponse.json({ message: "Unknown status." }, { status: 400 });

  const sellerId = clean(body.seller_client_id);
  const buyerId = clean(body.buyer_client_id);
  if (sellerId && sellerId === buyerId) {
    return NextResponse.json({ message: "Seller and buyer cannot be the same client." }, { status: 400 });
  }

  const admin = createAdminClient();

  // Any seller/buyer must belong to the caller's OWN firm — checked against the
  // service-role view of clients, so a client id that isn't theirs is rejected
  // rather than silently attached.
  for (const [label, id] of [["Seller", sellerId], ["Buyer", buyerId]] as const) {
    if (!id) continue;
    const { data: c } = await admin
      .from("clients")
      .select("id, business_partner_id")
      .eq("id", id)
      .maybeSingle();
    if (!c || c.business_partner_id !== auth.partnerId) {
      return NextResponse.json(
        { message: `The selected ${label.toLowerCase()} is not one of your firm's clients.` },
        { status: 403 }
      );
    }
  }

  const { data: transfer, error } = await admin
    .from("property_transfers")
    .insert({
      reference,
      status,
      property_description: clean(body.property_description),
      municipality: clean(body.municipality),
      seller_client_id: sellerId,
      buyer_client_id: buyerId,
      notes: clean(body.notes),
      // 🔒 Forced, never taken from the body.
      business_partner_id: auth.partnerId,
      created_by: auth.userId,
    })
    .select("*")
    .single();

  if (error) {
    const message = referenceTaken(error.message)
      ? `Reference "${reference}" is already used by another transfer.`
      : error.message;
    return NextResponse.json({ message }, { status: 400 });
  }

  // Every transfer gets its checklist on creation (Zewn, 2026-08-28). Best
  // effort — the "Create the service list" button remains as the fallback.
  await ensureTransferServices(admin, transfer.id, auth.userId);

  return NextResponse.json({ ok: true, transfer });
}
