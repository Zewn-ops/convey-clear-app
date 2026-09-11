import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * 🔴 REFRESH THE SUPABASE SESSION. That is ALL this does.
 *
 * ── The bug it fixes, found 2026-09-11 ──────────────────────────────────────
 *
 * Sarah Hayes (dry-run partner) could browse the portal and could not send a
 * transfer request: "Not authenticated". Her user row was correct — role
 * business_partner, firm set, active — which rules the data out, because
 * requirePartner returns "Not a partner account" (403) for a bad role and
 * "Not authenticated" (401) only when supabase.auth.getUser() returns nobody.
 *
 * There was no middleware at all. `middleware.ts.bak` has been parked since
 * 2026-08-05 and nothing replaced the one job it was doing that nothing else
 * does: Supabase's SSR client stores the session in cookies and refreshes the
 * access token by WRITING NEW COOKIES on a request. Server Components cannot
 * write cookies. So without middleware nothing ever refreshes the token, and
 * roughly an hour after signing in:
 *
 *   · pages still render as though signed in — they were rendered earlier, and
 *     the browser client keeps its own copy of the session;
 *   · every server route calling getUser() sees nobody and returns 401.
 *
 * Browse fine, click Send, "Not authenticated". The gap between those two is
 * the entire symptom, and it is why this looked like a permissions bug.
 *
 * ── Why this is not middleware.ts.bak ───────────────────────────────────────
 *
 * That file also does role routing and a forced-MFA gate, and it was parked
 * deliberately — MFA and role routing live in the login flow now. Restoring it
 * would drag both back in and silently change where people land after signing
 * in. This file therefore REDIRECTS NOTHING. It has no opinion about who may see
 * what; RLS and the route guards already decide that, and they are the things
 * that actually hold. Middleware that makes access decisions is a second
 * boundary to keep in step with the first.
 *
 * ⚠️ THE ONE RULE FOR EDITING THIS FILE. `supabaseResponse` must be returned as
 * it is. If you need a different response, copy its cookies onto the new one
 * first. Returning a response that lacks the refreshed cookies logs people out
 * at random, which is a far worse bug than the one above and much harder to see.
 */
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
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Do not remove, and do not replace with getSession(). getUser() revalidates
  // the token against Supabase, which is what triggers the refresh and the
  // Set-Cookie above. getSession() reads the cookie and believes it.
  //
  // The result is deliberately unused: this file decides nothing.
  await supabase.auth.getUser();

  return supabaseResponse;
}

export const config = {
  // Everything except static assets. API routes ARE included on purpose — they
  // are where the 401 actually surfaced, and a route whose session is never
  // refreshed is the whole bug.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
