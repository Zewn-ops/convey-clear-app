import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ADMIN_ROLES, type UserRole } from "@/types";
import { logMatterActivity } from "@/lib/activity";
import { notifyUsers } from "@/lib/notify";

export const runtime = "nodejs";

// Disapprove (reject) a matter document (044). The counterpart to approve: an
// admin who sees the wrong file went up records WHY, the uploader is told, and
// the document stays hidden from the client and partner firm (043 keys on
// approved_at, which a disapproved row leaves NULL).
//
// The document is NOT deleted — the row and its reason are the audit trail, and
// the uploader needs both to know what to fix and re-upload. Removing it is a
// separate, deliberate action (DELETE /api/documents/[id]).
//
// Admin only, same reasoning as approve: review by someone other than the
// uploader is the whole point.

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let body: { reason?: unknown };
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (!reason) {
    return NextResponse.json({ message: "A reason is required to disapprove a document." }, { status: 400 });
  }

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

  if (!me || !ADMIN_ROLES.includes(me.role as UserRole)) {
    return NextResponse.json({ message: "Only an admin can disapprove documents" }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: doc } = await admin
    .from("documents")
    .select("id, matter_id, file_name, document_type, approved_at, disapproved_at, uploaded_by_user_id")
    .eq("id", id)
    .maybeSingle();
  if (!doc) return NextResponse.json({ message: "Document not found" }, { status: 404 });

  // Idempotent-ish: an already-decided document is not re-decided. Approved wins
  // (it is out already); a second disapprove keeps the first reason/author.
  if (doc.approved_at) {
    return NextResponse.json({ message: "This document has already been approved." }, { status: 409 });
  }
  if (doc.disapproved_at) {
    return NextResponse.json({ ok: true, already_disapproved: true });
  }

  const { error } = await admin
    .from("documents")
    .update({
      disapproved_at: new Date().toISOString(),
      disapproved_by: me.id,
      disapproval_reason: reason,
    })
    .eq("id", id)
    .is("approved_at", null)
    .is("disapproved_at", null);
  if (error) return NextResponse.json({ message: error.message }, { status: 400 });

  const label = doc.file_name || doc.document_type || "file";

  await logMatterActivity(admin, {
    matterId: doc.matter_id,
    authorId: me.id,
    activityType: "document_status",
    body: `Document not approved: ${label} — ${reason}`,
  });

  // Tell the uploader, with the reason so they can fix and re-upload.
  await notifyUsers([doc.uploaded_by_user_id], {
    type: "document_status",
    title: "Document not approved",
    body: `${label} was not approved. Reason: ${reason}`,
    link: `/admin/matters/${doc.matter_id}`,
    matter_id: doc.matter_id,
  });

  return NextResponse.json({ ok: true });
}
