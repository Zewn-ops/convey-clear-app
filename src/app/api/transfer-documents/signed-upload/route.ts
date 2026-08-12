import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { TRANSFER_DOCS_BUCKET, transferObjectPath } from "@/lib/storage";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { requireTransferUploader } from "@/lib/transfer-upload-access";

export const runtime = "nodejs";

// Signed UPLOAD url for a TRANSFER-level document (migration 034) — the deed
// search / transfer letter / clearance figures that belong to the property
// transaction rather than to any one matter inside it.
//
// Staff AND the attorney firm, since 2026-08-11 §112: attorneys author the deed
// search, staff then decide who sees it. See lib/transfer-upload-access.ts —
// estate agencies are deliberately excluded.
export async function POST(request: Request) {
  if (!rateLimit(`transfer-doc-upload:${clientIp(request)}`, 60, 60_000)) {
    return NextResponse.json({ message: "Too many requests." }, { status: 429 });
  }
  const supabase = await createClient();
  const admin = createAdminClient();
  const who = await requireTransferUploader(supabase, admin);
  if (!who.ok) return NextResponse.json({ message: who.message }, { status: who.status });

  let body: { transfer_id?: string; file_name?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
  }
  const transferId = body.transfer_id;
  if (!transferId) return NextResponse.json({ message: "transfer_id is required" }, { status: 400 });

  // RLS returns the transfer only if the caller can access it. This is what
  // confines an attorney firm to its OWN transfers — the role check above says
  // only that a law firm may author documents at all.
  const { data: transfer } = await supabase
    .from("property_transfers")
    .select("id")
    .eq("id", transferId)
    .maybeSingle();
  if (!transfer) return NextResponse.json({ message: "Transfer not found or access denied" }, { status: 403 });

  const path = transferObjectPath(transferId, body.file_name ?? "file");
  const { data, error } = await admin.storage.from(TRANSFER_DOCS_BUCKET).createSignedUploadUrl(path);
  if (error || !data) {
    return NextResponse.json({ message: error?.message ?? "Could not create upload URL" }, { status: 500 });
  }
  return NextResponse.json({ bucket: TRANSFER_DOCS_BUCKET, path, token: data.token, signedUrl: data.signedUrl });
}
