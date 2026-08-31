import { NextResponse } from "next/server";
import { requireFirmAdmin } from "@/lib/partner";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit, clientIp } from "@/lib/ratelimit";

export const runtime = "nodejs";

// Firm-admin saves their OWN firm's banking, trust and BP-number details
// (migration 037), plus the council-facing firm identity added by 073.
// requireFirmAdmin() confirms the caller is a firm-admin; the write is scoped
// to auth.partnerId, so a firm-admin can only ever touch their own firm — the
// partner id is never taken from the body.
//
// Written with the service role (firm_banking/firm_bp_numbers grant partners no
// write policy — the RLS read policy exists only so the edit form can load).
//
// 073 added what both City of Tshwane and City of Ekurhuleni ask OF THE FIRM:
// practice number, fidelity fund certificate, file-owner contact details, and
// a per-council attorney code beside the per-council BP number. These are the
// autofill source for an RCA (notes 2026-08-31, §11.3) — an attorney should
// never re-supply the firm's FFC on an application.

// Columns on `firms` itself, added by 073. Bank details are NOT here: they
// live in firm_banking (037) and duplicating them would be the 066 mistake.
const FIRM_FIELDS = [
  "practice_number",
  "ffc_number",
  "file_owner_name",
  "file_owner_email",
  "file_owner_cell",
] as const;

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
  /** 073 — COJ issues an attorney code at the same grain as the BP number. */
  attorney_code?: string;
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

  let body: {
    banking?: Record<string, unknown>;
    bp_numbers?: BpNumberInput[];
    firm?: Record<string, unknown>;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
  }

  const admin = createAdminClient();

  // ---- firm identity the councils ask for (073) ----
  if (body.firm) {
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const f of FIRM_FIELDS) patch[f] = clean(body.firm[f]);

    // A date, not a string — an empty picker must clear the column rather
    // than write ''. An expired FFC stops the firm lodging with a council, so
    // this field carries operational weight.
    patch.ffc_expires_on = clean(body.firm.ffc_expires_on);

    const { error } = await admin.from("firms").update(patch).eq("id", auth.partnerId);
    if (error) return NextResponse.json({ message: error.message }, { status: 400 });
  }

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
      .map((r) => ({
        municipality: clean(r.municipality),
        bp_number: clean(r.bp_number),
        attorney_code: clean(r.attorney_code),
      }))
      // 073 made bp_number nullable and added attorney_code, because COJ
      // issues an attorney code and a firm may hold one without the other.
      // A row needs a municipality and at least ONE identifier — the same
      // rule the firm_bp_numbers_has_an_identifier CHECK enforces.
      .filter((r) => Boolean(r.municipality && (r.bp_number || r.attorney_code)))
      .map((r) => ({
        business_partner_id: auth.partnerId,
        municipality: r.municipality as string,
        bp_number: r.bp_number,
        attorney_code: r.attorney_code,
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
