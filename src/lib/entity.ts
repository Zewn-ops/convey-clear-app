import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";

/**
 * The active entity — "which of my subsections am I looking at".
 *
 * A person may act for themselves and for one or more businesses or trusts.
 * Each is its own `clients` row; `client_members` says which ones a login may
 * act for. This module resolves the one currently selected.
 *
 * 🔴 THE COOKIE IS NOT A SECURITY BOUNDARY. RLS still allows every entity the
 * user is a member of; the cookie only narrows which of them a page shows. So
 * the cookie is re-validated against real membership on every read, and an
 * unrecognised value silently falls back to the default rather than erroring.
 * Getting this backwards — trusting the cookie and relying on it to restrict —
 * would turn a UI preference into an authorization control.
 */

export const ENTITY_COOKIE = "cc-entity";

export type Membership = {
  clientId: string;
  role: "owner" | "member";
  isDefault: boolean;
  name: string;
  entityType: "natural_person" | "business" | "trust";
};

export type EntityContext = {
  memberships: Membership[];
  /** The entity to scope this request to, or null when the user has none. */
  activeId: string | null;
  active: Membership | null;
  /** True when the switcher is worth rendering at all. */
  hasChoice: boolean;
};

type Row = {
  client_id: string;
  role: "owner" | "member";
  is_default: boolean;
  clients: { full_name: string | null; business_name: string | null; entity_type: string } | null;
};

/**
 * Reads through RLS deliberately: `client_members_self_read` already limits the
 * rows to the caller's own, so there is no service-role client here and no way
 * for this to return an entity the user is not a member of.
 */
export async function getEntityContext(): Promise<EntityContext> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("client_members")
    .select("client_id, role, is_default, clients(full_name, business_name, entity_type)")
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true });

  const memberships: Membership[] = ((data as Row[] | null) ?? []).map((r) => ({
    clientId: r.client_id,
    role: r.role,
    isDefault: r.is_default,
    entityType: (r.clients?.entity_type as Membership["entityType"]) ?? "natural_person",
    name:
      r.clients?.business_name?.trim() ||
      r.clients?.full_name?.trim() ||
      "Unnamed entity",
  }));

  if (memberships.length === 0) {
    return { memberships, activeId: null, active: null, hasChoice: false };
  }

  const requested = (await cookies()).get(ENTITY_COOKIE)?.value;
  // The validation that matters: a cookie naming an entity this user is not a
  // member of is ignored, not honoured and not an error.
  const active =
    memberships.find((m) => m.clientId === requested) ??
    memberships.find((m) => m.isDefault) ??
    memberships[0];

  return {
    memberships,
    activeId: active.clientId,
    active,
    hasChoice: memberships.length > 1,
  };
}

/**
 * Display label for a membership: "Personal" for the person's own record,
 * the entity's name otherwise.
 *
 * Deliberately NOT the "{person} – {entity}" form from the spec discussion.
 * That label is per-viewer, and the switcher already sits inside one person's
 * session, so repeating their name on every row is noise. The full form belongs
 * anywhere a party is shown to someone else.
 */
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
