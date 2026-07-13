import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionProfile } from "@/lib/auth";
import { isStaffRole, isPartnerRole } from "@/types";
import { rateLimit, clientIp } from "@/lib/ratelimit";

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
  const { error } = await admin.from("transfer_activities").insert({
    transfer_id: transferId,
    author_id: session!.profile!.id,
    author_label: isPartnerRole(role) ? "Partner" : "ConveyClear",
    activity_type: "post",
    body: text,
  });
  if (error) return NextResponse.json({ message: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
