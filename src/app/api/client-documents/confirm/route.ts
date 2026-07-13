import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { CLIENT_DOCS_BUCKET } from "@/lib/storage";
import { STAFF_ROLES, type UserRole } from "@/types";

export const runtime = "nodejs";

// Records a client_documents row after the browser uploaded the file to the
// signed URL from /api/client-documents/signed-upload. Staff-only; the storage
// path must live under this client's folder.
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ message: "Not authenticated" }, { status: 401 });
  const { data: me } = await supabase.from("users").select("id, role").eq("auth_user_id", user.id).maybeSingle();
  if (!me || !STAFF_ROLES.includes(me.role as UserRole)) {
    return NextResponse.json({ message: "Insufficient privilege" }, { status: 403 });
  }

  let body: {
    client_id?: string;
    storage_path?: string;
    document_type?: string;
    file_name?: string;
    mime_type?: string;
    size_bytes?: number;
    // FICA vault v2 (migration 032).
    expiry_date?: string | null;
    /** Replacing an existing vault doc → this upload becomes its next version. */
    replaces_id?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
  }
  const { client_id, storage_path } = body;
  if (!client_id || !storage_path) {
    return NextResponse.json({ message: "client_id and storage_path are required" }, { status: 400 });
  }
  // Path must live under this client's folder (defence in depth alongside RLS).
  if (!storage_path.startsWith(`${client_id}/`)) {
    return NextResponse.json({ message: "storage_path does not belong to this client" }, { status: 400 });
  }

  // RLS re-check that the caller can access the client.
  const { data: client } = await supabase.from("clients").select("id").eq("id", client_id).maybeSingle();
  if (!client) return NextResponse.json({ message: "Client not found or access denied" }, { status: 403 });

  const admin = createAdminClient();

  // Replacing an existing document → the new row points back at the one it
  // replaces, forming a version chain. Confirm the target really belongs to this
  // client first, so a replaces_id can't be used to reach across clients.
  const replacesId = body.replaces_id || null;
  if (replacesId) {
    const { data: prev } = await admin
      .from("client_documents")
      .select("id, client_id")
      .eq("id", replacesId)
      .maybeSingle();
    if (!prev || prev.client_id !== client_id) {
      return NextResponse.json({ message: "The document being replaced does not belong to this client" }, { status: 400 });
    }
  }

  const { data: doc, error } = await admin
    .from("client_documents")
    .insert({
      client_id,
      document_type: body.document_type || "other",
      storage_bucket: CLIENT_DOCS_BUCKET,
      storage_path,
      file_name: body.file_name || null,
      mime_type: body.mime_type || null,
      size_bytes: body.size_bytes || null,
      expiry_date: body.expiry_date || null,
      supersedes_id: replacesId,
      uploaded_by: me.id,
    })
    .select("id")
    .single();
  if (error) return NextResponse.json({ message: error.message }, { status: 400 });

  // Demote the old version only once the new one is safely recorded. Its file is
  // NOT touched — matters that already reused it still point at that object.
  if (replacesId) {
    await admin
      .from("client_documents")
      .update({ status: "superseded" })
      .eq("id", replacesId);
  }

  return NextResponse.json({ ok: true, client_document_id: doc.id, replaced: Boolean(replacesId) });
}
