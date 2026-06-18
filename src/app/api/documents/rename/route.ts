import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { STAFF_ROLES, type UserRole } from "@/types";

export const runtime = "nodejs";

// B1 — staff renames a document's display name (documents.file_name). The stored
// object path is unchanged; this only relabels how the file shows + downloads.
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ message: "Not authenticated" }, { status: 401 });
  const { data: me } = await supabase.from("users").select("role").eq("auth_user_id", user.id).maybeSingle();
  const role = (me?.role ?? null) as UserRole | null;
  if (!role || !STAFF_ROLES.includes(role)) {
    return NextResponse.json({ message: "Insufficient privilege" }, { status: 403 });
  }

  let body: { document_id?: string; name?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
  }
  const id = body.document_id ?? "";
  const name = (body.name ?? "").trim();
  if (!id || !name) return NextResponse.json({ message: "document_id and name are required" }, { status: 400 });

  const admin = createAdminClient();
  const { error } = await admin.from("documents").update({ file_name: name }).eq("id", id);
  if (error) return NextResponse.json({ message: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, name });
}
