import { NextResponse } from "next/server";
import { requirePartner } from "@/lib/partner";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit, clientIp } from "@/lib/ratelimit";

export const runtime = "nodejs";

// A partner raises a matter enquiry. Lands in the central staff inbox
// (/admin/enquiries) for any ConveyClear staff to claim + answer.
export async function POST(request: Request) {
  if (!rateLimit(`enquiry:${clientIp(request)}`, 20, 60_000)) {
    return NextResponse.json({ message: "Too many requests." }, { status: 429 });
  }
  const auth = await requirePartner();
  if ("error" in auth) {
    return NextResponse.json({ message: auth.error }, { status: auth.status });
  }

  let body: { subject?: string; message?: string; matter_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
  }
  const subject = (body.subject ?? "").trim();
  const message = (body.message ?? "").trim();
  if (!subject) return NextResponse.json({ message: "A subject is required" }, { status: 400 });
  if (!message) return NextResponse.json({ message: "A message is required" }, { status: 400 });

  const admin = createAdminClient();

  // If a matter is referenced, confirm it belongs to this partner's firm.
  let matterId: string | null = null;
  if (body.matter_id) {
    const { data: m } = await admin
      .from("matters")
      .select("id")
      .eq("id", body.matter_id)
      .eq("business_partner_id", auth.partnerId)
      .maybeSingle();
    matterId = m?.id ?? null;
  }

  const { data: enquiry, error } = await admin
    .from("enquiries")
    .insert({
      business_partner_id: auth.partnerId,
      matter_id: matterId,
      created_by: auth.userId,
      subject,
      message,
      status: "open",
    })
    .select("id")
    .single();
  if (error) return NextResponse.json({ message: error.message }, { status: 400 });

  return NextResponse.json({ ok: true, enquiry_id: enquiry.id });
}
