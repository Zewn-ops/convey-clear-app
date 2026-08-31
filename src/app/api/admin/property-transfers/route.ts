import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { type UserRole } from "@/types";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { transferProgressBlockedReason, type TransferPartyRow } from "@/lib/transfer-gate";
import { ensureTransferServices } from "@/lib/transfer-services-init";
import { syncPartiesFromTransfer } from "@/lib/transfer-party-sync";
import { requireStaff } from "@/lib/staff";

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
  /** 077 — the headline figure from the Bert Smith cover sheet. */
  purchase_price?: string | number | null;
  /** 077 — the ConveyClear member responsible for this transfer. */
  designated_member_id?: string | null;
};

const STATUSES = ["open", "registered", "cancelled", "on_hold"];

function clean(v?: string | null): string | null {
  const s = (v ?? "").trim();
  return s.length ? s : null;
}

/**
 * The purchase price, or null.
 *
 * Accepts what people actually type into a money field — "R 1 250 000",
 * "1,250,000.00" — because rejecting a formatted number is a pointless fight
 * with the person who has the figure in front of them. Anything that is not a
 * finite non-negative number becomes null rather than 0: a zero price would
 * read as a free transfer, which is a claim, while an empty one reads as
 * "not captured", which is the truth.
 */
function cleanPrice(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n =
    typeof v === "number"
      ? v
      : Number(String(v).replace(/[Rr\s,]/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : null;
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
    purchase_price: cleanPrice(body.purchase_price),
    // ⚠️ Assignment, not permission. No policy reads this column (077), and
    // naming someone must not shut their colleagues out — the same warning 059
    // gives about naming a contact at a firm.
    designated_member_id: clean(body.designated_member_id),
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

  // Mirror the four party columns into transfer_parties, so the parties card
  // and the registration gate see what this form just saved.
  await syncPartiesFromTransfer(admin, transfer.id as string, transferPayload(body));

  // Every transfer gets its checklist on creation (Zewn, 2026-08-28). Best
  // effort — the "Create the service list" button remains as the fallback.
  await ensureTransferServices(admin, transfer.id as string, auth.callerId);

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

  // Mirror the four party columns into transfer_parties FIRST, before the gate
  // reads them.
  //
  // Order matters and is the whole fix: setting the seller, buyer and attorney
  // and choosing Registered happen in ONE save on this form. Gating first would
  // read the parties as they were before the save and refuse a transfer the
  // user has just completed — which is exactly the bug reported 2026-08-11.
  //
  // If the gate below then blocks, the parties stay written and only the status
  // is refused. That is the right half to keep: the user did ask for those
  // parties, and the next attempt succeeds instead of failing identically.
  await syncPartiesFromTransfer(admin, id, transferPayload(body));

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

  // 060 / §92 — registering the transfer is the moment the sale completes, so
  // the property stops being one the seller still owns. It is NOT deleted: it
  // stays on their account, inactive, carrying its history.
  //
  // Runs after the update rather than beside it, so a refused registration
  // (gate above, or a duplicate reference) cannot deactivate a property for a
  // sale that did not go through. Best-effort on purpose — a failure here must
  // not turn a completed registration into an error the user has to retry, and
  // staff can toggle it by hand.
  const propertyId = (transfer as { property_id?: string | null } | null)?.property_id ?? null;
  if (status === "registered" && propertyId) {
    const { error: propErr } = await admin
      .from("properties")
      .update({ active: false, deactivated_at: new Date().toISOString() })
      .eq("id", propertyId)
      .eq("active", true); // no-op on re-save of an already-registered transfer
    if (propErr) console.error("[property-transfers] deactivating property failed:", propErr);
  }

  return NextResponse.json({ ok: true, transfer });
}
