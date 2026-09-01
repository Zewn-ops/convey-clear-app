import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { type UserRole } from "@/types";
import { notifyUsers } from "@/lib/notify";
import { requireStaff } from "@/lib/staff";
import { logTransferActivity } from "@/lib/activity";
import { createTransferFromRequest } from "@/lib/transfer-from-request";

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
    .select("id, firm_id, requested_by, status, property_description, municipality, suggested_reference, notes, transfer_id")
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

  // Approve. The FIRM's reference is the transfer's reference (2026-08-11 §78,
  // confirmed by Zewn 2026-08-14: "their unique code and it is what we use to
  // title the property transfer"). Staff may still override — a clash, a typo —
  // but the firm's code is the default, not a suggestion to be improved on.
  //
  // Reversal of the earlier reading: this route used to treat the reference as
  // staff's to invent, following ConveyClear's {MUNI}_{SERVICE}_… convention.
  // That convention belongs to MATTER titles; a transfer carries the firm's file
  // reference. Details §74/§98 described staff assigning one, but those narrate
  // the demo as it worked on the day — §78 is the decision.
  const reference = (body.reference ?? req.suggested_reference ?? "").trim();
  if (!reference) {
    return NextResponse.json({ message: "A transfer reference is required." }, { status: 400 });
  }

  // 🔴 THE TRANSFER USUALLY ALREADY EXISTS. Since 2026-09-01 a firm's submission
  // creates it in `draft` (083), so approval is a state change rather than a
  // creation — Jukka: "instead of us approving it before it gets created, it
  // gets created in a draft state and then we approve it."
  //
  // A request lodged BEFORE that shipped has no transfer, so the build path
  // stays. Both go through createTransferFromRequest, so an approved transfer is
  // the same object either way.
  let transferId = (req as { transfer_id?: string | null }).transfer_id ?? null;

  if (transferId) {
    const { error: openError } = await admin
      .from("property_transfers")
      .update({ status: "open" })
      .eq("id", transferId)
      .eq("status", "draft");
    if (openError) return NextResponse.json({ message: openError.message }, { status: 400 });
    await logTransferActivity(admin, {
      transferId,
      activityType: "status_change",
      body: "Transfer approved by ConveyClear and opened.",
      authorId: auth.callerId,
      authorLabel: "ConveyClear",
    });
  } else {
    const built = await createTransferFromRequest(admin, req, reference, auth.callerId, "open");
    if (!built.ok) {
      return NextResponse.json({ message: built.message }, { status: built.status });
    }
    transferId = built.transferId;
  }

  const transfer = { id: transferId };

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
