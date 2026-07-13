import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { STAFF_ROLES, ADMIN_ROLES, type UserRole } from "@/types";

export const runtime = "nodejs";

// Maintain a single vault document (migration 032): verify it, set an expiry,
// note it, archive it — or delete it outright, but only when it is safe to.
//
// 🔑 THE HAZARD THIS ROUTE EXISTS TO RESPECT
//   Reuse does not copy a file. A matter's `documents` row carries the SAME
//   storage_bucket + storage_path as the vault row it came from — one object,
//   referenced twice. So deleting a vault document's file would blank the View
//   link on every matter that reused it, silently, long after the fact.
//   Therefore: a document that is in use can only be ARCHIVED (row kept, file
//   kept, hidden from the vault and the reuse picker). Hard delete is permitted
//   only when nothing references the row.

async function staff(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ message: "Not authenticated" }, { status: 401 }) };
  const { data: me } = await supabase.from("users").select("id, role").eq("auth_user_id", user.id).maybeSingle();
  if (!me || !STAFF_ROLES.includes(me.role as UserRole)) {
    return { error: NextResponse.json({ message: "Insufficient privilege" }, { status: 403 }) };
  }
  return { me, supabase };
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const gate = await staff(request);
  if (gate.error) return gate.error;
  const me = gate.me!;

  let body: {
    verified?: boolean;
    expiry_date?: string | null;
    notes?: string | null;
    status?: "current" | "archived";
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: doc } = await admin
    .from("client_documents")
    .select("id, status")
    .eq("id", id)
    .maybeSingle();
  if (!doc) return NextResponse.json({ message: "Document not found" }, { status: 404 });

  const patch: Record<string, unknown> = {};

  if (typeof body.verified === "boolean") {
    patch.verified = body.verified;
    // Stamp WHO and WHEN, or clear both — a verified_at with no verified_by is
    // worse than nothing, because it looks like provenance and isn't.
    patch.verified_at = body.verified ? new Date().toISOString() : null;
    patch.verified_by = body.verified ? me.id : null;
  }
  if (body.expiry_date !== undefined) patch.expiry_date = body.expiry_date || null;
  if (body.notes !== undefined) patch.notes = body.notes || null;

  if (body.status !== undefined) {
    // Only current <-> archived. 'superseded' is set by the replace flow alone —
    // letting it be set by hand would orphan the version chain.
    if (!["current", "archived"].includes(body.status)) {
      return NextResponse.json({ message: "status must be 'current' or 'archived'" }, { status: 400 });
    }
    if (doc.status === "superseded") {
      return NextResponse.json({ message: "A superseded version can't be restored — upload a new one instead." }, { status: 400 });
    }
    patch.status = body.status;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ message: "Nothing to update" }, { status: 400 });
  }

  const { error } = await admin.from("client_documents").update(patch).eq("id", id);
  if (error) return NextResponse.json({ message: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const gate = await staff(request);
  if (gate.error) return gate.error;

  const me = gate.me!;
  // Destroying evidence is an admin act, not a staff one.
  if (!ADMIN_ROLES.includes(me.role as UserRole)) {
    return NextResponse.json({ message: "Only an admin may delete a vault document" }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: doc } = await admin
    .from("client_documents")
    .select("id, storage_bucket, storage_path")
    .eq("id", id)
    .maybeSingle();
  if (!doc) return NextResponse.json({ message: "Document not found" }, { status: 404 });

  // In use on a matter? Then its file is shared, and deleting it would break that
  // matter's document. Archive instead — and say so rather than failing mutely.
  const { count: usedOnMatters } = await admin
    .from("documents")
    .select("id", { count: "exact", head: true })
    .eq("client_document_id", id);

  // A newer version pointing back at this one would lose its history.
  const { count: supersededBy } = await admin
    .from("client_documents")
    .select("id", { count: "exact", head: true })
    .eq("supersedes_id", id);

  if ((usedOnMatters ?? 0) > 0 || (supersededBy ?? 0) > 0) {
    const reason =
      (usedOnMatters ?? 0) > 0
        ? `it is in use on ${usedOnMatters} matter${usedOnMatters === 1 ? "" : "s"}`
        : "a newer version references it";
    return NextResponse.json(
      {
        message: `This document can't be deleted because ${reason}. Archive it instead — the file stays available to those matters, but it leaves the vault.`,
        archivable: true,
      },
      { status: 409 }
    );
  }

  // Unreferenced → safe to remove for real. Row first: if the object delete fails
  // we are left with an orphaned file, which is inert. The reverse order would
  // leave a row pointing at nothing, which renders as a broken document.
  const { error } = await admin.from("client_documents").delete().eq("id", id);
  if (error) return NextResponse.json({ message: error.message }, { status: 400 });

  if (doc.storage_bucket && doc.storage_path) {
    await admin.storage.from(doc.storage_bucket).remove([doc.storage_path]);
  }

  return NextResponse.json({ ok: true, deleted: true });
}
