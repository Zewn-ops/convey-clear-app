import { createClient } from "@/lib/supabase/server";
import { STAFF_ROLES, ADMIN_ROLES, type UserRole } from "@/types";

// Shared guards for staff-/admin-only server routes — the sibling of
// lib/partner.ts's requirePartner/requireFirmAdmin. Before 2026-08-19 this
// check was hand-copied into eleven route files; a guard that exists in eleven
// spellings is eleven chances for one of them to drift weaker, so it lives
// here once now. Returns the caller's profile id + role, or an error tuple —
// call sites branch on `"error" in result`.
async function requireRole(allowed: readonly UserRole[]) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated", status: 401 as const };

  const { data: me } = await supabase
    .from("users")
    .select("id, role")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  const role = (me?.role ?? null) as UserRole | null;
  if (!me || !role || !allowed.includes(role)) {
    return { error: "Insufficient privilege", status: 403 as const };
  }
  return { callerId: me.id as string, callerRole: role };
}

/** Any staff role (services / ops / delivery / admin / super_admin). */
export async function requireStaff() {
  return requireRole(STAFF_ROLES);
}

/** Admin tier only (admin / super_admin). */
export async function requireAdmin() {
  return requireRole(ADMIN_ROLES);
}
