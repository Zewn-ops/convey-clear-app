import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { TRANSFER_DOCS_BUCKET, transferObjectPath } from "@/lib/storage";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { STAFF_ROLES, type UserRole } from "@/types";

export const runtime = "nodejs";

// Signed UPLOAD url for a TRANSFER-level document (migration 034) — the deed
// search / transfer letter / clearance figures that belong to the property
// transaction rather than to any one matter inside it.
//
// Staff-only, matching how transfers themselves are written (026): the owning
// firm reads a transfer, it does not author it.
export async function POST(request: Request) {
  if (!rateLimit(`transfer-doc-upload:${clientIp(request)}`, 60, 60_000)) {
    return NextResponse.json({ message: "Too many requests." }, { status: 429 });
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ message: "Not authenticated" }, { status: 401 });
  const { data: me } = await supabase.from("users").select("role").eq("auth_user_id", user.id).maybeSingle();
  if (!me || !STAFF_ROLES.includes(me.role as UserRole)) {
    return NextResponse.json({ message: "Insufficient privilege" }, { status: 403 });
  }

  let body: { transfer_id?: string; file_name?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
  }
  const transferId = body.transfer_id;
  if (!transferId) return NextResponse.json({ message: "transfer_id is required" }, { status: 400 });

  // RLS returns the transfer only if the caller can access it.
  const { data: transfer } = await supabase
    .from("property_transfers")
    .select("id")
    .eq("id", transferId)
    .maybeSingle();
  if (!transfer) return NextResponse.json({ message: "Transfer not found or access denied" }, { status: 403 });

  const path = transferObjectPath(transferId, body.file_name ?? "file");
  const admin = createAdminClient();
  const { data, error } = await admin.storage.from(TRANSFER_DOCS_BUCKET).createSignedUploadUrl(path);
  if (error || !data) {
    return NextResponse.json({ message: error?.message ?? "Could not create upload URL" }, { status: 500 });
  }
  return NextResponse.json({ bucket: TRANSFER_DOCS_BUCKET, path, token: data.token, signedUrl: data.signedUrl });
}
