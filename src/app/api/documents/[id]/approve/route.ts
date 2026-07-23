import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ADMIN_ROLES, type UserRole } from "@/types";
import { logMatterActivity } from "@/lib/activity";
import { notifyUsers } from "@/lib/notify";

export const runtime = "nodejs";

// Approve a matter document so clients and the attorney firm can see it.
//
// WHY THIS EXISTS
//   Jukka's requirement (2026-07-22): documents uploaded by ConveyClear ops,
//   services and runners stay invisible to clients and business partners until
//   an admin has confirmed the right file was uploaded. Migration 042 marks
//   those uploads pending; 043 is what actually hides them.
//
// ADMIN ONLY, deliberately. The whole point is review by someone other than the
// uploader — letting staff_ops approve would make the gate self-service and
// therefore no gate at all. Migration 042 already auto-approves anything an
// admin uploads themselves, so this is only ever reached for someone else's
// upload.
//
// The mirror on the property transfer is approved by a DB trigger
// (propagate_document_approval, 042) rather than a second write here, so a
// document approved by any other writer — psql, a future bulk action — cannot
// leave the transfer copy stranded as invisible.

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
    .from("documents")
    .select("id, matter_id, file_name, document_type, approved_at, uploaded_by_user_id")
    .eq("id", id)
    .maybeSingle();
  if (!doc) return NextResponse.json({ message: "Document not found" }, { status: 404 });

  // Already approved: succeed quietly rather than erroring. Two admins working
  // the same queue is the expected case, not a conflict, and a second click
  // must not overwrite the original approver's name.
  if (doc.approved_at) {
    return NextResponse.json({ ok: true, already_approved: true });
  }

  const { error } = await admin
    .from("documents")
    .update({ approved_at: new Date().toISOString(), approved_by: me.id })
    .eq("id", id)
    .is("approved_at", null);
  if (error) return NextResponse.json({ message: error.message }, { status: 400 });

  const label = doc.file_name || doc.document_type || "file";

  await logMatterActivity(admin, {
    matterId: doc.matter_id,
    authorId: me.id,
    activityType: "document_status",
    body: `Document approved for release: ${label}`,
  });

  // Tell the uploader their document is out. Best-effort — notifyUsers never
  // throws, and it no-ops when uploaded_by_user_id is null (rows predating 042 /
  // direct n8n inserts). The uploader is staff, so the link is the admin view.
  await notifyUsers([doc.uploaded_by_user_id], {
    type: "document_status",
    title: "Document approved",
    body: `${label} was approved and is now visible to the client and partner firm.`,
    link: `/admin/matters/${doc.matter_id}`,
    matter_id: doc.matter_id,
  });

  return NextResponse.json({ ok: true });
}
