import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { STAFF_ROLES, type UserRole } from "@/types";
import { notifyUsers } from "@/lib/notify";

export const runtime = "nodejs";

/**
 * ConveyClear reviews an attorney firm's transfer request (055).
 *
 * Approving creates the property transfer AND the firm's access grant, because
 * a transfer the requesting firm cannot see would be a strange thing to have
 * approved. Since 052 access comes from a grant row, not from
 * property_transfers.business_partner_id — the column is still written as the
 * primary-firm pointer, but it is the grant that actually opens the door.
 *
 * Declining requires a reason. A request that silently disappears teaches firms
 * to phone instead, which is the behaviour this whole flow exists to replace.
 */
async function requireStaff() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated", status: 401 as const };
  const { data: me } = await supabase
    .from("users")
    .select("id, role")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!me || !STAFF_ROLES.includes(me.role as UserRole)) {
    return { error: "Insufficient privilege", status: 403 as const };
  }
  return { callerId: me.id as string };
}

export async function POST(request: Request) {
  if (!rateLimit(`transfer-request-review:${clientIp(request)}`, 40, 60_000)) {
    return NextResponse.json({ message: "Too many requests." }, { status: 429 });
  }

  const auth = await requireStaff();
  if ("error" in auth) return NextResponse.json({ message: auth.error }, { status: auth.status });

  let body: { id?: string; action?: string; reference?: string; decline_reason?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
  }

  const id = (body.id ?? "").trim();
  const action = (body.action ?? "").trim();
  if (!id) return NextResponse.json({ message: "id is required" }, { status: 400 });
  if (action !== "approve" && action !== "decline") {
    return NextResponse.json({ message: "action must be approve or decline" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: req } = await admin
    .from("transfer_requests")
    .select("id, firm_id, requested_by, status, property_description, municipality, suggested_reference, notes")
    .eq("id", id)
    .maybeSingle();
  if (!req) return NextResponse.json({ message: "Request not found" }, { status: 404 });
  if (req.status !== "pending") {
    return NextResponse.json({ message: `This request was already ${req.status}.` }, { status: 409 });
  }

  const now = new Date().toISOString();

  if (action === "decline") {
    const reason = (body.decline_reason ?? "").trim();
    if (!reason) {
      return NextResponse.json({ message: "Give the firm a reason." }, { status: 400 });
    }
    const { error } = await admin
      .from("transfer_requests")
      .update({ status: "declined", reviewed_by: auth.callerId, reviewed_at: now, decline_reason: reason })
      .eq("id", id);
    if (error) return NextResponse.json({ message: error.message }, { status: 400 });

    await notifyUsers([req.requested_by], {
      type: "transfer_request",
      title: "Transfer request declined",
      body: reason,
      link: "/partner/transfers",
    });
    return NextResponse.json({ ok: true, status: "declined" });
  }

  // Approve. The reference is staff's call — the firm only ever "suggested" one,
  // and references follow ConveyClear's naming, not the firm's.
  const reference = (body.reference ?? req.suggested_reference ?? "").trim();
  if (!reference) {
    return NextResponse.json({ message: "A transfer reference is required." }, { status: 400 });
  }

  const { data: transfer, error: createError } = await admin
    .from("property_transfers")
    .insert({
      reference,
      status: "open",
      property_description: req.property_description,
      municipality: req.municipality,
      business_partner_id: req.firm_id,
      notes: req.notes,
      created_by: auth.callerId,
    })
    .select("id")
    .single();

  if (createError) {
    const taken = /uq_property_transfers_reference|duplicate key/i.test(createError.message);
    return NextResponse.json(
      { message: taken ? `Reference "${reference}" is already used by another transfer.` : createError.message },
      { status: 400 }
    );
  }

  // The grant is what actually gives the firm access (052). Written before the
  // request is marked approved so a failure here does not leave an approved
  // request pointing at a transfer its firm cannot open.
  const { error: grantError } = await admin.from("transfer_access_grants").insert({
    transfer_id: transfer.id,
    firm_id: req.firm_id,
    granted_by: auth.callerId,
    note: `Created from transfer request ${id}`,
  });
  if (grantError) {
    return NextResponse.json(
      { message: `Transfer created but access could not be granted: ${grantError.message}` },
      { status: 500 }
    );
  }

  const { error: updateError } = await admin
    .from("transfer_requests")
    .update({ status: "approved", reviewed_by: auth.callerId, reviewed_at: now, transfer_id: transfer.id })
    .eq("id", id);
  if (updateError) return NextResponse.json({ message: updateError.message }, { status: 400 });

  await notifyUsers([req.requested_by], {
    type: "transfer_request",
    title: "Transfer request approved",
    body: reference,
    link: `/partner/transfers/${transfer.id}`,
  });

  return NextResponse.json({ ok: true, status: "approved", transfer_id: transfer.id });
}
