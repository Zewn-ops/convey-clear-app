import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { notifyMatterParties, notifyStaff } from "@/lib/notify";
import { isStaffRole, type UserRole } from "@/types";

export const runtime = "nodejs";

// Open a SHARED enquiry thread on a matter (A&A #3). Staff, the owning partner
// firm, or the matter's client — whoever can see the matter can start a thread
// on it, and everyone on the matter can read it.
//
// Always written with visibility 'shared'. The 'partner' visibility (the default,
// and what every pre-027 row carries) is reserved for the firm's own channel via
// /api/partner/enquiry and is never produced here.
export async function POST(request: Request) {
  if (!rateLimit(`enquiry-matter:${clientIp(request)}`, 20, 60_000)) {
    return NextResponse.json({ message: "Too many requests." }, { status: 429 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ message: "Not authenticated" }, { status: 401 });

  let body: { matter_id?: string; subject?: string; message?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
  }

  const matterId = (body.matter_id ?? "").trim();
  const subject = (body.subject ?? "").trim();
  const message = (body.message ?? "").trim();
  if (!matterId) return NextResponse.json({ message: "matter_id is required" }, { status: 400 });
  if (!subject) return NextResponse.json({ message: "A subject is required" }, { status: 400 });
  if (!message) return NextResponse.json({ message: "A message is required" }, { status: 400 });

  // Authorisation is the matter's own RLS: this read succeeds only if the caller
  // can access the matter (staff / owning firm / the client). No role branch.
  const { data: matter } = await supabase
    .from("matters")
    .select("id, business_partner_id")
    .eq("id", matterId)
    .maybeSingle();
  if (!matter) return NextResponse.json({ message: "Matter not found or access denied" }, { status: 403 });

  const { data: me } = await supabase
    .from("users")
    .select("id, role")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  const admin = createAdminClient();
  const { data: enquiry, error } = await admin
    .from("enquiries")
    .insert({
      // Carry the firm so the thread also surfaces in that firm's enquiry list.
      business_partner_id: (matter as { business_partner_id: string | null }).business_partner_id,
      matter_id: matterId,
      created_by: me?.id ?? null,
      subject,
      message,
      status: "open",
      visibility: "shared",
    })
    .select("id")
    .single();
  if (error) return NextResponse.json({ message: error.message }, { status: 400 });

  const payload = {
    type: "enquiry",
    title: `New enquiry: ${subject}`,
    body: message.slice(0, 140),
    enquiry_id: enquiry.id,
    matter_id: matterId,
  };
  // Everyone else on the matter, plus staff (who are not matter parties, so
  // notifyMatterParties would skip them unless they happen to be subscribers).
  await notifyMatterParties(matterId, payload, { excludeUserId: me?.id ?? null });
  if (!isStaffRole((me?.role ?? null) as UserRole | null)) {
    await notifyStaff(payload, { enquiryPref: true });
  }

  return NextResponse.json({ ok: true, enquiry_id: enquiry.id });
}
