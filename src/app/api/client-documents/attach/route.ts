import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { supersedeSlot } from "@/lib/documents";
import { logMatterActivity } from "@/lib/activity";

export const runtime = "nodejs";

// Reuse a client-vault document on a matter WITHOUT re-uploading: insert a
// documents row that references the client_documents object (migration 025).
// The existing doc lists / in-place intake / signed-download all keep working
// (the row carries the vault storage_bucket + storage_path). Gated by matter
// access AND client-document access (both via RLS); de-duped per MATTER (see the
// note on the dedupe query — keying it on the party is what let the transfer-doc
// twin of this route attach the same file twice).
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
    .select("id, document_type, file_name, mime_type, size_bytes, storage_bucket, storage_path, status")
    .eq("id", client_document_id)
    .maybeSingle();
  if (!cdoc) return NextResponse.json({ message: "Client document not found or access denied" }, { status: 403 });

  // The UI only offers current documents, but the API must not rely on that — a
  // superseded or archived document must never be attachable to a live matter (032).
  if ((cdoc.status ?? "current") !== "current") {
    return NextResponse.json(
      { message: "That document is no longer current — reuse the latest version instead." },
      { status: 409 }
    );
  }

  const admin = createAdminClient();

  // De-dup: same vault doc already on this matter? A vault document is PERSON-level
  // (a certified ID belongs to one client), so it lands on a matter at most once —
  // the party the click came from does not make it a different document. Migration
  // 036 enforces this as a unique index, which is what actually wins the race; this
  // check only saves the round trip.
  const { data: existing } = await admin
    .from("documents")
    .select("id")
    .eq("matter_id", matter_id)
    .eq("client_document_id", client_document_id)
    .neq("document_status", "superseded")
    .maybeSingle();
  if (existing) return NextResponse.json({ ok: true, document_id: existing.id, deduped: true });

  const uploadedBy =
    me?.role === "business_partner" ? "attorney" : me?.role === "client" ? "client" : "staff";

  // A DIFFERENT document may already occupy this slot (the check above only
  // catches re-attaching the SAME vault doc). Reusing supersedes it.
  const documentType = cdoc.document_type || "other";
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
      matter_party_id: matterPartyId,
      document_type: documentType,
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

  // Lost the race to a concurrent identical attach (036's index). The document is
  // on the matter either way — that is what the caller asked for, so it is not an error.
  if (error) {
    if (error.code === "23505") {
      const { data: winner } = await admin
        .from("documents")
        .select("id")
        .eq("matter_id", matter_id)
        .eq("client_document_id", client_document_id)
        .neq("document_status", "superseded")
        .maybeSingle();
      if (winner) return NextResponse.json({ ok: true, document_id: winner.id, deduped: true });
    }
    return NextResponse.json({ message: error.message }, { status: 400 });
  }

  const label = cdoc.file_name || documentType || "file";
  await logMatterActivity(admin, {
    matterId: matter_id,
    authorId: me?.id ?? null,
    activityType: "document_upload",
    body: replaced.length
      ? `Reused client document (replaced the previous one): ${label}`
      : `Reused client document: ${label}`,
  });

  return NextResponse.json({ ok: true, document_id: doc.id, replaced: replaced.length });
}
