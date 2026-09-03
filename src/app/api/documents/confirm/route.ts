import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { MATTER_DOCS_BUCKET } from "@/lib/storage";
import { supersedeSlot, syncMatterDocToTransfer, isUndefinedColumn } from "@/lib/documents";
import { canonicalDocumentName } from "@/lib/doc-naming";
import { logMatterActivity, logTransferActivity } from "@/lib/activity";

export const runtime = "nodejs";

// Records a documents row AFTER the browser has uploaded the file to the signed
// URL from /api/documents/signed-upload. Re-checks matter access (RLS) and that
// the storage path belongs to the matter, then inserts via service role.
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ message: "Not authenticated" }, { status: 401 });

  const { data: me } = await supabase
    .from("users")
    .select("id, role")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  let body: {
    matter_id?: string;
    storage_path?: string;
    document_type?: string;
    file_name?: string;
    /** An uploader-chosen name, from the panel's Rename control. */
    display_name?: string;
    mime_type?: string;
    size_bytes?: number;
    matter_party_id?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
  }

  const { matter_id, storage_path } = body;
  if (!matter_id || !storage_path) {
    return NextResponse.json({ message: "matter_id and storage_path are required" }, { status: 400 });
  }
  // Path must live under this matter's folder (defence in depth alongside RLS).
  if (!storage_path.startsWith(`${matter_id}/`)) {
    return NextResponse.json({ message: "storage_path does not belong to this matter" }, { status: 400 });
  }

  const { data: matter } = await supabase.from("matters").select("id").eq("id", matter_id).maybeSingle();
  if (!matter) return NextResponse.json({ message: "Matter not found or access denied" }, { status: 403 });

  const uploadedBy =
    me?.role === "business_partner" ? "attorney" : me?.role === "client" ? "client" : "staff";

  const admin = createAdminClient();
  const documentType = body.document_type || "other";
  const matterPartyId = body.matter_party_id || null;

  // This upload becomes the slot's current document; demote whatever was there.
  let replaced: string[];
  try {
    replaced = await supersedeSlot(admin, { matterId: matter_id, matterPartyId, documentType });
  } catch (e) {
    return NextResponse.json({ message: (e as Error).message }, { status: 400 });
  }

  // Canonical display name — "Certified ID — Peter van der Merwe — 2026-07-20"
  // rather than "A4 - 1.pdf". Best-effort: a naming failure must not cost the
  // user an upload that has already reached storage.
  let displayName = body.file_name || null;
  // 🔴 AN OVERRIDE WINS, and is the only thing that does. The matter upload panel
  // shows the canonical name live and turns it into an input behind a pencil, so
  // the discipline holds by default and anyone with a reason to deviate still
  // can — the same bargain the transfer panel struck (2026-08-28). Without this
  // the panel would show a name it could not actually save.
  const override = (body.display_name ?? "").trim();
  if (override) {
    displayName = override;
  } else {
    try {
      displayName = await canonicalDocumentName(admin, {
        matterId: matter_id,
        matterPartyId,
        documentType,
        originalFileName: body.file_name || null,
      });
    } catch (e) {
      console.error("[documents/confirm] canonical naming failed", e);
    }
  }

  const row = {
    matter_id,
    document_type: documentType,
    document_status: "provided",
    storage_bucket: MATTER_DOCS_BUCKET,
    storage_path,
    file_name: displayName,
    original_file_name: body.file_name || null,
    mime_type: body.mime_type || null,
    size_bytes: body.size_bytes || null,
    matter_party_id: matterPartyId,
    uploaded_by: uploadedBy,
    // WHO uploaded, as a real reference. uploaded_by above is a text category
    // ('staff' | 'attorney' | 'client'), so it cannot tell an admin apart from a
    // runner — which is exactly what the approval gate (042) has to decide on,
    // and what the review queue has to display. Migration 042 adds this column.
    uploaded_by_user_id: me?.id ?? null,
  };

  let { data: doc, error } = await admin.from("documents").insert(row).select("id").single();

  // Deployed ahead of migration 040 or 042? Drop the new columns and carry on
  // rather than failing an upload whose file is already in storage. Both are
  // dropped together because PostgREST names only the first missing column, so
  // retrying them one at a time would cost an extra round trip per column and
  // still land here.
  //
  // ⚠️ Losing uploaded_by_user_id means 042's trigger falls back to the text
  // category, which still gates 'staff' uploads correctly — the gate degrades to
  // "we know a staff member did it, not which one", never to "ungated".
  if (error && isUndefinedColumn(error)) {
    const { original_file_name: _dropped, uploaded_by_user_id: _dropped2, ...legacyRow } = row;
    ({ data: doc, error } = await admin.from("documents").insert(legacyRow).select("id").single());
  }
  if (error || !doc) {
    return NextResponse.json({ message: error?.message ?? "Could not record the document" }, { status: 400 });
  }

  // Best-effort activity entry, de-duplicated (036): a re-fired upload confirm
  // must not post the same "Document uploaded: X" line twice.
  const label = displayName || documentType || "file";
  await logMatterActivity(admin, {
    matterId: matter_id,
    authorId: me?.id ?? null,
    activityType: "document_upload",
    body: replaced.length ? `Document replaced: ${label}` : `Document uploaded: ${label}`,
  });

  // Two-way sync: mirror the upload onto the matter's property transfer.
  // Best-effort BY DESIGN — the file is uploaded and the documents row is
  // written by this point, so a failure here must not fail the request and
  // strand the user with a file the app says it never received.
  let syncedToTransfer = false;
  try {
    const sync = await syncMatterDocToTransfer(admin, {
      documentId: doc.id,
      matterId: matter_id,
      documentType,
      fileName: displayName,
      mimeType: body.mime_type || null,
      sizeBytes: body.size_bytes || null,
      storageBucket: MATTER_DOCS_BUCKET,
      storagePath: storage_path,
      uploadedById: me?.id ?? null,
    });
    syncedToTransfer = sync.synced;
    // Only announce a document that is genuinely new to the transfer.
    if (sync.synced && !sync.deduped && sync.transferId) {
      await logTransferActivity(admin, {
        transferId: sync.transferId,
        authorId: me?.id ?? null,
        activityType: "document_upload",
        body: `${label} was added from a linked matter`,
      });
    }
  } catch (e) {
    console.error("[documents/confirm] transfer sync failed", e);
  }

  return NextResponse.json({
    ok: true,
    document_id: doc.id,
    replaced: replaced.length,
    synced_to_transfer: syncedToTransfer,
  });
}
