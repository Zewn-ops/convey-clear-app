import { NextResponse } from "next/server";
import { requirePartner } from "@/lib/partner";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { logMatterActivity, logTransferActivity } from "@/lib/activity";

export const runtime = "nodejs";

// A partner attaches / detaches one of its OWN matters to one of its OWN
// transfers (Meeting 2 — a partner-created transfer is a dead end without this;
// they refer matters via /partner/refer, and this is how those matters join the
// transaction).
//   POST { matter_id, transfer_id }        → link
//   POST { matter_id, transfer_id: null }  → unlink
//
// Both sides are checked against the caller's firm with the SERVICE ROLE, not
// RLS: the write itself is a service-role write, so the guard has to be explicit.
// A partner may only move a matter they own, and only onto a transfer they own —
// otherwise a partner could pull another firm's matter onto their transfer, or
// file their matter under a transfer that isn't theirs.

// A matter belongs to the firm if it links the firm directly (portal-first COO
// matters set matters.business_partner_id, client_id null) OR via its client.
async function matterBelongsToFirm(
  admin: ReturnType<typeof createAdminClient>,
  matterId: string,
  partnerId: string
): Promise<{ ok: boolean; title: string | null; currentTransfer: string | null }> {
  const { data: m } = await admin
    .from("matters")
    .select("id, title, transfer_id, business_partner_id, client_id, clients(business_partner_id)")
    .eq("id", matterId)
    .maybeSingle();
  if (!m) return { ok: false, title: null, currentTransfer: null };
  const direct = (m as { business_partner_id?: string | null }).business_partner_id ?? null;
  const viaClient = (m.clients as { business_partner_id?: string | null } | null)?.business_partner_id ?? null;
  return {
    ok: direct === partnerId || viaClient === partnerId,
    title: (m.title as string | null) ?? "A matter",
    currentTransfer: (m.transfer_id as string | null) ?? null,
  };
}

async function transferBelongsToFirm(
  admin: ReturnType<typeof createAdminClient>,
  transferId: string,
  partnerId: string
): Promise<string | null> {
  const { data: t } = await admin
    .from("property_transfers")
    .select("reference, business_partner_id")
    .eq("id", transferId)
    .maybeSingle();
  if (!t || t.business_partner_id !== partnerId) return null;
  return t.reference as string;
}

export async function POST(request: Request) {
  if (!rateLimit(`partner-transfer-link:${clientIp(request)}`, 60, 60_000)) {
    return NextResponse.json({ message: "Too many requests." }, { status: 429 });
  }
  const auth = await requirePartner();
  if ("error" in auth) return NextResponse.json({ message: auth.error }, { status: auth.status });

  let body: { matter_id?: string; transfer_id?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
  }

  const matterId = (body.matter_id ?? "").trim();
  if (!matterId) return NextResponse.json({ message: "matter_id is required" }, { status: 400 });
  const transferId = (body.transfer_id ?? "").trim() || null;

  const admin = createAdminClient();

  // The matter must be the caller's.
  const matter = await matterBelongsToFirm(admin, matterId, auth.partnerId);
  if (!matter.ok) {
    return NextResponse.json({ message: "That matter is not one your firm manages." }, { status: 403 });
  }
  const previousTransferId = matter.currentTransfer;

  // The destination transfer (when linking) must ALSO be the caller's. The old
  // transfer being detached from is necessarily theirs too — it only got there
  // through this same guard.
  let reference: string | null = null;
  if (transferId) {
    reference = await transferBelongsToFirm(admin, transferId, auth.partnerId);
    if (!reference) {
      return NextResponse.json({ message: "That property transfer is not one your firm owns." }, { status: 403 });
    }
  }

  const { error } = await admin.from("matters").update({ transfer_id: transferId }).eq("id", matterId);
  if (error) return NextResponse.json({ message: error.message }, { status: 400 });

  await logMatterActivity(admin, {
    matterId,
    authorId: auth.userId,
    activityType: "system",
    body: reference ? `Linked to property transfer ${reference}` : "Removed from its property transfer",
  });

  if (transferId) {
    await logTransferActivity(admin, {
      transferId,
      authorId: auth.userId,
      activityType: "matter_linked",
      body: `${matter.title} was linked to this transfer`,
    });
  }
  if (previousTransferId && previousTransferId !== transferId) {
    await logTransferActivity(admin, {
      transferId: previousTransferId,
      authorId: auth.userId,
      activityType: "matter_unlinked",
      body: `${matter.title} was removed from this transfer`,
    });
  }

  return NextResponse.json({ ok: true, transfer_id: transferId });
}
