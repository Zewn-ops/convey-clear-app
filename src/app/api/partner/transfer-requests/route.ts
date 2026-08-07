import { NextResponse } from "next/server";
import { requirePartner } from "@/lib/partner";
import { createClient } from "@/lib/supabase/server";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { notifyStaff } from "@/lib/notify";

export const runtime = "nodejs";

/**
 * An attorney firm asks ConveyClear to open a property transfer (055).
 *
 * Meeting 2 (2026-08-06) moved transfer creation behind ConveyClear so one
 * vetted client database is maintained without firms reaching each other's
 * contacts (§84). A firm supplies what it knows; ConveyClear turns that into a
 * transfer and real client records.
 *
 * Written through the CALLER's client, not the service role: 055's insert policy
 * pins firm_id to app_user_partner_id(), so the database refuses a request
 * lodged in another firm's name even if this route stopped setting it. That is
 * worth more than the convenience of the admin client.
 */
export async function POST(request: Request) {
  if (!rateLimit(`transfer-request:${clientIp(request)}`, 20, 60_000)) {
    return NextResponse.json({ message: "Too many requests." }, { status: 429 });
  }

  const auth = await requirePartner();
  if ("error" in auth) return NextResponse.json({ message: auth.error }, { status: auth.status });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
  }

  const str = (k: string): string | null => {
    const v = body[k];
    if (typeof v !== "string") return null;
    const t = v.trim();
    return t.length ? t : null;
  };

  const propertyDescription = str("property_description");
  if (!propertyDescription) {
    return NextResponse.json(
      { message: "Describe the property — an erf number or address." },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("transfer_requests")
    .insert({
      firm_id: auth.partnerId,
      requested_by: auth.userId,
      property_description: propertyDescription,
      municipality: str("municipality"),
      suggested_reference: str("suggested_reference"),
      seller_name: str("seller_name"),
      seller_email: str("seller_email"),
      seller_cell: str("seller_cell"),
      buyer_name: str("buyer_name"),
      buyer_email: str("buyer_email"),
      buyer_cell: str("buyer_cell"),
      notes: str("notes"),
      status: "pending",
    })
    .select("id")
    .single();

  if (error) {
    // RLS refusing the insert surfaces as 42501, not a 403.
    if (error.code === "42501") {
      return NextResponse.json({ message: "You cannot lodge this request." }, { status: 403 });
    }
    return NextResponse.json({ message: error.message }, { status: 400 });
  }

  // A request nobody is told about is a form that goes nowhere — the queue is
  // only useful if staff learn it has something in it.
  await notifyStaff({
    type: "transfer_request",
    title: "New property transfer request",
    body: propertyDescription,
    link: "/admin/transfer-requests",
  });

  return NextResponse.json({ ok: true, id: data.id });
}
