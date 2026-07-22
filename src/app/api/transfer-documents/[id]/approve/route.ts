import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ADMIN_ROLES, type UserRole } from "@/types";
import { logTransferActivity } from "@/lib/activity";

export const runtime = "nodejs";

// Approve a TRANSFER-level document so the owning firm can see it.
//
// Matter documents mirrored upward by the sync (038) are approved through the
// matter route — 042's propagate trigger carries the approval across, so they
// never need this. This covers the other case: a staff member uploading a deed
// search or transfer letter straight onto the transfer, which has no matter
// document behind it to approve.
//
// Admin only, same reasoning as the matter route: review by someone other than
// the uploader is the entire feature.

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
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

  if (!me || !ADMIN_ROLES.includes(me.role as UserRole)) {
    return NextResponse.json({ message: "Only an admin can approve documents" }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: doc } = await admin
    .from("transfer_documents")
    .select("id, transfer_id, file_name, document_type, approved_at")
    .eq("id", id)
    .maybeSingle();
  if (!doc) return NextResponse.json({ message: "Document not found" }, { status: 404 });

  if (doc.approved_at) {
    return NextResponse.json({ ok: true, already_approved: true });
  }

  const { error } = await admin
    .from("transfer_documents")
    .update({ approved_at: new Date().toISOString(), approved_by: me.id })
    .eq("id", id)
    .is("approved_at", null);
  if (error) return NextResponse.json({ message: error.message }, { status: 400 });

  await logTransferActivity(admin, {
    transferId: doc.transfer_id,
    authorId: me.id,
    activityType: "document_upload",
    body: `Document approved for release: ${doc.file_name || doc.document_type || "file"}`,
  });

  return NextResponse.json({ ok: true });
}
