import { NextResponse } from "next/server";
import { requireFirmAdmin } from "@/lib/partner";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit, clientIp } from "@/lib/ratelimit";

export const runtime = "nodejs";

// Firm-admin saves their OWN firm's banking, trust and BP-number details
// (migration 037). requireFirmAdmin() confirms the caller is a firm-admin; the
// write is scoped to auth.partnerId, so a firm-admin can only ever touch their
// own firm — the partner id is never taken from the body.
//
// Written with the service role (firm_banking/firm_bp_numbers grant partners no
// write policy — the RLS read policy exists only so the edit form can load).

const BANKING_FIELDS = [
  "bank_name",
  "account_name",
  "account_number",
  "branch_code",
  "account_type",
  "trust_bank_name",
  "trust_account_name",
  "trust_account_number",
  "trust_branch_code",
] as const;

interface BpNumberInput {
  municipality?: string;
  bp_number?: string;
}

function clean(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

export async function POST(request: Request) {
  if (!rateLimit(`partner-firm:${clientIp(request)}`, 30, 60_000)) {
    return NextResponse.json({ message: "Too many requests." }, { status: 429 });
  }
  const auth = await requireFirmAdmin();
  if ("error" in auth) return NextResponse.json({ message: auth.error }, { status: auth.status });

  let body: { banking?: Record<string, unknown>; bp_numbers?: BpNumberInput[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
  }

  const admin = createAdminClient();

  // ---- banking (upsert one row per firm) ----
  if (body.banking) {
    const patch: Record<string, unknown> = {
      business_partner_id: auth.partnerId,
      updated_by: auth.userId,
      updated_at: new Date().toISOString(),
    };
    for (const f of BANKING_FIELDS) patch[f] = clean(body.banking[f]);
    const { error } = await admin.from("firm_banking").upsert(patch, { onConflict: "business_partner_id" });
    if (error) return NextResponse.json({ message: error.message }, { status: 400 });
  }

  // ---- BP numbers (replace the firm's set) ----
  // The form edits the whole list, so a removed municipality must actually
  // disappear. Scoped to this firm, so no other firm's numbers are touched.
  if (body.bp_numbers) {
    const rows = body.bp_numbers
      .map((r) => ({ municipality: clean(r.municipality), bp_number: clean(r.bp_number) }))
      .filter((r): r is { municipality: string; bp_number: string } => Boolean(r.municipality && r.bp_number))
      .map((r) => ({
        business_partner_id: auth.partnerId,
        municipality: r.municipality,
        bp_number: r.bp_number,
        updated_by: auth.userId,
      }));

    await admin.from("firm_bp_numbers").delete().eq("business_partner_id", auth.partnerId);
    if (rows.length > 0) {
      const { error } = await admin.from("firm_bp_numbers").insert(rows);
      if (error) return NextResponse.json({ message: error.message }, { status: 400 });
    }
  }

  return NextResponse.json({ ok: true });
}
