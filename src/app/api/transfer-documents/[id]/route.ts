import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { STAFF_ROLES, ADMIN_ROLES, type UserRole } from "@/types";

export const runtime = "nodejs";

// Maintain a transfer-level document (migration 034). Same rules as the client
// vault (032), for the same reason: reuse SHARES the storage object, so deleting
// a document that a matter has reused would blank that matter's View link.
// In use → archive only. Hard delete → admin, and only when nothing points at it.

async function staffGate() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ message: "Not authenticated" }, { status: 401 }) };
  const { data: me } = await supabase.from("users").select("id, role").eq("auth_user_id", user.id).maybeSingle();
  if (!me || !STAFF_ROLES.includes(me.role as UserRole)) {
    return { error: NextResponse.json({ message: "Insufficient privilege" }, { status: 403 }) };
  }
  return { me };
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const gate = await staffGate();
  if (gate.error) return gate.error;
  const me = gate.me!;

  let body: { verified?: boolean; notes?: string | null; status?: "current" | "archived"; file_name?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: doc } = await admin
    .from("transfer_documents")
    .select("id, status, file_name")
    .eq("id", id)
    .maybeSingle();
  if (!doc) return NextResponse.json({ message: "Document not found" }, { status: 404 });

  const patch: Record<string, unknown> = {};

  // Rename (Jukka: already possible on a matter document, missing on a transfer
  // one). Display name only — the stored object path never changes.
  let renameFrom: string | null = null;
  if (body.file_name !== undefined) {
    const name = body.file_name.trim();
    if (!name) return NextResponse.json({ message: "A document name can't be empty" }, { status: 400 });
    patch.file_name = name;
    renameFrom = (doc.file_name as string | null) ?? null;
  }

  if (typeof body.verified === "boolean") {
    patch.verified = body.verified;
    patch.verified_at = body.verified ? new Date().toISOString() : null;
    patch.verified_by = body.verified ? me.id : null;
  }
  if (body.notes !== undefined) patch.notes = body.notes || null;
  if (body.status !== undefined) {
    if (!["current", "archived"].includes(body.status)) {
      return NextResponse.json({ message: "status must be 'current' or 'archived'" }, { status: 400 });
    }
    if (doc.status === "superseded") {
      return NextResponse.json(
        { message: "A superseded version can't be restored — upload a new one instead." },
        { status: 400 }
      );
    }
    patch.status = body.status;
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ message: "Nothing to update" }, { status: 400 });
  }

  const { error } = await admin.from("transfer_documents").update(patch).eq("id", id);
  if (error) return NextResponse.json({ message: error.message }, { status: 400 });

  // Carry a rename down to the matters that REUSED this document — they hold their
  // own copy of file_name (taken at attach time), so without this the same file
  // reads one way on the transfer and another on every matter under it.
  //
  // Only rows that still carry the OLD name are touched: a document someone
  // deliberately renamed on a matter keeps that name. A rename here is "fix the
  // label", not "overrule everyone".
  let renamedOnMatters = 0;
  if (patch.file_name && renameFrom) {
    const { data: touched } = await admin
      .from("documents")
      .update({ file_name: patch.file_name as string })
      .eq("transfer_document_id", id)
      .eq("file_name", renameFrom)
      .select("id");
    renamedOnMatters = (touched ?? []).length;
  }

  return NextResponse.json({ ok: true, renamed_on_matters: renamedOnMatters });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const gate = await staffGate();
  if (gate.error) return gate.error;
  if (!ADMIN_ROLES.includes(gate.me!.role as UserRole)) {
    return NextResponse.json({ message: "Only an admin may delete a transfer document" }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: doc } = await admin
    .from("transfer_documents")
    .select("id, storage_bucket, storage_path")
    .eq("id", id)
    .maybeSingle();
  if (!doc) return NextResponse.json({ message: "Document not found" }, { status: 404 });

  const { count: usedOnMatters } = await admin
    .from("documents")
    .select("id", { count: "exact", head: true })
    .eq("transfer_document_id", id);

  const { count: supersededBy } = await admin
    .from("transfer_documents")
    .select("id", { count: "exact", head: true })
    .eq("supersedes_id", id);

  if ((usedOnMatters ?? 0) > 0 || (supersededBy ?? 0) > 0) {
    const reason =
      (usedOnMatters ?? 0) > 0
        ? `it is in use on ${usedOnMatters} matter${usedOnMatters === 1 ? "" : "s"} in this transfer`
        : "a newer version references it";
    return NextResponse.json(
      {
        message: `This document can't be deleted because ${reason}. Archive it instead — the file stays available to those matters, but it leaves the transfer's document list.`,
        archivable: true,
      },
      { status: 409 }
    );
  }

  // Row first, then the object: an orphaned file is inert, whereas a row pointing
  // at a deleted object renders as a broken document.
  const { error } = await admin.from("transfer_documents").delete().eq("id", id);
  if (error) return NextResponse.json({ message: error.message }, { status: 400 });

  if (doc.storage_bucket && doc.storage_path) {
    await admin.storage.from(doc.storage_bucket).remove([doc.storage_path]);
  }

  return NextResponse.json({ ok: true, deleted: true });
}
