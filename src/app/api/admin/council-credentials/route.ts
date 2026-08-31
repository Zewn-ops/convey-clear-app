import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import {
  CredentialKeyMissingError,
  decryptCredential,
} from "@/lib/council-credentials";

export const runtime = "nodejs";

/**
 * 🔒 Reveal ONE stored council login, to a ConveyClear admin, on demand.
 *
 * Zewn asked for show/hide buttons with a closed and open eye. The obvious
 * implementation — decrypt everything server-side and hand the page a list of
 * plaintext passwords for the eye to toggle — would put every credential into
 * the HTML payload of a page that merely LISTS them. The eye would then be
 * hiding values that had already been transmitted.
 *
 * So the list ships metadata only, and a value crosses the wire exactly when
 * an admin asks for that one credential. That also makes each reveal an event
 * that can be logged, which a client-side toggle can never be.
 *
 * Admin tier only — not staff. `firm_council_credentials` has a single RLS
 * policy (074) and it is `app_is_admin()` for SELECT; this route re-checks in
 * the application because it reads with the service role, which bypasses RLS.
 */
export async function GET(request: Request) {
  // Deliberately tight. Each call reveals one live municipal password.
  if (!rateLimit(`admin-council-credentials:${clientIp(request)}`, 20, 60_000)) {
    return NextResponse.json({ message: "Too many requests." }, { status: 429 });
  }

  const auth = await requireAdmin();
  if ("error" in auth) {
    return NextResponse.json({ message: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ message: "Which credential?" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("firm_council_credentials")
    .select("id, username_ciphertext, password_ciphertext, key_version")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ message: error.message }, { status: 400 });
  }
  if (!data) {
    return NextResponse.json({ message: "Not found." }, { status: 404 });
  }

  try {
    return NextResponse.json({
      username: decryptCredential(data.username_ciphertext as string),
      password: decryptCredential(data.password_ciphertext as string),
    });
  } catch (err) {
    if (err instanceof CredentialKeyMissingError) {
      console.error("[council-credentials]", err.message);
      return NextResponse.json(
        {
          message:
            "This login cannot be read: the portal is missing its encryption " +
            "key. The stored value is intact — it needs COUNCIL_CRED_KEY.",
        },
        { status: 503 }
      );
    }
    // A GCM authentication failure lands here. It means the ciphertext was
    // written with a different key, or has been altered — both worth saying
    // plainly rather than rendering as an empty field.
    console.error("[council-credentials] decrypt failed", {
      id,
      keyVersion: data.key_version,
    });
    return NextResponse.json(
      {
        message:
          "This login could not be decrypted. It may have been stored under " +
          "an older key — check key_version on the row.",
      },
      { status: 422 }
    );
  }
}
