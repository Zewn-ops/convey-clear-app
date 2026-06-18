import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { homePathForRole } from "@/lib/auth";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.user) {
      // MFA step-up: if the account has a verified factor, go to the challenge
      // page instead of the portal. Fail-open if the AAL check errors.
      try {
        const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        if (aal && aal.currentLevel === "aal1" && aal.nextLevel === "aal2") {
          return NextResponse.redirect(`${origin}/auth/mfa`);
        }
      } catch {
        /* proceed to destination */
      }
      const { data: profile } = await supabase
        .from("users")
        .select("role")
        .eq("auth_user_id", data.user.id)
        .maybeSingle();
      const dest = homePathForRole(profile?.role);
      return NextResponse.redirect(`${origin}${dest}`);
    }
  }

  return NextResponse.redirect(`${origin}/auth/login?error=auth_callback_failed`);
}
