import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { homePathForRole } from "@/lib/auth";
import { rateLimit, clientIp } from "@/lib/ratelimit";

export const runtime = "nodejs";

// Set your own password, and clear must_change_password (migration 031).
//
// Done server-side rather than with supabase.auth.updateUser() in the browser so
// that the flag can only be cleared by the same call that actually changes the
// password — a client-side updateUser + a separate "clear the flag" endpoint
// would let a user skip the change and clear the flag on its own.

function passwordProblem(pw: string): string | null {
  if (pw.length < 8) return "Password must be at least 8 characters";
  if (!/[A-Z]/.test(pw)) return "Include at least one uppercase letter";
  if (!/[0-9]/.test(pw)) return "Include at least one number";
  return null;
}

export async function POST(request: Request) {
  if (!rateLimit(`change-password:${clientIp(request)}`, 10, 60_000)) {
    return NextResponse.json({ message: "Too many attempts. Try again shortly." }, { status: 429 });
  }

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return NextResponse.json({ message: "Not authenticated" }, { status: 401 });

  let body: { password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
  }

  const password = body.password ?? "";
  const problem = passwordProblem(password);
  if (problem) return NextResponse.json({ message: problem }, { status: 400 });

  // Reject setting the password to what it already is — otherwise a user held
  // here can "change" their temp password to the same temp password and walk
  // straight through the gate. Probed on a throwaway client so the caller's
  // session is untouched.
  const probe = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
  const { error: sameErr } = await probe.auth.signInWithPassword({ email: user.email, password });
  if (!sameErr) {
    return NextResponse.json(
      { message: "That is your current password — choose a different one." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { error: pwErr } = await admin.auth.admin.updateUserById(user.id, { password });
  if (pwErr) return NextResponse.json({ message: pwErr.message }, { status: 400 });

  // Only now — the password really did change.
  const { data: profile, error: flagErr } = await admin
    .from("users")
    .update({ must_change_password: false, updated_at: new Date().toISOString() })
    .eq("auth_user_id", user.id)
    .select("role")
    .maybeSingle();
  if (flagErr) return NextResponse.json({ message: flagErr.message }, { status: 400 });

  // Tell the caller where they actually live — /dashboard is the CLIENT portal,
  // so a staff member sent there would land in the wrong one (middleware guards
  // /admin and /partner, but lets anyone into /dashboard).
  return NextResponse.json({ ok: true, home: homePathForRole(profile?.role ?? null) });
}
