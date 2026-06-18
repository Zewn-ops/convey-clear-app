import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { MATTER_DOCS_BUCKET } from "@/lib/storage";

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
  const { data: doc, error } = await admin
    .from("documents")
    .insert({
      matter_id,
      document_type: body.document_type || "other",
      document_status: "provided",
      storage_bucket: MATTER_DOCS_BUCKET,
      storage_path,
      file_name: body.file_name || null,
      mime_type: body.mime_type || null,
      size_bytes: body.size_bytes || null,
      matter_party_id: body.matter_party_id || null,
      uploaded_by: uploadedBy,
    })
    .select("id")
    .single();
  if (error) return NextResponse.json({ message: error.message }, { status: 400 });

  // Best-effort activity entry (matter_activities.body — column confirmed).
  await admin.from("matter_activities").insert({
    matter_id,
    author_id: me?.id ?? null,
    activity_type: "document_upload",
    body: `Document uploaded: ${body.file_name || body.document_type || "file"}`,
  });

  return NextResponse.json({ ok: true, document_id: doc.id });
}
