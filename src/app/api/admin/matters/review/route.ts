import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logMatterActivity } from "@/lib/activity";
import { notifyMatterParties } from "@/lib/notify";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { isStaffRole, type UserRole } from "@/types";

export const runtime = "nodejs";

/**
 * ConveyClear's answer to a matter a firm proposed (098).
 *
 * Marlene: the firm's matter lands "in a draft stage", and "ConveyClear can then
 * go in and approve/reject the matter based on what was provided". This is that
 * decision and nothing else — it does not move the matter's phase, stage or
 * status, because accepting a piece of work and starting it are two different
 * acts and collapsing them would mark work as begun that nobody has begun.
 */
export async function POST(request: Request) {
  if (!rateLimit(`matter-review:${clientIp(request)}`, 60, 60_000)) {
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

  let body: { matter_id?: string; decision?: string; note?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid request body" }, { status: 400 });
  }

  const matterId = (body.matter_id ?? "").trim();
  const decision = (body.decision ?? "").trim();
  const note = (body.note ?? "").trim();
  if (!matterId || (decision !== "approved" && decision !== "rejected")) {
    return NextResponse.json({ message: "A matter and a decision are required" }, { status: 400 });
  }
  // A rejection without a reason is the thing Marlene was asking us to avoid —
  // the firm is told no and has to ring up to find out what was missing.
  if (decision === "rejected" && !note) {
    return NextResponse.json(
      { message: "Say why, so the firm knows what to fix." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  const { data: matter } = await admin
    .from("matters")
    .select("id, title, firm_review_state, current_owner_id")
    .eq("id", matterId)
    .maybeSingle();
  if (!matter) return NextResponse.json({ message: "Matter not found" }, { status: 404 });
  if (matter.firm_review_state !== "pending") {
    // Not an error worth failing loudly on, but the caller must not be told a
    // decision was recorded when it was not — two reviewers on one queue.
    return NextResponse.json(
      { message: "That matter has already been answered." },
      { status: 409 }
    );
  }

  const { error } = await admin
    .from("matters")
    .update({
      firm_review_state: decision,
      firm_review_note: note || null,
      firm_review_at: new Date().toISOString(),
      firm_review_by: me!.id,
      // Taking the work on makes the reviewer its owner. Rejecting leaves it
      // unowned — nobody at ConveyClear is doing it.
      ...(decision === "approved" ? { current_owner_id: matter.current_owner_id ?? me!.id } : {}),
    })
    .eq("id", matterId)
    // Conditional, so the loser of a race updates nothing rather than
    // overwriting the winner's decision.
    .eq("firm_review_state", "pending");
  if (error) return NextResponse.json({ message: error.message }, { status: 400 });

  await logMatterActivity(admin, {
    matterId,
    authorId: me!.id,
    activityType: "status_change",
    body: decision === "approved" ? "Accepted by ConveyClear" : `Rejected by ConveyClear — ${note}`,
  });

  // The firm hears either way. notifyMatterParties reaches the firm's users and
  // the matter's client; a rejected matter is still invisible to the client
  // under 098's read policy, so this cannot leak a refusal to the buyer.
  await notifyMatterParties(
    matterId,
    {
      type: "matter",
      title:
        decision === "approved"
          ? `ConveyClear has taken on ${matter.title}`
          : `ConveyClear cannot take on ${matter.title}`,
      body: note.slice(0, 140) || "Opened and in progress.",
      matter_id: matterId,
    },
    { excludeUserId: me!.id }
  );

  return NextResponse.json({ ok: true, decision });
}
