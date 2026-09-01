import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { STAFF_ROLES, type UserRole } from "@/types";
import { getPipeline } from "@/lib/pipelines";
import { normalisePrcStage } from "@/lib/prc-docs";

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

/**
 * What the ATTORNEY FIRM may set (071). Zewn, 2026-08-28: *"their only options
 * for the dropdown should be 'Needs to be done' 'already Done' 'not
 * applicable'"*.
 *
 * `completed` is absent and must stay absent: 069 created it to mean "WE
 * finished it", and it is the field the firm's delivery is read out of. A firm
 * setting it would assert that ConveyClear completed work.
 *
 * `already_done` IS here — it means somebody outside us already did this, which
 * is the attorney's to know, not ours.
 *
 * ⚠️ This list is the SECOND of two enforcement points, not the only one.
 * 071's trigger enforces the same three values in the database, because
 * PostgREST is reachable without this route. Keep them in step.
 */
const PARTNER_STATUSES = ["needed", "already_done", "not_applicable"] as const;

/**
 * The three rates-clearance stages (072). Zewn, 2026-08-31: "RCF, RCC and RCA
 * are all PRC matters, just at different levels. RCA is an application to open
 * a rates clearance account, RCF is to get rates clearance figures from the
 * account and RCC is to get a certificate."
 *
 * ⚠️ Must stay in step with transfer_services_prc_subtype_check (072) and with
 * PRC_SUBTYPES in lib/prc-docs.ts.
 */
const PRC_SUBTYPES = ["RCA", "RCF", "RCC"] as const;

/**
 * Rates, utilities, or both (075) — the COT sheet's "R+U / U only / R only".
 * Decides which account number and statement the council requires.
 */
const RATES_SCOPES = ["rates", "rates_and_utilities", "utilities"] as const;

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
  // 071 — the firm may mark, and may do nothing else. Staff keep the full PATCH.
  // RLS decides WHICH transfers they can reach (transfer_services_partner_mark
  // routes through can_access_transfer), and 071's trigger independently refuses
  // any column other than status. This check exists so a partner gets a sentence
  // instead of a database error.
  const isStaff = await callerIsStaff(supabase, user.id);

  let body: {
    id?: string;
    status?: string;
    thirdParty?: string | null;
    notes?: string | null;
    matterId?: string | null;
    prcSubtype?: string | null;
    ratesScope?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const id = clean(body.id, 64);
  if (!id) return NextResponse.json({ error: "id is required." }, { status: 400 });

  const allowed = isStaff ? STATUSES : PARTNER_STATUSES;

  const patch: Record<string, unknown> = {};
  if (body.status !== undefined) {
    if (!(allowed as readonly string[]).includes(body.status)) {
      return NextResponse.json(
        {
          error: isStaff
            ? `status must be one of: ${STATUSES.join(", ")}.`
            : // Named rather than a bare list: a firm that tried to set
              // "completed" should learn WHY it is not theirs to set, not just
              // that the value was rejected.
              `A firm may mark a service ${PARTNER_STATUSES.join(", ")}. ` +
              `Only ConveyClear can mark a service completed.`,
        },
        { status: isStaff ? 400 : 403 }
      );
    }
    patch.status = body.status;
  }

  // null is a meaningful value for these three — it clears the field — so they
  // are distinguished from "absent" rather than being coerced.
  //
  // 071: these three are STAFF ONLY. A firm sending them is refused outright
  // rather than having them quietly dropped — silently ignoring half a request
  // is how a caller comes to believe it worked.
  if (!isStaff) {
    if (
      body.thirdParty !== undefined ||
      body.notes !== undefined ||
      body.matterId !== undefined ||
      body.prcSubtype !== undefined ||
      body.ratesScope !== undefined
    ) {
      return NextResponse.json(
        { error: "A firm may only change the service marker." },
        { status: 403 }
      );
    }
  } else {
    if (body.thirdParty !== undefined) patch.third_party = clean(body.thirdParty, 120);
    if (body.notes !== undefined) patch.notes = clean(body.notes, 2000);
    if (body.matterId !== undefined) patch.matter_id = clean(body.matterId, 64);

    // 072 — which rates-clearance stage this PRC line is. null clears it,
    // which is why undefined and null are distinguished here.
    if (body.prcSubtype !== undefined) {
      const v = clean(body.prcSubtype, 8)?.toUpperCase() ?? null;
      if (v !== null && !(PRC_SUBTYPES as readonly string[]).includes(v)) {
        return NextResponse.json(
          { error: `A rates clearance stage must be one of: ${PRC_SUBTYPES.join(", ")}.` },
          { status: 400 }
        );
      }
      patch.prc_subtype = v;
    }

    // 075 — rates, utilities, or both.
    if (body.ratesScope !== undefined) {
      const v = clean(body.ratesScope, 32)?.toLowerCase() ?? null;
      if (v !== null && !(RATES_SCOPES as readonly string[]).includes(v)) {
        return NextResponse.json(
          { error: `A rates scope must be one of: ${RATES_SCOPES.join(", ")}.` },
          { status: 400 }
        );
      }
      patch.rates_scope = v;
    }
  }

  if (!Object.keys(patch).length) {
    return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
  }

  const { error } = await supabase.from("transfer_services").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // 🔴 The stage has to reach the MATTER, not just the checklist line.
  //
  // getPipeline() resolves a PRC matter on `matters.service_subtype`, and the
  // in-place intake picks its document list from the same field. A stage that
  // stops at the line leaves the matter reading "No pipeline configured" with an
  // empty checklist while the transfer page shows the stage set — which is
  // exactly the state J4483/KEA was found in.
  //
  // Fires when this request changed the stage OR attached a matter to the line,
  // because both are moments at which the two can fall out of step. Best-effort:
  // the line update has already succeeded and is the caller's actual request, so
  // a failure here must not report that change as rejected.
  if (patch.prc_subtype !== undefined || patch.matter_id !== undefined) {
    const { data: line } = await supabase
      .from("transfer_services")
      .select("matter_id, prc_subtype, service_code")
      .eq("id", id)
      .maybeSingle();
    const row = line as { matter_id?: string | null; prc_subtype?: string | null; service_code?: string | null } | null;
    if (row?.matter_id && (row.service_code ?? "").toUpperCase() === "PRC") {
      const stage = normalisePrcStage(row.prc_subtype);
      const { data: m } = await supabase
        .from("matters")
        .select("municipality, current_phase")
        .eq("id", row.matter_id)
        .maybeSingle();
      const mr = m as { municipality?: string | null; current_phase?: string | null } | null;
      const pipeline = getPipeline("PRC", mr?.municipality, stage);
      await supabase
        .from("matters")
        .update({
          service_subtype: stage,
          // A matter created while its stage was unknown was given no phase at
          // all — the pipeline could not resolve, so there was no pre-phase to
          // take. Setting the stage is the first moment it can have one. Only
          // ever fills a blank: a matter already moving through its pipeline is
          // not dragged back to New Instruction by an edit to the checklist.
          ...(mr?.current_phase || !pipeline ? {} : { current_phase: pipeline.prePhase.key }),
        })
        .eq("id", row.matter_id);
    }
  }

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
