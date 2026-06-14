import { createClient } from "@supabase/supabase-js";

// Service-role client — bypasses RLS. SERVER-ONLY. Never import into client code.
// Used by trusted server routes (e.g. the public onboarding submit, which validates
// a token instead of a user session).
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}
