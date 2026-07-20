import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { MATTER_DOCS_BUCKET } from "@/lib/storage";
import { STAFF_ROLES, type UserRole } from "@/types";
import { logMatterActivity } from "@/lib/activity";

export const runtime = "nodejs";

// Remove a document from a matter.
//
// WHY THIS EXISTS
//   There was no delete path at all. Migration 030 leaned on that fact — it made
//   a second upload SUPERSEDE the first precisely because "rejecting the upload
//   would strand the user with a wrong file". But the intake then hid the upload
//   control once a slot was filled, so the supersede path was unreachable and a
//   wrong document was permanent. Replace is now reachable again; this covers the
//   other half — getting rid of something that should not be there at all.
//
// WHAT IT DELETES, AND WHAT IT DELIBERATELY DOES NOT
//   A documents row is not always the owner of its file. It can be a POINTER at
//   an object owned somewhere else:
//     • client_document_id set → the file lives in the client's FICA vault (025/032)
//     • a path outside this matter's folder → reused from a transfer (034)
//   For those, removing the document detaches it from the matter and nothing
//   else. Deleting the object would blank the file on every other matter reusing
//   it — the same trap the transfer-document DELETE route guards against.
//
//   ⚠️ Since the two-way sync (2026-07-20) a matter-OWNED upload also carries a
//   transfer_document_id, because it was mirrored upward. So ownership cannot be
//   inferred from that column any more — it is decided by the storage path. Get
//   this backwards and removing a matter's own upload would leave the mirror
//   pointing at a deleted object.
//
// AUDIT
//   The row is really deleted rather than flagged, because the case this exists
//   for is "the wrong person's certified ID is now in this matter" — leaving it
//   in place with a status is not a fix. The activity feed keeps the record that
//   a removal happened, by whom and when.

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

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

  const role = (me?.role ?? null) as UserRole | null;
  // Staff and the attorney firm may tidy up their own matters. Clients may not —
  // they upload through onboarding and must not be able to remove what a firm is
  // relying on.
  if (!role || !(STAFF_ROLES.includes(role) || role === "business_partner")) {
    return NextResponse.json({ message: "Insufficient privilege" }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: doc } = await admin
    .from("documents")
    .select("id, matter_id, file_name, document_type, storage_bucket, storage_path, client_document_id")
    .eq("id", id)
    .maybeSingle();
  if (!doc) return NextResponse.json({ message: "Document not found" }, { status: 404 });

  // Authorise against the matter through the CALLER's own RLS, then act with the
  // service role — the same shape as the partner "not available" fix (a11f922),
  // where writing with the user client let RLS silently drop the update.
  const { data: matter } = await supabase
    .from("matters")
    .select("id")
    .eq("id", doc.matter_id)
    .maybeSingle();
  if (!matter) return NextResponse.json({ message: "Matter not found or access denied" }, { status: 403 });

  // Does this matter own the file, or is it borrowing it?
  const ownsFile =
    !doc.client_document_id &&
    (doc.storage_bucket ?? MATTER_DOCS_BUCKET) === MATTER_DOCS_BUCKET &&
    typeof doc.storage_path === "string" &&
    doc.storage_path.startsWith(`${doc.matter_id}/`);

  const { error: delErr } = await admin.from("documents").delete().eq("id", id);
  if (delErr) return NextResponse.json({ message: delErr.message }, { status: 400 });

  let removedMirror = false;
  let removedObject = false;

  if (ownsFile && doc.storage_path) {
    // The mirror this upload created on the transfer points at the SAME object.
    // It can only go if no other matter has since reused it.
    const { data: mirrors } = await admin
      .from("transfer_documents")
      .select("id")
      .eq("storage_path", doc.storage_path);

    for (const m of mirrors ?? []) {
      const { count: reusedBy } = await admin
        .from("documents")
        .select("id", { count: "exact", head: true })
        .eq("transfer_document_id", m.id);
      if ((reusedBy ?? 0) === 0) {
        await admin.from("transfer_documents").delete().eq("id", m.id);
        removedMirror = true;
      }
    }

    // Only bin the object once nothing at all points at it. Row(s) first, object
    // last: an orphaned file is inert, a row pointing at a deleted object renders
    // as a broken document.
    const { count: docsOnPath } = await admin
      .from("documents")
      .select("id", { count: "exact", head: true })
      .eq("storage_path", doc.storage_path);
    const { count: tdocsOnPath } = await admin
      .from("transfer_documents")
      .select("id", { count: "exact", head: true })
      .eq("storage_path", doc.storage_path);

    if ((docsOnPath ?? 0) === 0 && (tdocsOnPath ?? 0) === 0) {
      await admin.storage.from(doc.storage_bucket ?? MATTER_DOCS_BUCKET).remove([doc.storage_path]);
      removedObject = true;
    }
  }

  await logMatterActivity(admin, {
    matterId: doc.matter_id,
    authorId: me?.id ?? null,
    activityType: "document_status",
    body: `Document removed: ${doc.file_name || doc.document_type || "file"}`,
  });

  return NextResponse.json({
    ok: true,
    detached_only: !ownsFile,
    removed_transfer_mirror: removedMirror,
    removed_file: removedObject,
  });
}
