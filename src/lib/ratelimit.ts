// Lightweight in-memory rate limiter. Best-effort on serverless (per warm
// instance) — it blunts bursts/loops but is NOT a distributed limiter. The real
// defences are Turnstile + Supabase Auth's native limits + Vercel Firewall.
// Fast-follow: swap for Upstash Ratelimit (durable, cross-instance). Fail-open.

type Bucket = { count: number; resetAt: number };
const store = new Map<string, Bucket>();

/** Returns true if the request is ALLOWED, false if it should be throttled. */
export function rateLimit(key: string, limit = 20, windowMs = 60_000): boolean {
  const now = Date.now();
  const b = store.get(key);
  if (!b || now > b.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (b.count >= limit) return false;
  b.count += 1;
  return true;
}

export function clientIp(req: Request): string {
  const h = req.headers;
  const fwd = h.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return h.get("x-real-ip") || "unknown";
}
