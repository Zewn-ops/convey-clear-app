import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { MATTER_DOCS_BUCKET, matterObjectPath } from "@/lib/storage";
import { rateLimit, clientIp } from "@/lib/ratelimit";

export const runtime = "nodejs";

// Mints a signed UPLOAD url so the browser uploads the file DIRECTLY to Supabase
// Storage (bypasses Vercel's 4.5 MB body limit). Access is gated by RLS: we only
// mint a URL if the caller can see the matter. The actual documents row is
// created by /api/documents/confirm after the upload succeeds.
export async function POST(request: Request) {
  if (!rateLimit(`doc-upload:${clientIp(request)}`, 60, 60_000)) {
    return NextResponse.json({ message: "Too many requests." }, { status: 429 });
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ message: "Not authenticated" }, { status: 401 });

  let body: { matter_id?: string; file_name?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
  }
  const matterId = body.matter_id;
  if (!matterId) return NextResponse.json({ message: "matter_id is required" }, { status: 400 });

  // RLS returns the matter only if the caller can access it.
  const { data: matter } = await supabase.from("matters").select("id").eq("id", matterId).maybeSingle();
  if (!matter) return NextResponse.json({ message: "Matter not found or access denied" }, { status: 403 });

  const path = matterObjectPath(matterId, body.file_name ?? "file");
  const admin = createAdminClient();
  const { data, error } = await admin.storage.from(MATTER_DOCS_BUCKET).createSignedUploadUrl(path);
  if (error || !data) {
    return NextResponse.json({ message: error?.message ?? "Could not create upload URL" }, { status: 500 });
  }

  return NextResponse.json({ bucket: MATTER_DOCS_BUCKET, path, token: data.token, signedUrl: data.signedUrl });
}
