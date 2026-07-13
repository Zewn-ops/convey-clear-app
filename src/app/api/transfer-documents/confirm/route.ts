import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { TRANSFER_DOCS_BUCKET } from "@/lib/storage";
import { STAFF_ROLES, type UserRole } from "@/types";

export const runtime = "nodejs";

// Record a transfer_documents row after the browser uploaded to the signed URL.
// Staff-only. Supports replace-with-history the same way the client vault does
// (032): the new row points back at the one it supersedes; the old file is never
// touched, because matters that already reused it point at that same object.
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ message: "Not authenticated" }, { status: 401 });
  const { data: me } = await supabase.from("users").select("id, role").eq("auth_user_id", user.id).maybeSingle();
  if (!me || !STAFF_ROLES.includes(me.role as UserRole)) {
    return NextResponse.json({ message: "Insufficient privilege" }, { status: 403 });
  }

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

  const admin = createAdminClient();

  const replacesId = body.replaces_id || null;
  if (replacesId) {
    const { data: prev } = await admin
      .from("transfer_documents")
      .select("id, transfer_id")
      .eq("id", replacesId)
      .maybeSingle();
    if (!prev || prev.transfer_id !== transfer_id) {
      return NextResponse.json(
        { message: "The document being replaced does not belong to this transfer" },
        { status: 400 }
      );
    }
  }

  const { data: doc, error } = await admin
    .from("transfer_documents")
    .insert({
      transfer_id,
      document_type: body.document_type || "other",
      storage_bucket: TRANSFER_DOCS_BUCKET,
      storage_path,
      file_name: body.file_name || null,
      mime_type: body.mime_type || null,
      size_bytes: body.size_bytes || null,
      supersedes_id: replacesId,
      uploaded_by: me.id,
    })
    .select("id")
    .single();
  if (error) return NextResponse.json({ message: error.message }, { status: 400 });

  if (replacesId) {
    await admin.from("transfer_documents").update({ status: "superseded" }).eq("id", replacesId);
  }

  return NextResponse.json({ ok: true, transfer_document_id: doc.id, replaced: Boolean(replacesId) });
}
