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
    pathname.startsWith("/partner");

  // Unauthenticated → bounce off any protected area to login.
  if (!user && isProtected) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/auth/login";
    return NextResponse.redirect(redirectUrl);
  }

  if (!user) return supabaseResponse;

  // Resolve role once (only when it matters — auth pages or area guards).
  const needsRole =
    isProtected || pathname.startsWith("/auth");
  let role: string | null = null;
  if (needsRole) {
    const { data: profile } = await supabase
      .from("users")
      .select("role")
      .eq("auth_user_id", user.id)
      .maybeSingle();
    role = profile?.role ?? null;
  }

  // Authenticated user on an auth page → send to their home. EXCEPT the MFA
  // step-up challenge, which an authenticated (AAL1) user must be able to reach.
  if (pathname.startsWith("/auth") && !pathname.startsWith("/auth/mfa")) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = homeForRole(role);
    return NextResponse.redirect(redirectUrl);
  }

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
