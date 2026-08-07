import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { notifyStaff } from "@/lib/notify";

export const runtime = "nodejs";

/**
 * Record a refused self-signup and tell staff about it (Meeting 2 §80, 057).
 *
 * The database is what actually refuses the account — handle_new_user raises,
 * which rolls the auth.users insert back, and takes any row it wrote with it.
 * So the notification has to be sent from out here, after the failure.
 *
 * UNAUTHENTICATED by necessity: the caller is someone who could not sign up.
 * Three things keep that from being a hole:
 *
 *   1. It ALWAYS returns the same 200. It never reveals whether the email
 *      matched, so it cannot be used as a contact-enumeration oracle.
 *   2. It only writes a row when the email genuinely matches a contact card,
 *      checked here server-side. Posting random addresses fills nothing.
 *   3. It is rate limited per IP, and re-posting the same address inside the
 *      window updates nothing rather than stacking duplicate queue items.
 *
 * ⚠️ The signup FORM still leaks a little: a refused signup looks different to
 * an accepted one, so a determined prober learns "this address is known to
 * ConveyClear". That is inherent to §80 — you cannot both refuse the account
 * and act as though nothing happened. Flagged rather than assumed.
 */
export async function POST(request: Request) {
  // Always-200 shape, declared once so no branch below can forget it.
  const ok = () => NextResponse.json({ ok: true });

  if (!rateLimit(`signup-blocked:${clientIp(request)}`, 10, 60_000)) return ok();

  let body: { email?: string; full_name?: string };
  try {
    body = await request.json();
  } catch {
    return ok();
  }

  const email = (body.email ?? "").trim().toLowerCase();
  const fullName = (body.full_name ?? "").trim() || null;
  if (!email || !email.includes("@")) return ok();

  const admin = createAdminClient();

  // Only record a REAL collision. This is what stops the queue being a dumping
  // ground for whatever addresses someone felt like posting.
  const { data: match } = await admin
    .from("clients")
    .select("id")
    .ilike("primary_email", email)
    .maybeSingle();
  if (!match) return ok();

  // Already queued and not yet dealt with? Leave it alone — one person trying
  // three times is one thing for staff to action, not three.
  const { data: existing } = await admin
    .from("signup_requests")
    .select("id")
    .ilike("email", email)
    .eq("status", "pending")
    .maybeSingle();
  if (existing) return ok();

  const { error } = await admin.from("signup_requests").insert({
    email,
    full_name: fullName,
    matched_client_id: match.id,
    status: "pending",
  });
  if (error) {
    console.error("[signup-blocked] could not record request:", error.message);
    return ok();
  }

  await notifyStaff({
    type: "signup_request",
    title: "Someone tried to register on an existing contact",
    body: email,
    link: "/admin/signup-requests",
  });

  return ok();
}
