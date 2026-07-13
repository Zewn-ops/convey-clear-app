import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { STAFF_ROLES, type UserRole } from "@/types";
import { rateLimit, clientIp } from "@/lib/ratelimit";

export const runtime = "nodejs";

// Attach / detach a matter from its parent property transfer (migration 026).
//   POST { matter_id, transfer_id }        → link
//   POST { matter_id, transfer_id: null }  → unlink
// Staff-only. Both directions land on the matter's activity feed so the change
// is auditable from the matter, not just the transfer.

async function requireStaff() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated", status: 401 as const };
  const { data: me } = await supabase.from("users").select("id, role").eq("auth_user_id", user.id).maybeSingle();
  const role = (me?.role ?? null) as UserRole | null;
  if (!role || !STAFF_ROLES.includes(role)) return { error: "Insufficient privilege", status: 403 as const };
  return { callerId: me!.id as string };
}

export async function POST(request: Request) {
  if (!rateLimit(`transfer-link:${clientIp(request)}`, 60, 60_000)) {
    return NextResponse.json({ message: "Too many requests." }, { status: 429 });
  }
  const auth = await requireStaff();
  if ("error" in auth) return NextResponse.json({ message: auth.error }, { status: auth.status });

  let body: { matter_id?: string; transfer_id?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
  }

  const matterId = (body.matter_id ?? "").trim();
  if (!matterId) return NextResponse.json({ message: "matter_id is required" }, { status: 400 });

  // An empty string from a <select> means "no transfer" — normalise to null so
  // we never try to write "" into a uuid column.
  const transferId = (body.transfer_id ?? "").trim() || null;

  const admin = createAdminClient();

  let reference: string | null = null;
  if (transferId) {
    const { data: t } = await admin
      .from("property_transfers")
      .select("reference")
      .eq("id", transferId)
      .maybeSingle();
    if (!t) return NextResponse.json({ message: "That property transfer no longer exists." }, { status: 404 });
    reference = t.reference as string;
  }

  // The matter we're about to detach, so the OLD transfer's feed can record the
  // departure — after the update its transfer_id is gone and we'd have nothing to
  // attribute it to.
  const { data: before } = await admin
    .from("matters")
    .select("title, transfer_id")
    .eq("id", matterId)
    .maybeSingle();
  const previousTransferId = (before?.transfer_id as string | null) ?? null;
  const matterTitle = (before?.title as string | null) || "A matter";

  const { error } = await admin.from("matters").update({ transfer_id: transferId }).eq("id", matterId);
  if (error) return NextResponse.json({ message: error.message }, { status: 400 });

  await admin.from("matter_activities").insert({
    matter_id: matterId,
    author_id: auth.callerId,
    activity_type: "system",
    body: reference ? `Linked to property transfer ${reference}` : "Removed from its property transfer",
  });

  // Mirror it onto the transfer's own feed (035) — the transaction's history has
  // to be readable from the transfer, not only by opening each matter in turn.
  if (transferId) {
    await admin.from("transfer_activities").insert({
      transfer_id: transferId,
      author_id: auth.callerId,
      activity_type: "matter_linked",
      body: `${matterTitle} was linked to this transfer`,
    });
  }
  if (previousTransferId && previousTransferId !== transferId) {
    await admin.from("transfer_activities").insert({
      transfer_id: previousTransferId,
      author_id: auth.callerId,
      activity_type: "matter_unlinked",
      body: `${matterTitle} was removed from this transfer`,
    });
  }

  return NextResponse.json({ ok: true, transfer_id: transferId });
}
