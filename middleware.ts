import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const STAFF_ROLES = [
  "super_admin",
  "admin",
  "staff_services",
  "staff_ops",
  "staff_delivery",
];
const ADMIN_ROLES = ["super_admin", "admin"];

function homeForRole(role?: string | null): string {
  if (role && STAFF_ROLES.includes(role)) return "/admin";
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
  // area guards, so it can't be stepped around by going somewhere else.
  // /auth/mfa is left reachable: an account with a factor must clear step-up
  // first, or it has no usable session to change anything with.
  if (mustChangePassword && isProtected && !pathname.startsWith("/auth/mfa")) {
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

  // MFA is OPTIONAL for the demo (opt-in per user via /account). Forced staff
  // enrolment/step-up is disabled here so it can't break the Adams & Adams demo.
  // Opt-in step-up still works: LoginForm + the OAuth callback send a user WITH a
  // verified factor to /auth/mfa; users without a factor pass straight through.
  // TODO (post-demo): re-enable forced MFA for staff_services + staff_ops by
  // restoring the AAL guard below (sent staff w/o factor → /auth/mfa-setup, and
  // AAL1 staff → /auth/mfa). Keep TOTP enabled at project level so it stays usable.

  // /admin → staff only (incl. super_admin). Non-staff bounced to their home.
  if (pathname.startsWith("/admin")) {
    if (!role || !STAFF_ROLES.includes(role)) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = homeForRole(role);
      return NextResponse.redirect(redirectUrl);
    }
    // /admin/users + /admin/settings → admin tier only (admin + super_admin).
    if (
      (pathname.startsWith("/admin/users") || pathname.startsWith("/admin/settings")) &&
      !ADMIN_ROLES.includes(role)
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
