import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
// Imported, not re-declared: a role added in types/index.ts but forgotten here
// would bounce that staff member out of /admin with no error anywhere.
import { STAFF_ROLES, ADMIN_ROLES } from "@/types";

// Forced staff 2FA — off until the security gate. See the guard below.
const FORCE_STAFF_MFA = process.env.FORCE_STAFF_MFA === "true";

function homeForRole(role?: string | null): string {
  if (role && (STAFF_ROLES as string[]).includes(role)) return "/admin";
  if (role === "business_partner") return "/partner";
  return "/dashboard";
}

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isProtected =
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/partner") ||
    pathname.startsWith("/account");

  // Unauthenticated → bounce off any protected area to login.
  if (!user && isProtected) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/auth/login";
    return NextResponse.redirect(redirectUrl);
  }

  if (!user) return supabaseResponse;

  // Resolve the profile once (only when it matters — auth pages or area guards).
  const needsRole =
    isProtected || pathname.startsWith("/auth");
  let role: string | null = null;
  let mustChangePassword = false;
  if (needsRole) {
    const { data: profile, error } = await supabase
      .from("users")
      .select("role, must_change_password")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (error) {
      // must_change_password only exists once migration 031 is applied. Without
      // this fallback, deploying ahead of the migration would 400 the select,
      // leave role null, and bounce EVERY staff user to /dashboard — i.e. break
      // sign-in for the whole app. Degrade to role-only instead.
      const { data: roleOnly } = await supabase
        .from("users")
        .select("role")
        .eq("auth_user_id", user.id)
        .maybeSingle();
      role = roleOnly?.role ?? null;
    } else {
      role = profile?.role ?? null;
      mustChangePassword = Boolean(profile?.must_change_password);
    }
  }

  const isChangePassword = pathname.startsWith("/auth/change-password");

  // Still on the temporary password a staff member generated, saw on screen and
  // emailed (migration 031) → hold here until they set their own. Runs BEFORE the
  // area guards, so it can't be stepped around by going somewhere else. Only
  // protected areas are gated, so /auth/* (login, MFA, this page) stays reachable.
  if (mustChangePassword && isProtected) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/auth/change-password";
    return NextResponse.redirect(redirectUrl);
  }

  // Authenticated user on an auth page → send to their home. EXCEPT the MFA
  // step-up challenge, which an authenticated (AAL1) user must be able to reach,
  // and the forced change-password gate while it actually applies (without this
  // exception the rule below would bounce a held user straight back out of it).
  if (
    pathname.startsWith("/auth") &&
    !pathname.startsWith("/auth/mfa") &&
    !(isChangePassword && mustChangePassword)
  ) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = homeForRole(role);
    return NextResponse.redirect(redirectUrl);
  }

  // Two-factor for staff. Ships dark: OFF unless FORCE_STAFF_MFA=true, because
  // switching it on mid-QA would send every staff tester to enrolment before they
  // could get at what they were testing. Zewn flips it in Vercel for the security
  // gate (roadmap §8 "MFA on"); until then behaviour is unchanged — opt-in per
  // user via /account, and LoginForm + the OAuth callback still step up anyone who
  // HAS a verified factor.
  //
  // Restored from f42978d, which the demo disabled. A staff user with no verified
  // factor goes to enrol; one who hasn't stepped up this session goes to the
  // challenge. Clients/partners are exempt. /auth/mfa + /auth/mfa-setup are not
  // protected paths, so they stay reachable and there is no redirect loop. If AAL
  // can't be read we do NOT force — better than locking staff out.
  //
  // Runs after the temp-password gate above, so a new staff account sets its own
  // password first and only then enrols.
  if (FORCE_STAFF_MFA && isProtected && role && (STAFF_ROLES as string[]).includes(role)) {
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal) {
      if (aal.nextLevel !== "aal2") {
        const redirectUrl = request.nextUrl.clone();
        redirectUrl.pathname = "/auth/mfa-setup";
        return NextResponse.redirect(redirectUrl);
      }
      if (aal.currentLevel !== "aal2") {
        const redirectUrl = request.nextUrl.clone();
        redirectUrl.pathname = "/auth/mfa";
        return NextResponse.redirect(redirectUrl);
      }
    }
  }

  // /admin → staff only (incl. super_admin). Non-staff bounced to their home.
  if (pathname.startsWith("/admin")) {
    if (!role || !(STAFF_ROLES as string[]).includes(role)) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = homeForRole(role);
      return NextResponse.redirect(redirectUrl);
    }
    // /admin/users + /admin/settings → admin tier only (admin + super_admin).
    if (
      (pathname.startsWith("/admin/users") || pathname.startsWith("/admin/settings")) &&
      !(ADMIN_ROLES as string[]).includes(role)
    ) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/admin";
      return NextResponse.redirect(redirectUrl);
    }
  }

  // /partner → business_partner only. Everyone else to their home.
  if (pathname.startsWith("/partner")) {
    if (role !== "business_partner") {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = homeForRole(role);
      return NextResponse.redirect(redirectUrl);
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
