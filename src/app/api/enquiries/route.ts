import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { isStaffRole, type UserRole } from "@/types";

export const runtime = "nodejs";

/**
 * Staff raise an enquiry ON BEHALF of a firm.
 *
 * Enquiries were partner-initiated only, which meant a question that arrived by
 * phone or email had nowhere to live — the thread that answers it started
 * outside the portal and stayed there. Recording it here puts the firm's own
 * reply channel on the same thread.
 *
 * The firm is required rather than optional: an enquiry with no firm is visible
 * to nobody on the partner side, which is a support ticket, not an enquiry.
 */
export async function POST(request: Request) {
  if (!rateLimit(`staff-enquiry:${clientIp(request)}`, 20, 60_000)) {
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
  if (!isStaffRole((me?.role ?? null) as UserRole | null)) {
    return NextResponse.json({ message: "Staff only" }, { status: 403 });
  }

  let body: { subject?: string; message?: string; firm_id?: string; matter_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
  }

  const subject = (body.subject ?? "").trim();
  const message = (body.message ?? "").trim();
  const firmId = (body.firm_id ?? "").trim();
  if (!subject) return NextResponse.json({ message: "A subject is required" }, { status: 400 });
  if (!message) return NextResponse.json({ message: "A message is required" }, { status: 400 });
  if (!firmId) return NextResponse.json({ message: "Pick the firm this is with" }, { status: 400 });

  const admin = createAdminClient();

  // The matter, if given, must actually belong to the firm named — otherwise the
  // enquiry would surface a matter to a firm that does not work it.
  let matterId: string | null = null;
  if (body.matter_id) {
    const { data: m } = await admin
      .from("matters")
      .select("id")
      .eq("id", body.matter_id)
      .eq("business_partner_id", firmId)
      .maybeSingle();
    if (!m) {
      return NextResponse.json(
        { message: "That matter does not belong to the firm you picked." },
        { status: 400 }
      );
    }
    matterId = m.id;
  }

  const { data: enquiry, error } = await admin
    .from("enquiries")
    .insert({
      business_partner_id: firmId,
      matter_id: matterId,
      created_by: me!.id,
      subject,
      message,
      // Staff-raised enquiries start ASSIGNED to the person raising them: they
      // already own it, and dropping it into the open queue would invite a
      // colleague to claim something that is not waiting for anyone.
      status: "assigned",
      assigned_to: me!.id,
    })
    .select("id")
    .single();
  if (error) return NextResponse.json({ message: error.message }, { status: 400 });

  return NextResponse.json({ ok: true, id: enquiry.id });
}
