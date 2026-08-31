import { NextResponse } from "next/server";
import { requireFirmAdmin } from "@/lib/partner";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import {
  CredentialKeyMissingError,
  encryptCouncilCredential,
} from "@/lib/council-credentials";

export const runtime = "nodejs";

/**
 * 🔒 A firm admin records a council portal login for one of their own staff.
 *
 * Both COT and CoE ask a firm for every staff member's council login
 * (handwritten notes 2026-08-31, §11.13). Zewn: "make the fields entered but
 * only a conveyclear admin can see the data once entered."
 *
 * WRITE-ONLY BY DESIGN. There is no GET here and no partner SELECT policy on
 * `firm_council_credentials` (074), so a firm can record a login and can never
 * read one back — not its own, not anyone's. Only the ConveyClear admin tier
 * can read, through the admin surface.
 *
 * WHY A ROUTE IS AN ACCEPTABLE BOUNDARY FOR THIS WRITE, WHEN 071 SAYS IT IS
 * NOT ONE FOR A RULE: Supabase exposes PostgREST directly, so a route-only
 * check is bypassable — which makes it useless for protecting READS. Here
 * there is no read to protect. The worst a bypass achieves is writing a
 * credential nobody can read back, and the trigger in 074 still refuses to let
 * a row be stamped to a firm the user does not belong to.
 *
 * Values are AES-256-GCM encrypted before they leave this process
 * (lib/council-credentials.ts). If COUNCIL_CRED_KEY is missing, the request
 * FAILS — it never degrades to storing plaintext.
 */

interface CredentialInput {
  user_id?: string;
  municipality?: string;
  username?: string;
  password?: string;
}

export async function POST(request: Request) {
  // Tighter than the firm route's 30/min: this endpoint takes passwords, and
  // a generous limit on a write-only endpoint is a free credential-stuffing
  // oracle against the unique constraint.
  if (!rateLimit(`partner-firm-credentials:${clientIp(request)}`, 10, 60_000)) {
    return NextResponse.json({ message: "Too many requests." }, { status: 429 });
  }

  const auth = await requireFirmAdmin();
  if ("error" in auth) {
    return NextResponse.json({ message: auth.error }, { status: auth.status });
  }

  let body: CredentialInput;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
  }

  const userId = body.user_id?.trim();
  const municipality = body.municipality?.trim();
  const username = body.username?.trim();
  const password = body.password;

  if (!userId || !municipality || !username || !password) {
    return NextResponse.json(
      {
        message:
          "A council login needs a person, a council, a username and a password.",
      },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // The person must be at THIS firm. 074's trigger enforces the same rule at
  // the database, but failing here gives a usable message instead of a raised
  // exception, and stops a firm admin probing which user ids exist.
  const { data: target, error: lookupError } = await admin
    .from("users")
    .select("id, business_partner_id")
    .eq("id", userId)
    .maybeSingle();

  if (lookupError) {
    return NextResponse.json({ message: lookupError.message }, { status: 400 });
  }

  if (!target || target.business_partner_id !== auth.partnerId) {
    return NextResponse.json(
      { message: "That person is not at your firm." },
      { status: 403 }
    );
  }

  let row;
  try {
    row = encryptCouncilCredential({
      userId,
      firmId: auth.partnerId,
      municipality,
      username,
      password,
    });
  } catch (err) {
    if (err instanceof CredentialKeyMissingError) {
      // Deliberately loud, and deliberately not stored. Storing council
      // passwords unencrypted is not a degraded mode worth having.
      console.error("[council-credentials]", err.message);
      return NextResponse.json(
        {
          message:
            "Council logins cannot be saved right now: the portal is missing " +
            "its encryption key. ConveyClear has been notified.",
        },
        { status: 503 }
      );
    }
    const message = err instanceof Error ? err.message : "Could not save.";
    return NextResponse.json({ message }, { status: 400 });
  }

  // One credential per person per council; re-entering replaces.
  const { error } = await admin
    .from("firm_council_credentials")
    .upsert(
      { ...row, created_by: auth.userId, updated_by: auth.userId },
      { onConflict: "user_id,municipality" }
    );

  if (error) {
    return NextResponse.json({ message: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}

/**
 * Remove a stored login. A firm admin may clear one for their own staff even
 * though they cannot read it — being unable to see a value is not a reason to
 * be stuck with it.
 */
export async function DELETE(request: Request) {
  if (!rateLimit(`partner-firm-credentials:${clientIp(request)}`, 10, 60_000)) {
    return NextResponse.json({ message: "Too many requests." }, { status: 429 });
  }

  const auth = await requireFirmAdmin();
  if ("error" in auth) {
    return NextResponse.json({ message: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("user_id");
  const municipality = searchParams.get("municipality");

  if (!userId || !municipality) {
    return NextResponse.json(
      { message: "Which login? A person and a council are both needed." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("firm_council_credentials")
    .delete()
    .eq("user_id", userId)
    .eq("municipality", municipality.trim().toUpperCase())
    // Scoped to the caller's own firm, so a crafted user_id cannot reach
    // another firm's row.
    .eq("firm_id", auth.partnerId);

  if (error) {
    return NextResponse.json({ message: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
