import { NextResponse } from "next/server";
import { requirePartner } from "@/lib/partner";
import { createAdminClient } from "@/lib/supabase/admin";
import { randomUUID } from "crypto";

export const runtime = "nodejs";

// Return (or mint) an onboarding link for a matter the partner owns, so they can
// complete FICA / upload documents on the client's behalf via the proven /onboard
// flow. Ownership is verified against the partner's firm before issuing a token.
export async function POST(request: Request) {
  const auth = await requirePartner();
  if ("error" in auth) {
    return NextResponse.json({ message: auth.error }, { status: auth.status });
  }

  let body: { matter_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.matter_id) {
    return NextResponse.json({ message: "matter_id is required" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Ownership check: the matter's client must belong to the caller's firm.
  const { data: matter } = await admin
    .from("matters")
    .select("id, client_id, clients(business_partner_id)")
    .eq("id", body.matter_id)
    .maybeSingle();

  const ownerPartner =
    (matter?.clients as { business_partner_id?: string } | null)?.business_partner_id ?? null;
  if (!matter || ownerPartner !== auth.partnerId) {
    return NextResponse.json({ message: "Matter not found for your firm" }, { status: 404 });
  }

  // Reuse a live, unused link if one exists.
  const { data: existing } = await admin
    .from("onboarding_links")
    .select("token, expires_at, used")
    .eq("matter_id", body.matter_id)
    .eq("purpose", "onboarding")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const live =
    existing && !existing.used && (!existing.expires_at || new Date(existing.expires_at) > new Date());

  if (live) {
    return NextResponse.json({ ok: true, token: existing!.token });
  }

  const token = randomUUID();
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await admin.from("onboarding_links").insert({
    token,
    matter_id: body.matter_id,
    purpose: "onboarding",
    expires_at: expires,
  });
  if (error) return NextResponse.json({ message: error.message }, { status: 400 });

  return NextResponse.json({ ok: true, token });
}
