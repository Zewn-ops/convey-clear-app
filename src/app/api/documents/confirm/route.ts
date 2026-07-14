import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { MATTER_DOCS_BUCKET } from "@/lib/storage";
import { supersedeSlot } from "@/lib/documents";
import { logMatterActivity } from "@/lib/activity";

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
  const documentType = body.document_type || "other";
  const matterPartyId = body.matter_party_id || null;

  // This upload becomes the slot's current document; demote whatever was there.
  let replaced: string[];
  try {
    replaced = await supersedeSlot(admin, { matterId: matter_id, matterPartyId, documentType });
  } catch (e) {
    return NextResponse.json({ message: (e as Error).message }, { status: 400 });
  }

  const { data: doc, error } = await admin
    .from("documents")
    .insert({
      matter_id,
      document_type: documentType,
      document_status: "provided",
      storage_bucket: MATTER_DOCS_BUCKET,
      storage_path,
      file_name: body.file_name || null,
      mime_type: body.mime_type || null,
      size_bytes: body.size_bytes || null,
      matter_party_id: matterPartyId,
      uploaded_by: uploadedBy,
    })
    .select("id")
    .single();
  if (error) return NextResponse.json({ message: error.message }, { status: 400 });

  // Best-effort activity entry, de-duplicated (036): a re-fired upload confirm
  // must not post the same "Document uploaded: X" line twice.
  const label = body.file_name || documentType || "file";
  await logMatterActivity(admin, {
    matterId: matter_id,
    authorId: me?.id ?? null,
    activityType: "document_upload",
    body: replaced.length ? `Document replaced: ${label}` : `Document uploaded: ${label}`,
  });

  return NextResponse.json({ ok: true, document_id: doc.id, replaced: replaced.length });
}
