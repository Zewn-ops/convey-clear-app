import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveOnboardingMatter } from "@/lib/onboard-token";
import { MATTER_DOCS_BUCKET, matterObjectPath } from "@/lib/storage";
import { rateLimit, clientIp } from "@/lib/ratelimit";

export const runtime = "nodejs";

// Public (token-authed) signed UPLOAD url for the /onboard form. No session —
// authorised by a valid, unused, unexpired onboarding-link token. The browser
// then uploads the file DIRECTLY to Supabase Storage (bypasses Vercel's 4.5 MB
// body limit). The documents rows are recorded by /api/onboard/submit.
export async function POST(request: Request) {
  if (!rateLimit(`onboard-upload:${clientIp(request)}`, 60, 60_000)) {
    return NextResponse.json({ message: "Too many requests — please slow down." }, { status: 429 });
  }

  let body: { token?: string; file_name?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.token) return NextResponse.json({ message: "Missing onboarding token." }, { status: 400 });

  const admin = createAdminClient();
  const matterId = await resolveOnboardingMatter(admin, body.token);
  if (!matterId) {
    return NextResponse.json({ message: "This onboarding link is invalid, used, or expired." }, { status: 401 });
  }

  const path = matterObjectPath(matterId, body.file_name ?? "file");
  const { data, error } = await admin.storage.from(MATTER_DOCS_BUCKET).createSignedUploadUrl(path);
  if (error || !data) {
    return NextResponse.json({ message: error?.message ?? "Could not create upload URL" }, { status: 500 });
  }

  return NextResponse.json({ bucket: MATTER_DOCS_BUCKET, path, token: data.token, signedUrl: data.signedUrl });
}
