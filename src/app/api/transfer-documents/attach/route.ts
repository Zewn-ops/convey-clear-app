import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { supersedeSlot } from "@/lib/documents";
import { getSessionProfile } from "@/lib/auth";
import { logMatterActivity } from "@/lib/activity";
import { isStaffRole, isPartnerRole } from "@/types";

export const runtime = "nodejs";

// Reuse a TRANSFER-level document on one of the transfer's matters, without
// re-uploading (migration 034). This is the payoff of the whole transfer hub: the
// deed search is fetched once for the property, then serves the PRC, the COO and
// the refund matter instead of being uploaded three times.
//
// The documents row carries the transfer bucket + path, so it is the SAME storage
// object — not a copy — and every existing viewer keeps working (signedDocUrls is
// bucket-aware).
export async function POST(request: Request) {
  if (!rateLimit(`transfer-doc-attach:${clientIp(request)}`, 60, 60_000)) {
    return NextResponse.json({ message: "Too many requests." }, { status: 429 });
  }

  const session = await getSessionProfile();
  const role = session?.profile?.role ?? null;
  if (!isStaffRole(role) && !isPartnerRole(role)) {
    return NextResponse.json({ message: "Insufficient privilege" }, { status: 403 });
  }

  let body: { transfer_document_id?: string; matter_id?: string; matter_party_id?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
  }
  const { transfer_document_id, matter_id } = body;
  const matterPartyId = body.matter_party_id || null;
  if (!transfer_document_id || !matter_id) {
    return NextResponse.json({ message: "transfer_document_id and matter_id are required" }, { status: 400 });
  }

  const supabase = await createClient();

  // The caller must be able to see the matter…
  const { data: matter } = await supabase
    .from("matters")
    .select("id, transfer_id")
    .eq("id", matter_id)
    .maybeSingle();
  if (!matter) return NextResponse.json({ message: "Matter not found or access denied" }, { status: 403 });

  // …and the transfer document (RLS: can_access_transfer).
  const { data: tdoc } = await supabase
    .from("transfer_documents")
    .select("id, transfer_id, document_type, file_name, mime_type, size_bytes, storage_bucket, storage_path, status")
    .eq("id", transfer_document_id)
    .maybeSingle();
  if (!tdoc) return NextResponse.json({ message: "Transfer document not found or access denied" }, { status: 403 });

  // 🔒 The document may only land on a matter INSIDE its own transfer. Without
  // this, a caller who can reach two transactions could pull one transaction's
  // documents onto the other's matter — leaking the counterparty's paperwork
  // across deals. Access to each side separately is not access to the join.
  if (!matter.transfer_id || matter.transfer_id !== tdoc.transfer_id) {
    return NextResponse.json(
      { message: "That matter is not part of this property transfer." },
      { status: 403 }
    );
  }

  if ((tdoc.status ?? "current") !== "current") {
    return NextResponse.json(
      { message: "That document is no longer current — reuse the latest version instead." },
      { status: 409 }
    );
  }

  const admin = createAdminClient();

  // Already on this matter? Idempotent re-click.
  //
  // 🐛 This check used to include the PARTY, and that is what put the same file on
  // one matter twice. The intake renders "From transfer" in two places for the same
  // document — once in the "From this property transfer" panel (matter-level, party
  // NULL) and again on a matching slot row (party-scoped) — as two separate
  // components with two separate busy flags. Keyed on the party, the second attach
  // read as a different slot and inserted a second row for the same storage object.
  // Migration 030's slot index did not catch it either: it exempts document_type
  // 'other', which is what the duplicated 'A4 - 2.pdf' was.
  //
  // A transfer document is PROPERTY-level (a deed search is never a person's
  // document), so it belongs on a matter at most once, whatever slot the click came
  // from. Migration 036 enforces the same rule as a unique index — the check below
  // still races, and only the index actually wins that race.
  const { data: existing } = await admin
    .from("documents")
    .select("id")
    .eq("matter_id", matter_id)
    .eq("transfer_document_id", transfer_document_id)
    .neq("document_status", "superseded")
    .maybeSingle();
  if (existing) return NextResponse.json({ ok: true, document_id: existing.id, deduped: true });

  // One current document per (matter, party, type) slot — migration 030.
  const documentType = tdoc.document_type || "other";
  let replaced: string[];
  try {
    replaced = await supersedeSlot(admin, { matterId: matter_id, matterPartyId, documentType });
  } catch (e) {
    return NextResponse.json({ message: (e as Error).message }, { status: 400 });
  }

  const uploadedBy = isPartnerRole(role) ? "attorney" : "staff";

  const { data: doc, error } = await admin
    .from("documents")
    .insert({
      matter_id,
      matter_party_id: matterPartyId,
      document_type: documentType,
      document_status: "provided",
      storage_bucket: tdoc.storage_bucket,
      storage_path: tdoc.storage_path,
      file_name: tdoc.file_name,
      mime_type: tdoc.mime_type,
      size_bytes: tdoc.size_bytes,
      transfer_document_id,
      uploaded_by: uploadedBy,
    })
    .select("id")
    .single();

  // The loser of a genuine race (two clicks in flight at once) lands here on the
  // 036 index instead of inserting a second row. That is not an error to show a
  // human: the document IS on the matter, which is what they asked for.
  if (error) {
    if (error.code === "23505") {
      const { data: winner } = await admin
        .from("documents")
        .select("id")
        .eq("matter_id", matter_id)
        .eq("transfer_document_id", transfer_document_id)
        .neq("document_status", "superseded")
        .maybeSingle();
      if (winner) return NextResponse.json({ ok: true, document_id: winner.id, deduped: true });
    }
    return NextResponse.json({ message: error.message }, { status: 400 });
  }

  const label = tdoc.file_name || documentType || "file";
  await logMatterActivity(admin, {
    matterId: matter_id,
    authorId: session?.profile?.id ?? null,
    activityType: "document_upload",
    body: replaced.length
      ? `Reused transfer document (replaced the previous one): ${label}`
      : `Reused transfer document: ${label}`,
  });

  return NextResponse.json({ ok: true, document_id: doc.id, replaced: replaced.length });
}
