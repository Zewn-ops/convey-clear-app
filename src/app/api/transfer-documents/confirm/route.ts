import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { TRANSFER_DOCS_BUCKET } from "@/lib/storage";
import { logTransferActivity } from "@/lib/activity";
import { canonicalTransferDocumentName } from "@/lib/doc-naming";
import { requireTransferUploader } from "@/lib/transfer-upload-access";
import { notifyStaff } from "@/lib/notify";

export const runtime = "nodejs";

// Record a transfer_documents row after the browser uploaded to the signed URL.
// Staff and the attorney firm (2026-08-11 §112). Supports replace-with-history
// the same way the client vault does (032): the new row points back at the one it
// supersedes; the old file is never touched, because matters that already reused
// it point at that same object.
export async function POST(request: Request) {
  const supabase = await createClient();
  const admin = createAdminClient();
  const who = await requireTransferUploader(supabase, admin);
  if (!who.ok) return NextResponse.json({ message: who.message }, { status: who.status });

  let body: {
    transfer_id?: string;
    storage_path?: string;
    document_type?: string;
    file_name?: string;
    mime_type?: string;
    size_bytes?: number;
    replaces_id?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
  }

  const { transfer_id, storage_path } = body;
  if (!transfer_id || !storage_path) {
    return NextResponse.json({ message: "transfer_id and storage_path are required" }, { status: 400 });
  }
  // Path must live under this transfer's folder (defence in depth alongside RLS).
  if (!storage_path.startsWith(`${transfer_id}/`)) {
    return NextResponse.json({ message: "storage_path does not belong to this transfer" }, { status: 400 });
  }

  const { data: transfer } = await supabase
    .from("property_transfers")
    .select("id")
    .eq("id", transfer_id)
    .maybeSingle();
  if (!transfer) return NextResponse.json({ message: "Transfer not found or access denied" }, { status: 403 });

  const replacesId = body.replaces_id || null;
  if (replacesId) {
    const { data: prev } = await admin
      .from("transfer_documents")
      .select("id, transfer_id, uploaded_by, visibility")
      .eq("id", replacesId)
      .maybeSingle();
    if (!prev || prev.transfer_id !== transfer_id) {
      return NextResponse.json(
        { message: "The document being replaced does not belong to this transfer" },
        { status: 400 }
      );
    }

    // 🔒 A firm may only supersede its OWN uploads.
    //
    // Replacing marks the old row 'superseded' and the new one lands 'internal'
    // (058). So without this an attorney could take a document ConveyClear had
    // already SHARED with the buyer and seller, and — by replacing it — both
    // retire the shared version and put an unshared file in its place. That is
    // an unshare and a substitution performed by someone the decision only gave
    // authorship to. §112 has staff controlling visibility; superseding a staff
    // document would route around that.
    //
    // Staff are unrestricted: deciding what supersedes what is their job.
    if (!who.isStaff) {
      const { data: prevUploader } = await admin
        .from("users")
        .select("business_partner_id")
        .eq("id", (prev as { uploaded_by: string | null }).uploaded_by ?? "")
        .maybeSingle();
      const prevFirmId = (prevUploader as { business_partner_id: string | null } | null)?.business_partner_id ?? null;
      if (!prevFirmId || prevFirmId !== who.firmId) {
        return NextResponse.json(
          { message: "You can only replace a document your own firm uploaded." },
          { status: 403 }
        );
      }
    }
  }

  // Canonical name — "Deed Search — ERF 1234 Waterkloof — 2026-07-22.pdf".
  // Best-effort, exactly as on the matter side: the file is already in storage by
  // the time we get here, so a naming failure must not lose the upload.
  const docType = body.document_type || "other";
  let displayName = body.file_name || null;
  try {
    displayName = await canonicalTransferDocumentName(admin, {
      transferId: transfer_id,
      documentType: docType,
      originalFileName: body.file_name || null,
    });
  } catch (e) {
    console.error("[transfer-documents/confirm] canonical naming failed", e);
  }

  const row: Record<string, unknown> = {
    transfer_id,
    document_type: docType,
    storage_bucket: TRANSFER_DOCS_BUCKET,
    storage_path,
    file_name: displayName,
    original_file_name: body.file_name || null,
    mime_type: body.mime_type || null,
    size_bytes: body.size_bytes || null,
    supersedes_id: replacesId,
    uploaded_by: who.userId,
  };

  let { data: doc, error } = await admin
    .from("transfer_documents")
    .insert(row)
    .select("id")
    .single();

  // 42703 = column does not exist. Migration 041 adds original_file_name to
  // transfer_documents; until it is applied, drop the column and insert anyway so
  // deploying ahead of the migration degrades to "no provenance" rather than
  // "uploads fail". Same play as 040 on the matter side.
  if (error && (error as { code?: string }).code === "42703") {
    const { original_file_name: _dropped, ...legacyRow } = row;
    ({ data: doc, error } = await admin
      .from("transfer_documents")
      .insert(legacyRow)
      .select("id")
      .single());
  }
  if (error || !doc) {
    return NextResponse.json({ message: error?.message ?? "Insert failed" }, { status: 400 });
  }

  if (replacesId) {
    await admin.from("transfer_documents").update({ status: "superseded" }).eq("id", replacesId);
  }

  const label = displayName || body.file_name || docType || "document";
  await logTransferActivity(admin, {
    transferId: transfer_id,
    authorId: who.userId,
    activityType: "document_upload",
    body: replacesId ? `Replaced transfer document: ${label}` : `Added transfer document: ${label}`,
  });

  // §112 hands the second half to staff: they decide who sees the document. A
  // firm's upload therefore has to reach someone — landing 'internal' with
  // nobody told is a document that sits invisible until the attorney chases it.
  // Staff uploads stay quiet; the uploader is already the person who would act.
  if (!who.isStaff) {
    await notifyStaff({
      type: "transfer_document",
      title: "Attorney uploaded a transfer document",
      body: `${label} — review and release it to the buyer and seller.`,
      link: `/admin/property-transfers/${transfer_id}`,
    });
  }

  return NextResponse.json({ ok: true, transfer_document_id: doc.id, replaced: Boolean(replacesId) });
}
