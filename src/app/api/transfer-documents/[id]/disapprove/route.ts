import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ADMIN_ROLES, type UserRole } from "@/types";
import { logTransferActivity } from "@/lib/activity";
import { notifyUsers } from "@/lib/notify";

export const runtime = "nodejs";

// Disapprove (reject) a TRANSFER-level document (044). Counterpart to the
// transfer approve route: covers a staff member uploading a deed search /
// transfer letter straight onto the transfer. A matter document mirrored upward
// by the sync (038) is disapproved through the MATTER route — 044's propagate
// trigger carries the disapproval across, so it never needs this.
//
// Admin only; the document is kept (row + reason = audit), not deleted.

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
    .from("transfer_documents")
    .select("id, transfer_id, file_name, document_type, approved_at, disapproved_at, uploaded_by")
    .eq("id", id)
    .maybeSingle();
  if (!doc) return NextResponse.json({ message: "Document not found" }, { status: 404 });

  if (doc.approved_at) {
    return NextResponse.json({ message: "This document has already been approved." }, { status: 409 });
  }
  if (doc.disapproved_at) {
    return NextResponse.json({ ok: true, already_disapproved: true });
  }

  const { error } = await admin
    .from("transfer_documents")
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

  await logTransferActivity(admin, {
    transferId: doc.transfer_id,
    authorId: me.id,
    activityType: "document_upload",
    body: `Document not approved: ${label} — ${reason}`,
  });

  await notifyUsers([doc.uploaded_by], {
    type: "document_status",
    title: "Transfer document not approved",
    body: `${label} was not approved. Reason: ${reason}`,
    link: `/admin/property-transfers/${doc.transfer_id}`,
  });

  return NextResponse.json({ ok: true });
}
