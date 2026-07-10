import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit, clientIp } from "@/lib/ratelimit";

export const runtime = "nodejs";

// One-click unsubscribe from matter emails (#5). UNAUTHENTICATED by necessity —
// the recipient clicks it from their inbox, signed out.
//
// Security: the only credential is `users.unsubscribe_token`, an opaque random
// uuid (migration 028). It is deliberately NOT the user id — that would let
// anyone holding an id (they appear all over the app's own URLs) unsubscribe an
// arbitrary user. The token grants exactly one capability: set notify_email=false
// on its own row. It can never read anything or set the flag back to true.
//
// GET  → a human clicking the footer link (returns a small HTML page).
// POST → RFC 8058 one-click, which Gmail/Outlook fire from their native button.

async function unsubscribe(token: string | null): Promise<boolean> {
  if (!token) return false;
  // Reject anything that isn't a uuid before it reaches Postgres, so a malformed
  // token is a clean `false` rather than a 22P02 invalid-input-syntax error.
  if (!/^[0-9a-f-]{36}$/i.test(token)) return false;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("users")
    .update({ notify_email: false })
    .eq("unsubscribe_token", token)
    .select("id");

  return !error && (data?.length ?? 0) > 0;
}

function page(title: string, message: string, status: number): Response {
  return new NextResponse(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
     <body style="margin:0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#f4f5f7;">
       <div style="max-width:480px;margin:15vh auto;background:#fff;border-radius:12px;overflow:hidden;">
         <div style="background:#1B2E6B;padding:18px 24px;color:#fff;font-weight:700;">ConveyClear</div>
         <div style="padding:24px;color:#1f2937;line-height:1.55;">
           <h1 style="margin:0 0 8px;font-size:18px;">${title}</h1>
           <p style="margin:0;color:#4b5563;font-size:14px;">${message}</p>
         </div>
       </div>
     </body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

export async function GET(request: Request) {
  if (!rateLimit(`unsub:${clientIp(request)}`, 20, 60_000)) {
    return page("Too many requests", "Please try again in a minute.", 429);
  }
  const ok = await unsubscribe(new URL(request.url).searchParams.get("token"));
  return ok
    ? page("You're unsubscribed", "You will no longer receive email updates when a matter changes phase. You can turn them back on any time under Account in the portal.", 200)
    : page("Link not recognised", "That unsubscribe link is invalid or has already been used. You can manage email updates under Account in the portal.", 400);
}

// RFC 8058 one-click. Mail clients POST here; they expect 2xx and ignore the body.
export async function POST(request: Request) {
  if (!rateLimit(`unsub:${clientIp(request)}`, 20, 60_000)) {
    return NextResponse.json({ ok: false }, { status: 429 });
  }
  const ok = await unsubscribe(new URL(request.url).searchParams.get("token"));
  return NextResponse.json({ ok }, { status: ok ? 200 : 400 });
}
