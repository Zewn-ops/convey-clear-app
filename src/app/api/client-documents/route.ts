import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// List a client's reusable vault documents. RLS (can_access_client) gates the
// rows, so staff, the client themselves, and the client's partner can read them.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get("client_id");
  if (!clientId) return NextResponse.json({ message: "client_id is required" }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ message: "Not authenticated" }, { status: 401 });

  const { data, error } = await supabase
    .from("client_documents")
    .select("id, client_id, document_type, file_name, mime_type, size_bytes, storage_bucket, storage_path, uploaded_by, created_at")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ message: error.message }, { status: 400 });

  return NextResponse.json({ documents: data ?? [] });
}
