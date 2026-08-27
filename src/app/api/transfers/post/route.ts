import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionProfile } from "@/lib/auth";
import { isStaffRole, isPartnerRole } from "@/types";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { logTransferActivity } from "@/lib/activity";
import { notifyTransferMessage } from "@/lib/notify";

export const runtime = "nodejs";

// Post to a property transfer's feed (migration 035) — the transaction's own
// conversation, distinct from any one matter inside it ("the bank's guarantee is
// late"). Staff and the owning attorney firm both post here; it is the ONLY
// messaging surface at transfer level, on purpose.
//
// Clients cannot reach it at all: authorisation runs through the caller's own RLS
// on property_transfers, and can_access_transfer (026) excludes clients by design
// — a transfer spans both sides of the deal.
export async function POST(request: Request) {
  if (!rateLimit(`transfer-post:${clientIp(request)}`, 30, 60_000)) {
    return NextResponse.json({ message: "Too many requests." }, { status: 429 });
  }

  const session = await getSessionProfile();
  const role = session?.profile?.role ?? null;
  if (!isStaffRole(role) && !isPartnerRole(role)) {
    return NextResponse.json({ message: "Insufficient privilege" }, { status: 403 });
  }

  let body: { transfer_id?: string; body?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
  }

  const transferId = body.transfer_id;
  const text = (body.body ?? "").trim();
  if (!transferId || !text) {
    return NextResponse.json({ message: "transfer_id and a message are required" }, { status: 400 });
  }

  // RLS returns the transfer only if the caller can access it.
  const supabase = await createClient();
  const { data: transfer } = await supabase
    .from("property_transfers")
    .select("id")
    .eq("id", transferId)
    .maybeSingle();
  if (!transfer) return NextResponse.json({ message: "Transfer not found or access denied" }, { status: 403 });

  const admin = createAdminClient();
  const { id, deduped } = await logTransferActivity(admin, {
    transferId,
    authorId: session!.profile!.id,
    authorLabel: isPartnerRole(role) ? "Partner" : "ConveyClear",
    activityType: "post",
    body: text,
  });
  // Unlike the best-effort feed entries elsewhere, the post IS this route — a
  // failure to write it has to surface. `deduped` is a success: the note is on the
  // feed, it was simply already there (a double-submitted click).
  if (!id) return NextResponse.json({ message: "Could not post to the transfer feed." }, { status: 400 });

  // Tell the other side (meeting 2026-08-24 — the conversation exists "to replace
  // email", and an unnotified message is what sends people back to email).
  //
  // Skipped on a dedupe: that is a double-submitted click, and the notification
  // for the first one has already gone. Best-effort by contract — the message is
  // written either way, and failing the request now would tell the sender their
  // post did not land when it did.
  if (!deduped) {
    await notifyTransferMessage({
      transferId,
      fromSide: isPartnerRole(role) ? "firm" : "conveyclear",
      authorName: session!.profile!.full_name?.trim() || (isPartnerRole(role) ? "The attorney" : "ConveyClear"),
      body: text,
      authorUserId: session!.profile!.id,
    });
  }

  return NextResponse.json({ ok: true, deduped });
}
