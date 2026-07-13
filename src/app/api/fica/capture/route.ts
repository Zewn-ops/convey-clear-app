import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionProfile } from "@/lib/auth";
import { isStaffRole, isPartnerRole } from "@/types";
import { ficaFields, CONSENT_TYPES, CAPTURE_METHODS, type CaptureMethod } from "@/lib/fica";

export const runtime = "nodejs";

// In-place FICA capture — the client details + consent that, until now, only the
// /onboard link could collect. Staff and the owning attorney firm can complete a
// matter without sending a link; /onboard stays as the self-serve option.
//
// Authorised by READING the matter through the caller's own RLS (the pattern used
// by /api/enquiries/matter and toggleDocUnavailable) and then writing with the
// service role — so a partner is confined to their firm's matters without a second
// access rule to keep in sync with can_access_matter().

interface Body {
  matter_id?: string;
  details?: Record<string, string | null>;
  directors?: {
    full_name?: string;
    surname?: string;
    cell?: string;
    work_number?: string;
    email?: string;
    designation?: string;
  }[];
  consents?: {
    popia?: boolean;
    terms?: boolean;
    marketing?: boolean;
    capture_method?: CaptureMethod;
    note?: string;
  };
}

export async function POST(request: Request) {
  const session = await getSessionProfile();
  const role = session?.profile?.role ?? null;
  const staff = isStaffRole(role);
  if (!staff && !isPartnerRole(role)) {
    return NextResponse.json({ message: "Insufficient privilege" }, { status: 403 });
  }

  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
  }

  const matterId = body.matter_id;
  if (!matterId) return NextResponse.json({ message: "matter_id is required" }, { status: 400 });

  // Authorise through the caller's own RLS.
  const supabase = await createClient();
  const { data: matter } = await supabase
    .from("matters")
    .select("id, client_id")
    .eq("id", matterId)
    .maybeSingle();
  if (!matter) return NextResponse.json({ message: "Matter not found or access denied" }, { status: 403 });

  const clientId = matter.client_id as string | null;
  if (!clientId) {
    return NextResponse.json(
      { message: "This matter has no client record yet — create one from the party first." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { data: client } = await admin
    .from("clients")
    .select("entity_type")
    .eq("id", clientId)
    .maybeSingle();
  const entity = client?.entity_type ?? "natural_person";

  // ------------------------------------------------------------------ details --
  if (body.details) {
    const allowed = ficaFields(entity);
    const patch: Record<string, unknown> = {};

    for (const f of allowed) {
      // Municipal-portal credentials are the CLIENT's council login. A partner has
      // no business holding them, so the field isn't merely hidden in their UI —
      // the API refuses to accept it from them.
      if (f.sensitive && !staff) continue;
      if (!(f.key in body.details)) continue;
      const v = body.details[f.key];
      patch[f.key] = v === "" || v === undefined ? null : v;
    }

    // Keep the denormalised full_name in step with the split fields, the way the
    // onboard submit does — otherwise a client renamed in place still shows their
    // old name everywhere full_name is rendered.
    if ("first_name" in patch || "last_name" in patch) {
      const first = (patch.first_name ?? null) as string | null;
      const last = (patch.last_name ?? null) as string | null;
      patch.full_name = `${first ?? ""} ${last ?? ""}`.trim() || null;
    }

    if (Object.keys(patch).length > 0) {
      patch.updated_at = new Date().toISOString();
      const { error } = await admin.from("clients").update(patch).eq("id", clientId);
      if (error) return NextResponse.json({ message: error.message }, { status: 400 });
    }
  }

  // ---------------------------------------------------------------- directors --
  // Replace-in-full: the form edits the whole list, so a removed director must
  // actually disappear. Scoped to is_director so other contacts survive.
  if (body.directors) {
    const rows = body.directors
      .filter((d) => (d.full_name ?? "").trim() || (d.email ?? "").trim())
      .map((d) => ({
        client_id: clientId,
        name: `${d.full_name ?? ""} ${d.surname ?? ""}`.trim(),
        email: d.email || null,
        cell: d.cell || null,
        work_number: d.work_number || null,
        designation: d.designation || null,
        is_director: true,
      }));

    await admin.from("contacts").delete().eq("client_id", clientId).eq("is_director", true);
    if (rows.length > 0) {
      const { error } = await admin.from("contacts").insert(rows);
      if (error) return NextResponse.json({ message: error.message }, { status: 400 });
    }
  }

  // ----------------------------------------------------------------- consents --
  if (body.consents) {
    const c = body.consents;
    const method = c.capture_method;

    // 🔒 The whole point of migration 033. Staff are not the data subject: they
    // cannot GIVE consent, only record that the client gave it — and must say how.
    // Writing it without a method would fabricate a client consent record.
    const anyGranted = CONSENT_TYPES.some((t) => c[t]);
    if (anyGranted && !method) {
      return NextResponse.json(
        { message: "Record how the client gave consent — it can't be ticked on their behalf." },
        { status: 400 }
      );
    }
    if (method && !CAPTURE_METHODS.some((m) => m.value === method)) {
      return NextResponse.json({ message: "Unknown consent capture method" }, { status: 400 });
    }

    const events = CONSENT_TYPES.map((t) => ({
      client_id: clientId,
      matter_id: matterId,
      consent_type: t,
      granted: Boolean(c[t]),
      source: "staff_captured",
      captured_by: session!.profile!.id,
      capture_method: method ?? null,
      note: c.note || null,
    })).filter((e) => e.granted || e.capture_method); // don't log empty non-events

    if (events.length > 0) {
      // consent_events is append-only — a later record supersedes an earlier one
      // by being later. Never update a consent in place; that erases the audit
      // trail POPIA exists to create.
      const { error } = await admin.from("consent_events").insert(events);
      if (error) return NextResponse.json({ message: error.message }, { status: 400 });

      // Mirror onto the client row the same way the onboard submit does, so the
      // rest of the app keeps reading one place for "has this client consented".
      const now = new Date().toISOString();
      await admin
        .from("clients")
        .update({
          popia_consent_at: c.popia ? now : null,
          terms_accepted_at: c.terms ? now : null,
          marketing_opt_in: Boolean(c.marketing),
          updated_at: now,
        })
        .eq("id", clientId);
    }
  }

  // Best-effort, but logged: activity_type carries a CHECK constraint, and an
  // unchecked await swallows the 23514 whole — which is how this entry silently
  // went missing until migration 035 legalised 'fica_capture'.
  const { error: actErr } = await admin.from("matter_activities").insert({
    matter_id: matterId,
    author_id: session!.profile!.id,
    activity_type: "fica_capture",
    body: body.consents
      ? "FICA details and consent recorded in place"
      : "FICA client details updated",
  });
  if (actErr) console.error("[fica/capture] activity insert failed:", actErr.message);

  return NextResponse.json({ ok: true });
}
