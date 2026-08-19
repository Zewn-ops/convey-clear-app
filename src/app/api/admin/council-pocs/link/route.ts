import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { type UserRole } from "@/types";
import { requireStaff } from "@/lib/staff";

export const runtime = "nodejs";

// B5 / Theme G — link or unlink an existing Council POC to a matter.
//   POST   { matter_id, council_poc_id }  → link  (idempotent; UNIQUE pair)
//   DELETE ?matter_id=&council_poc_id=    → unlink

export async function POST(request: Request) {
  const auth = await requireStaff();
  if ("error" in auth) return NextResponse.json({ message: auth.error }, { status: auth.status });

  let body: { matter_id?: string; council_poc_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
  }
  const matterId = (body.matter_id ?? "").trim();
  const pocId = (body.council_poc_id ?? "").trim();
  if (!matterId || !pocId) {
    return NextResponse.json({ message: "matter_id and council_poc_id are required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("matter_council_pocs")
    .upsert({ matter_id: matterId, council_poc_id: pocId }, { onConflict: "matter_id,council_poc_id", ignoreDuplicates: true });
  if (error) return NextResponse.json({ message: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const auth = await requireStaff();
  if ("error" in auth) return NextResponse.json({ message: auth.error }, { status: auth.status });

  const url = new URL(request.url);
  const matterId = url.searchParams.get("matter_id");
  const pocId = url.searchParams.get("council_poc_id");
  if (!matterId || !pocId) {
    return NextResponse.json({ message: "matter_id and council_poc_id are required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("matter_council_pocs")
    .delete()
    .eq("matter_id", matterId)
    .eq("council_poc_id", pocId);
  if (error) return NextResponse.json({ message: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
