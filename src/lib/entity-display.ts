/**
 * Display helpers for entity memberships.
 *
 * Split out of lib/entity.ts deliberately: that module imports next/headers,
 * which makes it server-only, so a Client Component cannot import from it.
 * Passing these functions down from a Server Component instead throws
 * "Functions cannot be passed directly to Client Components" at render time.
 * Keeping them here lets both sides import the same implementation.
 */
import type { Membership } from "@/lib/entity";

/** Primary label: what this entity is called in the switcher. */
export function entityLabel(m: Membership): string {
  return m.entityType === "natural_person" ? "Personal" : m.name;
}

/** Sub-label: what kind of thing this entity is. */
export function entityKind(m: Membership): string {
  return m.entityType === "natural_person"
    ? "Your own affairs"
    : m.entityType === "trust"
      ? "Trust"
      : "Business";
}
