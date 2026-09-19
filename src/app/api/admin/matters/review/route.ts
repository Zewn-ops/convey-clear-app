import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logMatterActivity } from "@/lib/activity";
import { notifyMatterParties } from "@/lib/notify";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { isStaffRole, type UserRole } from "@/types";
import { getPipeline } from "@/lib/pipelines";

export const runtime = "nodejs";

/**
 * ConveyClear's answer to a matter a firm proposed (098).
 *
 * Marlene: the firm's matter lands "in a draft stage", and "ConveyClear can then
 * go in and approve/reject the matter based on what was provided".
 *
 * ── REVERSAL, 2026-09-18: TAKING IT ON NOW MOVES THE PHASE ─────────────────
 *
 * This route used to record the decision and nothing else, on the reasoning
 * that "accepting a piece of work and starting it are two different acts, and
 * collapsing them would mark work as begun that nobody has begun."
 *
 * Jukka, walking a building-plans matter through: "So first let's take it on,
 * saying that we approve that we will do this service… when I say take it on,
 * can we have the instruction automatically move to onboarding? Make a note of
 * that."
 *
 * The earlier reasoning was sound and its premise was wrong. Onboarding is not
 * "the work has begun" — it is "the file is ours now, and receiving documents is
 * the next thing that happens to it". Leaving an accepted matter parked in New
 * Instruction meant every take-on needed a second, manual phase change that said
 * nothing the acceptance had not already said, and left a queue full of matters
 * at New Instruction that nobody had actually failed to start.
 *
 * ⚠️ THE STAGE IS DELIBERATELY LEFT UNSET, and that is the half that matters.
 * Jukka, unprompted, in the same breath: "Documents received won't be selected,
 * because we physically check. So moving from new instruction to onboarding will
 * be pre-selected, but not documents received — because it could be documents
 * outstanding or documents verified."
 *
 * Every stage in the onboarding phase records a human having looked at
 * something. Ticking one on the machine's behalf would put a claim in the file
 * that nobody made.
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
    // service + municipality + subtype are what resolve the pipeline, and
    // current_phase is read so an accepted matter that has ALREADY been moved on
    // by hand is not dragged backwards to onboarding.
    .select(
      "id, title, firm_review_state, current_owner_id, current_phase, municipality, service_subtype, services(code)"
    )
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

  // The first real phase of THIS matter's pipeline — resolved rather than
  // hardcoded to "onboarding". Every pipeline today opens on onboarding after
  // the new_instruction prePhase, but a pipeline that did not would otherwise be
  // silently sent to a phase it does not contain, and nothing would error.
  //
  // Only applied when the matter is still sitting at the prePhase. A matter
  // someone has already advanced by hand keeps where it is: accepting it must
  // never move work backwards.
  const pipeline =
    decision === "approved"
      ? getPipeline(
          (matter.services as { code?: string } | null)?.code ?? null,
          matter.municipality as string | null,
          matter.service_subtype as string | null
        )
      : null;
  const atPrePhase =
    !matter.current_phase || matter.current_phase === pipeline?.prePhase.key;
  const advanceTo = pipeline && atPrePhase ? pipeline.phases[0]?.key ?? null : null;

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
      // Onboarding, with NO stage. See the ⚠️ in the module comment: the stage
      // is a human's claim to make, not ours.
      ...(advanceTo ? { current_phase: advanceTo, current_stage: null } : {}),
    })
    .eq("id", matterId)
    // Conditional, so the loser of a race updates nothing rather than
    // overwriting the winner's decision.
    .eq("firm_review_state", "pending");
  if (error) return NextResponse.json({ message: error.message }, { status: 400 });

  // The phase move is named in the entry rather than left implicit. "Last
  // update" reads the newest activity row (096), so a matter that silently
  // changed phase would show an acceptance and no reason for where it now sits.
  const advancedLabel = advanceTo
    ? pipeline?.phases[0]?.internalName ?? advanceTo
    : null;
  await logMatterActivity(admin, {
    matterId,
    authorId: me!.id,
    activityType: "status_change",
    body:
      decision === "approved"
        ? advancedLabel
          ? `Accepted by ConveyClear — moved to ${advancedLabel}`
          : "Accepted by ConveyClear"
        : `Rejected by ConveyClear — ${note}`,
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
