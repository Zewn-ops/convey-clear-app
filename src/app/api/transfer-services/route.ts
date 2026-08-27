import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { STAFF_ROLES, type UserRole } from "@/types";

export const runtime = "nodejs";

/**
 * The per-transfer service checklist (063) — the umbrella from the 2026-08-24
 * meeting, §108-124.
 *
 * Deliberately uses the CALLER's client, not the service role. RLS on
 * transfer_services routes through can_access_transfer() and
 * client_can_view_transfer(), so a firm can only touch a transfer it already
 * works and a client can only read. There is no code path here that could
 * widen that by accident.
 *
 * 🔴 WRITES ARE STAFF-ONLY, and that is a product rule, not a technical one.
 * §122 has the markers being set by ConveyClear because they drive what
 * ConveyClear actually does — a firm marking its own PRC "already done" would
 * be telling us what work to skip. The RLS policy is the real gate
 * (transfer_services_staff_all); this check exists so a partner gets an honest
 * 403 rather than a silent zero-row update.
 */

/**
 * ⚠️ Must stay in step with the CHECK on transfer_services.status (064, 069) and
 * with STATUS_LABEL in components/transfers/TransferServices.tsx. A value the
 * dropdown offers but this list rejects fails with a 400 that reads like a bug.
 *
 * `completed` added by 069 — work WE finished, as opposed to `already_done`,
 * which is somebody else's, from before or outside us.
 *
 * `not_specified` is deliberately ABSENT, and was before this change: it is
 * 064's starting state, what a row holds before anyone has decided anything.
 * Setting a service back to "nobody has decided" is not an action staff need,
 * and leaving it out keeps the marker a record of decisions rather than
 * something that can be un-decided.
 */
const STATUSES = ["needed", "completed", "already_done", "not_applicable"] as const;
type Status = (typeof STATUSES)[number];

async function callerIsStaff(supabase: Awaited<ReturnType<typeof createClient>>, authId: string) {
  const { data } = await supabase
    .from("users")
    .select("role")
    .eq("auth_user_id", authId)
    .maybeSingle();
  const role = (data?.role ?? null) as UserRole | null;
  return Boolean(role && STAFF_ROLES.includes(role));
}

function clean(v: unknown, max = 500): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim().slice(0, max);
  return s.length ? s : null;
}

/**
 * POST — either instantiate the default checklist for a transfer, or add one
 * sub-service under an existing line item.
 *
 *   { transferId }                       -> create the default seven
 *   { transferId, parentId, label }      -> add a sub-service
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  if (!rateLimit(`transfer-services:${clientIp(req)}`, 30, 60_000)) {
    return NextResponse.json({ error: "Too many requests. Try again shortly." }, { status: 429 });
  }
  if (!(await callerIsStaff(supabase, user.id))) {
    return NextResponse.json({ error: "Only ConveyClear staff can change the service list." }, { status: 403 });
  }

  let body: { transferId?: string; parentId?: string; label?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const transferId = clean(body.transferId, 64);
  if (!transferId) return NextResponse.json({ error: "transferId is required." }, { status: 400 });

  // Sub-service.
  if (body.parentId) {
    const label = clean(body.label, 120);
    if (!label) return NextResponse.json({ error: "A sub-service needs a name." }, { status: 400 });
    const { data, error } = await supabase
      .from("transfer_services")
      .insert({ transfer_id: transferId, parent_id: clean(body.parentId, 64), label })
      .select("id")
      .single();
    // The depth guard and the same-transfer guard live in the database (063),
    // so their messages are worth surfacing rather than flattening to "failed".
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ id: data.id }, { status: 201 });
  }

  // Default checklist. The function is idempotent and returns how many it
  // actually created, so a second click is harmless and says so.
  const { data, error } = await supabase.rpc("instantiate_transfer_services", {
    t_id: transferId,
    actor: null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ created: data ?? 0 });
}

/**
 * PATCH — set a marker, attribute a third party, note something, or link the
 * line item to the matter that realises it.
 */
export async function PATCH(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  if (!rateLimit(`transfer-services:${clientIp(req)}`, 60, 60_000)) {
    return NextResponse.json({ error: "Too many requests. Try again shortly." }, { status: 429 });
  }
  if (!(await callerIsStaff(supabase, user.id))) {
    return NextResponse.json({ error: "Only ConveyClear staff can change the service list." }, { status: 403 });
  }

  let body: {
    id?: string;
    status?: string;
    thirdParty?: string | null;
    notes?: string | null;
    matterId?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const id = clean(body.id, 64);
  if (!id) return NextResponse.json({ error: "id is required." }, { status: 400 });

  const patch: Record<string, unknown> = {};
  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status as Status)) {
      return NextResponse.json(
        { error: `status must be one of: ${STATUSES.join(", ")}.` },
        { status: 400 }
      );
    }
    patch.status = body.status;
  }
  // null is a meaningful value for these three — it clears the field — so they
  // are distinguished from "absent" rather than being coerced.
  if (body.thirdParty !== undefined) patch.third_party = clean(body.thirdParty, 120);
  if (body.notes !== undefined) patch.notes = clean(body.notes, 2000);
  if (body.matterId !== undefined) patch.matter_id = clean(body.matterId, 64);

  if (!Object.keys(patch).length) {
    return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
  }

  const { error } = await supabase.from("transfer_services").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

/** DELETE — remove a line item. Sub-services cascade with their parent. */
export async function DELETE(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  if (!(await callerIsStaff(supabase, user.id))) {
    return NextResponse.json({ error: "Only ConveyClear staff can change the service list." }, { status: 403 });
  }

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required." }, { status: 400 });

  const { error } = await supabase.from("transfer_services").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
