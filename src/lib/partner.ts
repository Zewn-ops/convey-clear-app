import { createClient } from "@/lib/supabase/server";

// Shared guard for partner-only server routes. Returns the caller's profile id +
// their firm (business_partner) id, or an error tuple.
export async function requirePartner() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated", status: 401 as const };

  const { data: me } = await supabase
    .from("users")
    .select("id, role, business_partner_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!me || me.role !== "business_partner" || !me.business_partner_id) {
    return { error: "Not a partner account", status: 403 as const };
  }
  return { userId: me.id as string, partnerId: me.business_partner_id as string };
}
