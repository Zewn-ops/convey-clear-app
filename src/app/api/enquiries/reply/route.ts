import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { notifyMatterParties, notifyStaff, notifyUsers } from "@/lib/notify";
import { enquiryAuthorLabel } from "@/lib/enquiries";
import { STAFF_ROLES, type UserRole } from "@/types";

export const runtime = "nodejs";

// Post a reply to an enquiry. Staff, the owning partner, or — on a 'shared'
// matter thread (migration 027) — the matter's client. RLS decides who can see
// the enquiry, which is what authorises the reply. Bumps updated_at so the
// inbox re-sorts.
export async function POST(request: Request) {
  if (!rateLimit(`enquiry-reply:${clientIp(request)}`, 40, 60_000)) {
    return NextResponse.json({ message: "Too many requests." }, { status: 429 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ message: "Not authenticated" }, { status: 401 });

  let body: { enquiry_id?: string; body?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
  }
  const enquiryId = body.enquiry_id;
  const text = (body.body ?? "").trim();
  if (!enquiryId || !text) {
    return NextResponse.json({ message: "enquiry_id and a message are required" }, { status: 400 });
  }

  // RLS: enquiry visible only to staff, the owning partner, or (shared matter
  // thread) the matter's client → seeing it authorises replying to it.
  const { data: enquiry } = await supabase
    .from("enquiries")
    .select("id, subject, created_by, assigned_to, matter_id, visibility")
    .eq("id", enquiryId)
    .maybeSingle();
  if (!enquiry) return NextResponse.json({ message: "Enquiry not found or access denied" }, { status: 403 });

  const { data: me } = await supabase
    .from("users")
    .select("id, full_name, role")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  const role = (me?.role ?? null) as UserRole | null;

  const admin = createAdminClient();
  const { error } = await admin.from("enquiry_messages").insert({
    enquiry_id: enquiryId,
    author_id: me?.id ?? null,
    author_label: enquiryAuthorLabel(role),
    body: text,
  });
  if (error) return NextResponse.json({ message: error.message }, { status: 400 });

  await admin.from("enquiries").update({ updated_at: new Date().toISOString() }).eq("id", enquiryId);

  const e = enquiry as {
    id: string;
    subject: string | null;
    created_by: string | null;
    assigned_to: string | null;
    matter_id: string | null;
    visibility: string;
  };
  const replierIsStaff = STAFF_ROLES.includes((role ?? "") as UserRole);
  const payload = { type: "enquiry_reply", title: `Reply: ${e.subject ?? "enquiry"}`, body: text.slice(0, 140), enquiry_id: e.id };

  if (e.matter_id && e.visibility === "shared") {
    // Shared matter thread: it has three sides, so "the other side" is everyone
    // else on the matter. Staff aren't matter parties, so ping them separately
    // when the replier isn't one of them.
    await notifyMatterParties(e.matter_id, payload, { excludeUserId: me?.id ?? null });
    if (!replierIsStaff) await notifyStaff(payload, { enquiryPref: true });
  } else if (replierIsStaff) {
    // Firm channel: staff reply → the partner who raised it.
    await notifyUsers([e.created_by], payload);
  } else if (e.assigned_to) {
    await notifyUsers([e.assigned_to], payload);
  } else {
    await notifyStaff(payload, { enquiryPref: true });
  }

  return NextResponse.json({ ok: true });
}
