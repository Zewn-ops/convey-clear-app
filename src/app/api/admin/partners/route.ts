import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PARTNER_TYPES, type PartnerType } from "@/types";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { requireAdmin } from "@/lib/staff";
import { isValidFirmCode } from "@/lib/firm-reference";

export const runtime = "nodejs";

// Business-partner (firm) orgs. Admin / super_admin only.
//   POST   create a firm. A partner USER is then created against it via /api/admin/users.
//   PATCH  update a firm, including deactivating it.
// No DELETE: users, clients, matters and property_transfers all carry a
// business_partner_id FK. Retiring a firm = `active: false`, which drops it from
// the pickers while every historical row keeps pointing at a real org.

type FirmFields = {
  name?: string;
  abbreviation?: string;
  partner_type?: string;
  primary_email?: string;
  primary_cell?: string;
  physical_address?: string;
  notes?: string;
  active?: boolean;
};

function clean(v?: string | null): string | null {
  const s = (v ?? "").trim();
  return s.length ? s : null;
}

function partnerType(v?: string): PartnerType {
  return PARTNER_TYPES.includes(v as PartnerType) ? (v as PartnerType) : "law_firm";
}

// The abbreviation is a short firm code ("BSI") shown next to matter titles, so
// it is upper-cased on write rather than trusted from the form.
//
// 100 — it is now also the PREFIX ON EVERY TRANSFER REFERENCE THIS FIRM ISSUES,
// which is what makes two firms able to run the same file number. That promotes
// it from a display nicety to a key, so the format is checked here rather than
// left to the database: a 23514 on a CHECK constraint is not a sentence anyone
// can act on, and this field is edited by staff, not developers.
function firmPayload(body: FirmFields) {
  const abbr = clean(body.abbreviation);
  return {
    partner_type: partnerType(body.partner_type),
    abbreviation: abbr ? abbr.toUpperCase() : null,
    primary_email: clean(body.primary_email),
    primary_cell: clean(body.primary_cell),
    physical_address: clean(body.physical_address),
    notes: clean(body.notes),
  };
}

/**
 * Reject a malformed or already-taken firm code with a sentence.
 *
 * Returns null when the code is fine. Uniqueness is checked here AND enforced by
 * `uq_firms_abbreviation` — this one produces the readable message,
 * the index is what actually holds under a race.
 */
async function firmCodeProblem(
  admin: ReturnType<typeof createAdminClient>,
  code: string | null,
  selfId?: string
): Promise<string | null> {
  if (!code) return null;
  if (!isValidFirmCode(code)) {
    return "The firm code must be 2 to 6 letters or digits, with no spaces or punctuation — for example BSI.";
  }

  let q = admin.from("firms").select("id, name").ilike("abbreviation", code);
  if (selfId) q = q.neq("id", selfId);
  const { data: taken } = await q.limit(1).maybeSingle();
  if (taken) {
    const other = (taken as { name: string | null }).name ?? "another firm";
    return `The code ${code} is already used by ${other}. Every firm needs its own — it is what keeps two firms' file numbers apart.`;
  }
  return null;
}

export async function POST(request: Request) {
  if (!rateLimit(`firm:${clientIp(request)}`, 40, 60_000)) {
    return NextResponse.json({ message: "Too many requests." }, { status: 429 });
  }
  const auth = await requireAdmin();
  if ("error" in auth) return NextResponse.json({ message: auth.error }, { status: auth.status });

  let body: FirmFields;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
  }

  const name = clean(body.name);
  if (!name) return NextResponse.json({ message: "Firm name is required" }, { status: 400 });

  const admin = createAdminClient();
  const payload = firmPayload(body);
  const codeProblem = await firmCodeProblem(admin, payload.abbreviation);
  if (codeProblem) return NextResponse.json({ message: codeProblem }, { status: 400 });

  const { data, error } = await admin
    .from("firms")
    .insert({ name, ...payload, created_by: auth.callerId })
    .select("*")
    .single();

  if (error) return NextResponse.json({ message: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, partner: data });
}

export async function PATCH(request: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return NextResponse.json({ message: auth.error }, { status: auth.status });

  let body: FirmFields & { id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
  }

  const id = clean(body.id);
  if (!id) return NextResponse.json({ message: "id is required" }, { status: 400 });

  const name = clean(body.name);
  if (!name) return NextResponse.json({ message: "Firm name is required" }, { status: 400 });

  const admin = createAdminClient();
  const payload = firmPayload(body);
  // Scoped to OTHER firms — a firm keeping its own code on an unrelated edit is
  // not a clash with itself.
  const codeProblem = await firmCodeProblem(admin, payload.abbreviation, id);
  if (codeProblem) return NextResponse.json({ message: codeProblem }, { status: 400 });

  const { data, error } = await admin
    .from("firms")
    .update({
      name,
      ...payload,
      ...(typeof body.active === "boolean" ? { active: body.active } : {}),
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ message: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, partner: data });
}
