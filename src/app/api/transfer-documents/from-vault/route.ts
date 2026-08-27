import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { STAFF_ROLES, type UserRole } from "@/types";
import { logTransferActivity } from "@/lib/activity";

export const runtime = "nodejs";

/**
 * Pull a document out of a client's FICA vault and onto a property transfer.
 *
 * 🔴 STAFF ONLY, and deliberately so. Meeting 2 (2026-08-06) parked the
 * integrated vault precisely because an automatic vault→transfer feed would put
 * one party's identity documents in front of the other side. Zewn's 2026-08-07
 * decision keeps the vault, keeps it unlinked, and gives ConveyClear members
 * alone the ability to move a document across. Attorneys and clients get no
 * such control and no such route.
 *
 * Enforced three ways on purpose:
 *   - this role check,
 *   - transfer_documents_staff_write (034) — RLS refuses a non-staff insert
 *     even if this check were removed,
 *   - the UI only renders the picker for staff.
 * A route that relies solely on a policy it never names is one refactor away
 * from not being gated at all.
 *
 * Who can then SEE it: transfer_documents_read is can_access_transfer(), which
 * is staff or a firm holding a live grant — there is no client branch. So this
 * shares a document with ConveyClear and the attorney firm, never with the
 * opposing party. Staff are told that in the UI before they click.
 *
 * Like the vault→matter twin (025) this points at the SAME storage object
 * rather than copying bytes: the row carries the vault bucket and path.
 */
export async function POST(request: Request) {
  if (!rateLimit(`transfer-doc-from-vault:${clientIp(request)}`, 60, 60_000)) {
    return NextResponse.json({ message: "Too many requests." }, { status: 429 });
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
  if (!me || !STAFF_ROLES.includes(me.role as UserRole)) {
    return NextResponse.json(
      { message: "Only ConveyClear staff can move a vault document onto a transfer." },
      { status: 403 }
    );
  }

  let body: { transfer_id?: string; client_document_id?: string; document_type?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
  }

  const { transfer_id, client_document_id } = body;
  if (!transfer_id || !client_document_id) {
    return NextResponse.json(
      { message: "transfer_id and client_document_id are required" },
      { status: 400 }
    );
  }

  // Both reads go through the CALLER's client so RLS still applies — staff can
  // see everything, but a bug that let a non-staff caller past the check above
  // would still not be able to read its way to someone else's vault.
  const { data: transfer } = await supabase
    .from("property_transfers")
    .select("id, reference, seller_client_id, buyer_client_id")
    .eq("id", transfer_id)
    .maybeSingle();
  if (!transfer) {
    return NextResponse.json({ message: "Transfer not found or access denied" }, { status: 403 });
  }

  const { data: cdoc } = await supabase
    .from("client_documents")
    .select(
      "id, client_id, document_type, file_name, mime_type, size_bytes, storage_bucket, storage_path, status"
    )
    .eq("id", client_document_id)
    .maybeSingle();
  if (!cdoc) {
    return NextResponse.json({ message: "Vault document not found or access denied" }, { status: 403 });
  }

  // The picker only offers current documents, but the API must not lean on that
  // — a superseded certified ID must never reach a live transfer (032).
  if ((cdoc.status ?? "current") !== "current") {
    return NextResponse.json(
      { message: "That document is no longer current — pull the latest version instead." },
      { status: 409 }
    );
  }

  const admin = createAdminClient();

  // Same vault document already on this transfer? 054 enforces this as a unique
  // index, which is what actually wins a race; this only saves the round trip
  // and turns the constraint error into a sentence.
  const { data: existing } = await admin
    .from("transfer_documents")
    .select("id")
    .eq("transfer_id", transfer_id)
    .eq("client_document_id", client_document_id)
    .neq("status", "superseded")
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ ok: true, transfer_document_id: existing.id, deduped: true });
  }

  // NOTE: no "path must start with <transfer_id>/" guard here, unlike the
  // upload-confirm route. That check exists there because the browser chooses
  // the path; here the path is read off a vault row this caller could already
  // see, and it correctly points into the client-documents bucket.
  // Whose document it is (067) — derived, never asked. The vault row already
  // belongs to a client, and the transfer already names its seller and buyer, so
  // asking the person clicking would be asking them to retype something the
  // database knows. A vault document belonging to neither side (a firm's own, a
  // client on the transfer only as 'other') stays NULL rather than guessing.
  const vaultOwner = (cdoc as { client_id?: string | null }).client_id ?? null;
  const partyRole =
    vaultOwner && vaultOwner === (transfer as { seller_client_id?: string | null }).seller_client_id
      ? "seller"
      : vaultOwner && vaultOwner === (transfer as { buyer_client_id?: string | null }).buyer_client_id
        ? "buyer"
        : null;

  const { data: inserted, error } = await admin
    .from("transfer_documents")
    .insert({
      transfer_id,
      document_type: cdoc.document_type || "other",
      party_role: partyRole,
      file_name: cdoc.file_name,
      mime_type: cdoc.mime_type,
      size_bytes: cdoc.size_bytes,
      storage_bucket: cdoc.storage_bucket,
      storage_path: cdoc.storage_path,
      client_document_id,
      uploaded_by: me.id,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { message: "That vault document is already on this transfer." },
        { status: 409 }
      );
    }
    return NextResponse.json({ message: error.message }, { status: 400 });
  }

  await logTransferActivity(admin, {
    transferId: transfer_id,
    authorId: me.id,
    activityType: "document_upload",
    body: `Vault document added: ${cdoc.file_name ?? cdoc.document_type ?? "document"}`,
  });

  return NextResponse.json({ ok: true, transfer_document_id: inserted.id });
}
