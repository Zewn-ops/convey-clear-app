import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaff } from "@/lib/staff";

export const runtime = "nodejs";

/**
 * Mark the attorney's original request details as used up, or bring them back.
 *
 * Hiding, never deleting (065). The request row is provenance for where the
 * party data came from — §84 of the 08-24 meeting makes the client record
 * canonical and the attorney's input the thing it was derived FROM — so this
 * only ever writes a timestamp.
 */
export async function PATCH(request: Request) {
  const auth = await requireStaff();
  if ("error" in auth) return NextResponse.json({ message: auth.error }, { status: auth.status });

  let body: { id?: string; dismissed?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
  }

  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!id) return NextResponse.json({ message: "id is required" }, { status: 400 });
  if (typeof body.dismissed !== "boolean") {
    return NextResponse.json({ message: "dismissed must be true or false" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("transfer_requests")
    .update(
      body.dismissed
        ? { details_dismissed_at: new Date().toISOString(), details_dismissed_by: auth.callerId }
        : { details_dismissed_at: null, details_dismissed_by: null }
    )
    .eq("id", id);

  if (error) return NextResponse.json({ message: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
