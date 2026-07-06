import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit, clientIp } from "@/lib/ratelimit";

export const runtime = "nodejs";

// Reuse a client-vault document on a matter WITHOUT re-uploading: insert a
// documents row that references the client_documents object (migration 025).
// The existing doc lists / in-place intake / signed-download all keep working
// (the row carries the vault storage_bucket + storage_path). Gated by matter
// access AND client-document access (both via RLS); de-duped per matter+party.
export async function POST(request: Request) {
  if (!rateLimit(`client-doc-attach:${clientIp(request)}`, 60, 60_000)) {
    return NextResponse.json({ message: "Too many requests." }, { status: 429 });
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ message: "Not authenticated" }, { status: 401 });
  const { data: me } = await supabase.from("users").select("id, role").eq("auth_user_id", user.id).maybeSingle();

  let body: { client_document_id?: string; matter_id?: string; matter_party_id?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
  }
  const { client_document_id, matter_id } = body;
  const matterPartyId = body.matter_party_id || null;
  if (!client_document_id || !matter_id) {
    return NextResponse.json({ message: "client_document_id and matter_id are required" }, { status: 400 });
  }

  // RLS: caller must be able to see the matter…
  const { data: matter } = await supabase.from("matters").select("id").eq("id", matter_id).maybeSingle();
  if (!matter) return NextResponse.json({ message: "Matter not found or access denied" }, { status: 403 });
  // …and the client document (can_access_client on its owning client).
  const { data: cdoc } = await supabase
    .from("client_documents")
    .select("id, document_type, file_name, mime_type, size_bytes, storage_bucket, storage_path")
    .eq("id", client_document_id)
    .maybeSingle();
  if (!cdoc) return NextResponse.json({ message: "Client document not found or access denied" }, { status: 403 });

  const admin = createAdminClient();

  // De-dup: same vault doc already attached to this matter (+ same party slot).
  let dupQ = admin
    .from("documents")
    .select("id")
    .eq("matter_id", matter_id)
    .eq("client_document_id", client_document_id);
  dupQ = matterPartyId ? dupQ.eq("matter_party_id", matterPartyId) : dupQ.is("matter_party_id", null);
  const { data: existing } = await dupQ.maybeSingle();
  if (existing) return NextResponse.json({ ok: true, document_id: existing.id, deduped: true });

  const uploadedBy =
    me?.role === "business_partner" ? "attorney" : me?.role === "client" ? "client" : "staff";

  const { data: doc, error } = await admin
    .from("documents")
    .insert({
      matter_id,
      matter_party_id: matterPartyId,
      document_type: cdoc.document_type || "other",
      document_status: "provided",
      storage_bucket: cdoc.storage_bucket,
      storage_path: cdoc.storage_path,
      file_name: cdoc.file_name,
      mime_type: cdoc.mime_type,
      size_bytes: cdoc.size_bytes,
      client_document_id,
      uploaded_by: uploadedBy,
    })
    .select("id")
    .single();
  if (error) return NextResponse.json({ message: error.message }, { status: 400 });

  await admin.from("matter_activities").insert({
    matter_id,
    author_id: me?.id ?? null,
    activity_type: "document_upload",
    body: `Reused client document: ${cdoc.file_name || cdoc.document_type || "file"}`,
  });

  return NextResponse.json({ ok: true, document_id: doc.id });
}
