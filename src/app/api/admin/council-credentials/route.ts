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
 * that can be logged, which a client-side toggle can never be — and since 095
 * it IS logged, in `credential_reveals`, before the value is returned.
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
    .select("id, firm_id, user_id, municipality, username_ciphertext, password_ciphertext, key_version")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ message: error.message }, { status: 400 });
  }
  if (!data) {
    return NextResponse.json({ message: "Not found." }, { status: 404 });
  }

  // 🔒 RECORD THE READING BEFORE RETURNING IT (095).
  //
  // The header above promised this and stopped short: "That also makes each
  // reveal an event that can be logged, which a client-side toggle can never
  // be." CAN BE — nothing wrote it and there was no table to write it to, so
  // until 2026-09-11 every reveal of a live municipal password went unrecorded.
  //
  // Zewn, 2026-09-11, on what to tell firms: "let them know that only
  // conveyclear members will be able to access the login details … we need the
  // details secure but at the same time the CC members need access to it in
  // order to do their work." That promise is only worth making if we can also
  // say who looked — so the write happens FIRST, and a reveal that cannot be
  // recorded does not happen.
  const logged = await admin.from("credential_reveals").insert({
    credential_id: data.id,
    firm_id: data.firm_id,
    credential_user_id: data.user_id,
    municipality: data.municipality,
    revealed_by: auth.callerId,
  });
  if (logged.error) {
    // Deployed ahead of migration 095? The table is missing (42P01). Say so
    // loudly and let the reveal through: staff work does not stop for a table
    // that has not been created yet, and the window closes the moment the
    // migration runs. Every OTHER failure refuses — an audit trail you can skip
    // by making it fail is not an audit trail.
    if (logged.error.code === "42P01") {
      console.error(
        "[council-credentials] REVEAL NOT LOGGED — credential_reveals is missing; run migration 095",
        { credentialId: data.id, by: auth.callerId }
      );
    } else {
      console.error("[council-credentials] reveal log failed", logged.error);
      return NextResponse.json(
        {
          message:
            "This login cannot be shown right now: the reveal could not be " +
            "recorded, and we do not show one without recording it.",
        },
        { status: 503 }
      );
    }
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
