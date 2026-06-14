// ============================================================================
// Server-side session + profile helper — single source of truth for "who am I".
// Reads the real public.users row by auth_user_id = auth.uid(). Works under RLS
// (users_self_read policy permits a user to read their own row).
// ============================================================================
import { createClient } from "@/lib/supabase/server";
import { isStaffRole, isPartnerRole, type AppUser } from "@/types";

export interface SessionProfile {
  authUserId: string;
  profile: AppUser | null;
}

/** Returns the authenticated user's app profile, or null if not signed in. */
export async function getSessionProfile(): Promise<SessionProfile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("users")
    .select("*")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  return { authUserId: user.id, profile: (data as AppUser) ?? null };
}

/** Where a given role lands after login. */
export function homePathForRole(role?: AppUser["role"] | null): string {
  if (isStaffRole(role)) return "/admin";
  if (isPartnerRole(role)) return "/partner";
  return "/dashboard";
}
