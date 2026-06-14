// ============================================================================
// ConveyClear — role seed (run once after migration 013).
// Creates the FIRST super_admin (bootstraps user-management) and, optionally,
// one demo login per role + a demo partner firm with a referred client + matter.
//
// Reads NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from the shell env
// or from .env.local (never printed). Service-role bypasses RLS + the privilege
// guard, so it can mint the first super_admin.
//
// Usage (from convey-clear-app/):
//   SEED_SUPER_ADMIN_EMAIL="zuaan@quantratech.co.za" node scripts/seed_roles.mjs
//   SEED_SUPER_ADMIN_EMAIL="..." SEED_DEMO=1 node scripts/seed_roles.mjs
//
// Prints a credentials table at the end. Idempotent: existing accounts are
// updated/relinked rather than duplicated.
// ============================================================================
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";

function loadEnvLocal() {
  try {
    const txt = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
    for (const line of txt.split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch { /* no .env.local — rely on shell env */ }
}
loadEnvLocal();

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (env or .env.local).");
  process.exit(1);
}
const SUPER_EMAIL = (process.env.SEED_SUPER_ADMIN_EMAIL || "").trim().toLowerCase();
if (!SUPER_EMAIL) {
  console.error('Set SEED_SUPER_ADMIN_EMAIL="you@domain" — the bootstrap super_admin.');
  process.exit(1);
}
const DEMO = process.env.SEED_DEMO === "1";

const sb = createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const pw = () => "CC-" + randomBytes(6).toString("base64url").replace(/[^A-Za-z0-9]/g, "").slice(0, 10);
const creds = [];

async function upsertUser({ email, fullName, role, businessPartnerId = null, clientId = null }) {
  email = email.toLowerCase();
  const password = pw();
  // create or fetch the auth user
  let authId;
  const { data: created, error } = await sb.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { full_name: fullName, provisioned: true },
  });
  if (error) {
    // already exists → find it + reset password so creds are known
    const { data: list } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const found = list?.users?.find((u) => u.email?.toLowerCase() === email);
    if (!found) throw new Error(`createUser failed for ${email}: ${error.message}`);
    authId = found.id;
    await sb.auth.admin.updateUserById(authId, { password });
  } else {
    authId = created.user.id;
  }
  // ensure the public.users row exists, then set role + links
  await sb.from("users").upsert(
    { auth_user_id: authId, email, full_name: fullName, role, business_partner_id: businessPartnerId, client_id: clientId, active: true },
    { onConflict: "email" }
  );
  await sb.from("users").update({ role, full_name: fullName, business_partner_id: businessPartnerId, client_id: clientId, active: true }).eq("auth_user_id", authId);
  creds.push({ role, email, password });
  return authId;
}

(async () => {
  console.log("Seeding super_admin:", SUPER_EMAIL);
  await upsertUser({ email: SUPER_EMAIL, fullName: "Super Admin", role: "super_admin" });

  if (DEMO) {
    console.log("Seeding demo role accounts…");
    // staff
    await upsertUser({ email: "demo.services@conveyclear.co.za", fullName: "Demo Services", role: "staff_services" });
    await upsertUser({ email: "demo.ops@conveyclear.co.za", fullName: "Demo Operations", role: "staff_ops" });

    // partner firm + partner user + referred client + matter
    const { data: firm } = await sb.from("business_partners")
      .upsert({ name: "Sterling & Associates (Demo)", partner_type: "law_firm", primary_email: "info@sterling-demo.co.za" }, { onConflict: "name" })
      .select("id").single();
    const firmId = firm?.id ?? (await sb.from("business_partners").select("id").eq("name", "Sterling & Associates (Demo)").single()).data.id;

    await upsertUser({ email: "partner@sterling-demo.co.za", fullName: "Demo Partner", role: "business_partner", businessPartnerId: firmId });

    // a referred client + matter so the partner has something to see
    const { data: svc } = await sb.from("services").select("id").eq("code", "COO").maybeSingle();
    const { data: client } = await sb.from("clients")
      .insert({ entity_type: "natural_person", full_name: "Demo Referred Client", primary_email: "referred@demo.co.za", business_partner_id: firmId })
      .select("id").single();
    if (client) {
      await sb.from("matters").insert({
        client_id: client.id, service_id: svc?.id ?? null, title: "Demo Referred Client — Erf 99",
        current_phase: "1", status: "open", priority: "standard", municipality: "COT",
      });
      // a client-portal login for this referred client
      await upsertUser({ email: "referred@demo.co.za", fullName: "Demo Referred Client", role: "client", clientId: client.id });
    }
  }

  console.log("\n=== CREDENTIALS (hand over securely, then rotate) ===");
  for (const c of creds) console.log(`${c.role.padEnd(16)} ${c.email.padEnd(38)} ${c.password}`);
  console.log("\nLogin at: <your prod URL>/auth/login");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
