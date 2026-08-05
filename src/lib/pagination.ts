// Page-size vocabulary, shared by the server-side list queries and the client
// Pagination control.
//
// ⚠️ These MUST NOT live in components/ui/Pagination.tsx. That file is
// "use client", and in a production build Next.js replaces a client module's
// exports with client-reference proxies. A Server Component importing
// `parsePageSize` from there gets a stub, not the function, and the page dies at
// request time with `TypeError: (0 , a.HA) is not a function` — while `next dev`
// works perfectly, because dev does not apply that transform.
//
// Same family as the entity-display extraction: anything a Server Component
// needs to CALL belongs in a plain module, and the client file imports it from
// here rather than owning it.

export const PAGE_SIZES = [25, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 25;

/** Clamp an arbitrary ?per= value to one we actually offer. */
export function parsePageSize(raw?: string | string[] | null): number {
  const v = Array.isArray(raw) ? raw[0] : raw;
  const n = parseInt(v ?? "", 10);
  return (PAGE_SIZES as readonly number[]).includes(n) ? n : DEFAULT_PAGE_SIZE;
}
