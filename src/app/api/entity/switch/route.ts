import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ENTITY_COOKIE } from "@/lib/entity";

/**
 * Switch the active entity.
 *
 * The cookie is a display preference, not a permission — RLS already allows
 * every entity the user is a member of. Even so this route refuses to set a
 * value the caller has no membership for, because writing an unusable cookie
 * just produces a confusing silent fallback on the next page load.
 *
 * The membership check reads through RLS (client_members_self_read), so it
 * cannot confirm a membership the caller does not actually hold.
 */
export async function POST(req: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  let clientId: unknown;
  try {
    ({ clientId } = await req.json());
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  if (typeof clientId !== "string" || clientId.length === 0) {
    return NextResponse.json({ error: "clientId is required." }, { status: 400 });
  }

  const { data: membership } = await supabase
    .from("client_members")
    .select("client_id")
    .eq("client_id", clientId)
    .maybeSingle();

  if (!membership) {
    // Deliberately the same shape as a not-found: do not tell a caller whether
    // an entity exists, only whether they may act for it.
    return NextResponse.json(
      { error: "You are not a member of that entity." },
      { status: 403 }
    );
  }

  const res = NextResponse.json({ ok: true, clientId });
  res.cookies.set(ENTITY_COOKIE, clientId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    // A year: this is a preference, and being asked to re-pick your own company
    // every session would be worse than the cookie outliving a membership —
    // which getEntityContext() handles by falling back rather than failing.
    maxAge: 60 * 60 * 24 * 365,
  });
  return res;
}
