import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { requireStaff } from "@/lib/staff";
import { logTransferActivity } from "@/lib/activity";

export const runtime = "nodejs";

/**
 * Cancel, archive, or reopen a property transfer (084).
 *
 * WHY THIS IS NOT A DELETE, AND NOT THE STATUS DROPDOWN EITHER
 *
 * There is still no DELETE on a transfer, for the reason the sibling
 * route has always given: matters.transfer_id is ON DELETE SET NULL, so
 * removing one silently orphans the work under it. And a transfer is not
 * ours alone — a firm and a client also remember it.
 *
 * `cancelled` HAS been settable all along, from a dropdown on the Edit
 * screen, with no reason captured and no effect on any list. That is
 * worse than nothing: it looks like an action and behaves like a typo.
 * So this route exists to make it a deliberate act with a reason
 * attached, which is what anyone asks for afterwards.
 *
 * 🔴 THE TWO ARE DIFFERENT EVENTS.
 *   cancel  — the transaction died. It happened; the firm and the client
 *             keep seeing it, with the reason. It stops being live work.
 *   archive — it should never have existed (a typo, a duplicate, a
 *             test). Nothing happened from the client's side, so they
 *             stop seeing it entirely.
 *
 * Reopening exists because both are mistakes people make about mistakes.
 */
const ACTIONS = ["cancel", "archive", "reopen"] as const;
type Action = (typeof ACTIONS)[number];

const STATUS_FOR: Record<Action, string> = {
  cancel: "cancelled",
  archive: "archived",
  reopen: "open",
};

export async function POST(request: Request) {
  if (!rateLimit(`transfer-close:${clientIp(request)}`, 20, 60_000)) {
    return NextResponse.json({ message: "Too many requests." }, { status: 429 });
  }

  const auth = await requireStaff();
  if ("error" in auth) return NextResponse.json({ message: auth.error }, { status: auth.status });

  let body: { id?: string; action?: string; reason?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
  }

  const id = (body.id ?? "").trim();
  const action = (body.action ?? "") as Action;
  const reason = (body.reason ?? "").trim();

  if (!id) return NextResponse.json({ message: "id is required" }, { status: 400 });
  if (!ACTIONS.includes(action)) {
    return NextResponse.json(
      { message: `action must be one of: ${ACTIONS.join(", ")}` },
      { status: 400 }
    );
  }
  // A reason is required to close, not to reopen. Closing is the one that
  // removes a transaction from everyone's working view, and "why is this
  // gone" is the only question anyone asks about it afterwards.
  if (action !== "reopen" && !reason) {
    return NextResponse.json(
      { message: "Give a reason — it is shown to the firm and recorded on the transfer." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  const { data: transfer } = await admin
    .from("property_transfers")
    .select("id, reference, status")
    .eq("id", id)
    .maybeSingle();
  if (!transfer) {
    return NextResponse.json({ message: "Transfer not found" }, { status: 404 });
  }

  const next = STATUS_FOR[action];
  if (transfer.status === next) {
    return NextResponse.json({ message: `This transfer is already ${next}.` }, { status: 409 });
  }
  // A draft has never been accepted, so there is nothing to cancel and
  // nothing a client was told. Declining the request is that path.
  if (transfer.status === "draft" && action !== "archive") {
    return NextResponse.json(
      { message: "This transfer is still a draft — decline the request instead." },
      { status: 409 }
    );
  }

  // How many matters ride on this. NOT a blocker: a transaction that
  // collapses takes its matters with it, and refusing to record that
  // because work exists underneath would send staff back to the
  // dropdown that has no reason field. Reported so the activity entry
  // says what was affected.
  const { count: matterCount } = await admin
    .from("matters")
    .select("id", { count: "exact", head: true })
    .eq("transfer_id", id);

  const { error } = await admin
    .from("property_transfers")
    .update({
      status: next,
      status_reason: action === "reopen" ? null : reason,
      status_changed_at: new Date().toISOString(),
      status_changed_by: auth.callerId,
    })
    .eq("id", id);
  if (error) return NextResponse.json({ message: error.message }, { status: 400 });

  const verb =
    action === "cancel" ? "Cancelled" : action === "archive" ? "Archived" : "Reopened";
  const matters = matterCount ?? 0;
  await logTransferActivity(admin, {
    transferId: id,
    activityType: "status_change",
    authorId: auth.callerId,
    authorLabel: "ConveyClear",
    body:
      action === "reopen"
        ? "Transfer reopened."
        : `${verb}: ${reason}` +
          (matters > 0
            ? ` · ${matters} matter${matters === 1 ? "" : "s"} still attached — they keep running.`
            : ""),
  });

  return NextResponse.json({ ok: true, status: next, matters });
}
