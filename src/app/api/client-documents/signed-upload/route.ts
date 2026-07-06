import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { CLIENT_DOCS_BUCKET, clientObjectPath } from "@/lib/storage";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { STAFF_ROLES, type UserRole } from "@/types";

export const runtime = "nodejs";

// Mints a signed UPLOAD url for a reusable CLIENT-vault document (migration 025).
// Browser uploads straight to the client-documents bucket; the row is recorded
// by /api/client-documents/confirm. Staff-only for v1 (partners/clients reuse
// existing vault docs rather than adding new ones).
export async function POST(request: Request) {
  if (!rateLimit(`client-doc-upload:${clientIp(request)}`, 60, 60_000)) {
    return NextResponse.json({ message: "Too many requests." }, { status: 429 });
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ message: "Not authenticated" }, { status: 401 });
  const { data: me } = await supabase.from("users").select("role").eq("auth_user_id", user.id).maybeSingle();
  if (!me || !STAFF_ROLES.includes(me.role as UserRole)) {
    return NextResponse.json({ message: "Insufficient privilege" }, { status: 403 });
  }

  let body: { client_id?: string; file_name?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
  }
  const clientId = body.client_id;
  if (!clientId) return NextResponse.json({ message: "client_id is required" }, { status: 400 });

  // RLS returns the client only if the caller can access it.
  const { data: client } = await supabase.from("clients").select("id").eq("id", clientId).maybeSingle();
  if (!client) return NextResponse.json({ message: "Client not found or access denied" }, { status: 403 });

  const path = clientObjectPath(clientId, body.file_name ?? "file");
  const admin = createAdminClient();
  const { data, error } = await admin.storage.from(CLIENT_DOCS_BUCKET).createSignedUploadUrl(path);
  if (error || !data) {
    return NextResponse.json({ message: error?.message ?? "Could not create upload URL" }, { status: 500 });
  }
  return NextResponse.json({ bucket: CLIENT_DOCS_BUCKET, path, token: data.token, signedUrl: data.signedUrl });
}
