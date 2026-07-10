// ============================================================================
// Outbound email (Resend). SERVER-ONLY.
// ============================================================================
// SHIPS DARK. `emailEnabled()` is false unless BOTH env vars are set, and every
// send() call short-circuits to false. So this module is inert in production
// until the Resend domain + DNS land — exactly like the SPXD tracking stack,
// which stays silent until its wp-config constants exist.
//
//   RESEND_API_KEY   re_...        (secret — Vercel env only, never committed)
//   EMAIL_FROM       "ConveyClear <no-reply@conveyclear.co.za>"
//
// CONTRACT, same as lib/notify.ts: best-effort, NEVER THROWS. An email failure
// must never break the action that triggered it (a phase change, an account
// creation). Callers get a boolean and may ignore it.
//
// No SDK: Resend's REST API is one POST, so this adds no dependency.

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export function emailEnabled(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export interface SendEmailArgs {
  to: string;
  subject: string;
  html: string;
  /** Populates List-Unsubscribe so Gmail/Outlook render a native unsubscribe. */
  unsubscribeUrl?: string;
}

/** Returns true if Resend accepted the message. Never throws. */
export async function sendEmail(args: SendEmailArgs): Promise<boolean> {
  if (!emailEnabled()) return false;
  if (!args.to?.includes("@")) return false;

  try {
    const headers: Record<string, string> = {};
    if (args.unsubscribeUrl) {
      headers["List-Unsubscribe"] = `<${args.unsubscribeUrl}>`;
      headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
    }

    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM,
        to: [args.to],
        subject: args.subject,
        html: args.html,
        headers: Object.keys(headers).length ? headers : undefined,
      }),
    });

    if (!res.ok) {
      // A 403 here names the SENDER DOMAIN, not the key — an unverified domain
      // reads like an auth failure but isn't. (Learned the hard way on the
      // Quantra site, 2026-07-10.)
      console.error("[email] resend rejected:", res.status, (await res.text()).slice(0, 200));
      return false;
    }
    return true;
  } catch (e) {
    console.error("[email] send failed:", e);
    return false;
  }
}

export function unsubscribeUrl(token: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL || "https://convey-clear-app.vercel.app";
  return `${base}/api/email/unsubscribe?token=${token}`;
}
