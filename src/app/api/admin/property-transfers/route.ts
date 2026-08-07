import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { STAFF_ROLES, type UserRole } from "@/types";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { transferProgressBlockedReason, type TransferPartyRow } from "@/lib/transfer-gate";

export const runtime = "nodejs";

// Property Transfers hub (migration 026) — the transaction that groups several
// matters. Staff-only; partners read via RLS and never write here.
//   POST   create a transfer.
//   PATCH  update a transfer.
// No DELETE: nothing in the UI removes a transfer, and matters.transfer_id is
// ON DELETE SET NULL, so a stray delete would silently orphan linked matters.

type TransferFields = {
  reference?: string;
  property_description?: string;
  municipality?: string;
  status?: string;
  business_partner_id?: string;
  estate_agent_partner_id?: string;
  seller_client_id?: string;
  buyer_client_id?: string;
  notes?: string;
};

const STATUSES = ["open", "registered", "cancelled", "on_hold"];

async function requireStaff() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated", status: 401 as const };
  const { data: me } = await supabase.from("users").select("id, role").eq("auth_user_id", user.id).maybeSingle();
  const role = (me?.role ?? null) as UserRole | null;
  if (!role || !STAFF_ROLES.includes(role)) return { error: "Insufficient privilege", status: 403 as const };
  return { callerId: me!.id as string };
}

function clean(v?: string | null): string | null {
  const s = (v ?? "").trim();
  return s.length ? s : null;
}

function transferPayload(body: TransferFields) {
  return {
    property_description: clean(body.property_description),
    municipality: clean(body.municipality),
    business_partner_id: clean(body.business_partner_id),
    estate_agent_partner_id: clean(body.estate_agent_partner_id),
    seller_client_id: clean(body.seller_client_id),
    buyer_client_id: clean(body.buyer_client_id),
    notes: clean(body.notes),
  };
}

// upper(reference) carries a unique index — surface that as a readable message
// rather than a raw Postgres constraint error.
function referenceTaken(message: string): boolean {
  return /uq_property_transfers_reference|duplicate key/i.test(message);
}

export async function POST(request: Request) {
  if (!rateLimit(`transfer:${clientIp(request)}`, 40, 60_000)) {
    return NextResponse.json({ message: "Too many requests." }, { status: 429 });
  }
  const auth = await requireStaff();
  if ("error" in auth) return NextResponse.json({ message: auth.error }, { status: auth.status });

  let body: TransferFields;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
  }

  const reference = clean(body.reference);
  if (!reference) return NextResponse.json({ message: "A transfer reference is required." }, { status: 400 });

  const status = clean(body.status) ?? "open";
  if (!STATUSES.includes(status)) return NextResponse.json({ message: "Unknown status." }, { status: 400 });

  const admin = createAdminClient();
  const { data: transfer, error } = await admin
    .from("property_transfers")
    .insert({ reference, status, ...transferPayload(body), created_by: auth.callerId })
    .select("*")
    .single();

  if (error) {
    const message = referenceTaken(error.message)
      ? `Reference "${reference}" is already used by another transfer.`
      : error.message;
    return NextResponse.json({ message }, { status: 400 });
  }
  return NextResponse.json({ ok: true, transfer });
}

export async function PATCH(request: Request) {
  const auth = await requireStaff();
  if ("error" in auth) return NextResponse.json({ message: auth.error }, { status: auth.status });

  let body: TransferFields & { id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
  }

  const id = clean(body.id);
  if (!id) return NextResponse.json({ message: "id is required" }, { status: 400 });
  const reference = clean(body.reference);
  if (!reference) return NextResponse.json({ message: "A transfer reference is required." }, { status: 400 });

  const status = clean(body.status) ?? "open";
  if (!STATUSES.includes(status)) return NextResponse.json({ message: "Unknown status." }, { status: 400 });

  const admin = createAdminClient();

  // Stop-gate (Meeting 2, 2026-08-06): a transfer may be created and worked
  // incomplete, but may not be marked registered without a linked seller, buyer
  // and conveyancing attorney. Read through the admin client on purpose — the
  // caller is already staff-gated above, and a party the caller cannot see must
  // still count, or the gate would pass for the wrong reason.
  if (status === "registered") {
    const { data: parties, error: partiesError } = await admin
      .from("transfer_parties")
      .select("role, client_id, firm_id")
      .eq("transfer_id", id);
    if (partiesError) {
      return NextResponse.json({ message: partiesError.message }, { status: 400 });
    }
    const blocked = transferProgressBlockedReason(status, (parties ?? []) as TransferPartyRow[]);
    if (blocked) return NextResponse.json({ message: blocked }, { status: 409 });
  }

  const { data: transfer, error } = await admin
    .from("property_transfers")
    .update({ reference, status, ...transferPayload(body) })
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    const message = referenceTaken(error.message)
      ? `Reference "${reference}" is already used by another transfer.`
      : error.message;
    return NextResponse.json({ message }, { status: 400 });
  }
  return NextResponse.json({ ok: true, transfer });
}
