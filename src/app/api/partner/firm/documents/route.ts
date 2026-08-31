import { NextResponse } from "next/server";
import { requireFirmAdmin } from "@/lib/partner";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { FIRM_DOCS_BUCKET, firmObjectPath } from "@/lib/storage";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { FIRM_DOC_TYPES } from "@/lib/firm-docs";

export const runtime = "nodejs";

/**
 * Firm-level documents (073) — what the councils ask OF THE FIRM once, rather
 * than per transaction: bank confirmation letter, fidelity fund certificate,
 * PoA (attorneys), PoA (address), SLA, POPIA.
 *
 * Two steps, the same shape the client vault uses (025): mint a signed upload
 * URL, the browser uploads straight to storage, then confirm the row. Splitting
 * it keeps file bytes out of this process entirely.
 *
 * SCOPE IS NEVER TAKEN FROM THE BODY. Both the storage path and the row are
 * stamped with `auth.partnerId`, so a firm admin can only ever write to their
 * own firm — and 073's storage policy independently checks that the path's
 * leading UUID matches the caller's firm, so a forged path fails at the
 * database too.
 */

const VALID_TYPES = new Set(FIRM_DOC_TYPES.map((t) => t.code));

/** POST — mint a signed upload URL for one firm document. */
export async function POST(request: Request) {
  if (!rateLimit(`firm-doc-upload:${clientIp(request)}`, 30, 60_000)) {
    return NextResponse.json({ message: "Too many requests." }, { status: 429 });
  }

  const auth = await requireFirmAdmin();
  if ("error" in auth) {
    return NextResponse.json({ message: auth.error }, { status: auth.status });
  }

  let body: { document_type?: string; file_name?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
  }

  const documentType = body.document_type?.trim();
  if (!documentType || !VALID_TYPES.has(documentType)) {
    return NextResponse.json(
      {
        message:
          "Choose which document this is: " +
          FIRM_DOC_TYPES.map((t) => t.label).join(", ") + ".",
      },
      { status: 400 }
    );
  }

  const path = firmObjectPath(auth.partnerId, body.file_name ?? "file");
  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from(FIRM_DOCS_BUCKET)
    .createSignedUploadUrl(path);

  if (error || !data) {
    return NextResponse.json(
      { message: error?.message ?? "Could not create an upload URL." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    bucket: FIRM_DOCS_BUCKET,
    path,
    token: data.token,
    signedUrl: data.signedUrl,
  });
}

/**
 * PUT — record the row, once the browser has finished uploading.
 *
 * Written with the CALLER's client rather than the service role, deliberately:
 * 073 gives a firm admin an INSERT policy scoped to their own firm, so RLS is
 * the boundary here and this route cannot widen it by accident. That is the
 * opposite choice from the credentials route, where there is no partner policy
 * at all and the service role is unavoidable.
 */
export async function PUT(request: Request) {
  if (!rateLimit(`firm-doc-confirm:${clientIp(request)}`, 30, 60_000)) {
    return NextResponse.json({ message: "Too many requests." }, { status: 429 });
  }

  const auth = await requireFirmAdmin();
  if ("error" in auth) {
    return NextResponse.json({ message: auth.error }, { status: auth.status });
  }

  let body: {
    document_type?: string;
    storage_path?: string;
    file_name?: string;
    mime_type?: string;
    size_bytes?: number;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
  }

  const documentType = body.document_type?.trim();
  const storagePath = body.storage_path?.trim();

  if (!documentType || !VALID_TYPES.has(documentType)) {
    return NextResponse.json({ message: "Unknown document type." }, { status: 400 });
  }
  if (!storagePath) {
    return NextResponse.json({ message: "storage_path is required." }, { status: 400 });
  }

  // The path was minted above with the caller's own firm id. Re-checking it
  // here costs nothing and stops a confirm call recording someone else's
  // object against this firm.
  if (!storagePath.startsWith(`${auth.partnerId}/`)) {
    return NextResponse.json(
      { message: "That file does not belong to your firm." },
      { status: 403 }
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.from("firm_documents").insert({
    firm_id: auth.partnerId,
    document_type: documentType,
    file_name: body.file_name ?? null,
    mime_type: body.mime_type ?? null,
    size_bytes: typeof body.size_bytes === "number" ? body.size_bytes : null,
    storage_bucket: FIRM_DOCS_BUCKET,
    storage_path: storagePath,
    uploaded_by: auth.userId,
  });

  if (error) {
    return NextResponse.json({ message: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
