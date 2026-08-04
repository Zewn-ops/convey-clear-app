-- ============================================================================
-- ConveyClear — TEST DATA RESET (fresh start for testing the latest updates)
-- ============================================================================
-- ⚠️⚠️ DESTRUCTIVE. DELETES ALL clients, partners/firms, matters, parties,
-- documents, and every transactional record. NOT a migration — a manual reset.
--
-- PRESERVES: services, municipalities, document_types, email_templates
-- (reference data) AND staff/admin/super_admin user accounts.
-- REMOVES: all client + business_partner login rows in public.users.
--
-- BEFORE RUNNING:
--   1. Confirm you are on the RIGHT project (yhgriqagrhyblhmloctc) and WANT this.
--   2. Take a backup / snapshot (Supabase dashboard) first.
--   3. Run the "BEFORE" counts block to see what you're about to delete.
--   4. This runs in a transaction — if the counts look wrong, ROLLBACK.
--   5. After committing, delete the orphaned auth logins (see §3 + the auth note).
--
-- Run in: Supabase Dashboard → SQL Editor (as the postgres role).
-- ============================================================================

-- ---- BEFORE counts (run this first on its own) -----------------------------
-- SELECT
--   (SELECT count(*) FROM clients)           AS clients,
--   (SELECT count(*) FROM business_partners) AS firms,
--   (SELECT count(*) FROM matters)           AS matters,
--   (SELECT count(*) FROM matter_parties)    AS parties,
--   (SELECT count(*) FROM documents)         AS documents,
--   (SELECT count(*) FROM users WHERE role IN ('client','business_partner')) AS client_partner_users,
--   (SELECT count(*) FROM users WHERE role NOT IN ('client','business_partner')) AS staff_users_kept;

BEGIN;

-- 1. Matter children (most cascade from matters, but delete explicitly to be safe)
DELETE FROM matter_parties;
DELETE FROM documents;
DELETE FROM matter_activities;
DELETE FROM matter_subscribers;
DELETE FROM matter_stages;
DELETE FROM onboarding_links;
DELETE FROM communications;
DELETE FROM tasks;
DELETE FROM invoices;
DELETE FROM power_of_attorneys;
DELETE FROM document_requests;

-- 2. Matters (must go before clients — FK ON DELETE RESTRICT)
DELETE FROM matters;

-- 3. People + orgs
DELETE FROM contact_labels;
DELETE FROM contacts;
DELETE FROM properties;
DELETE FROM clients;

-- Remove client + partner LOGIN rows (keep staff/admin/super_admin).
DELETE FROM users WHERE role IN ('client','business_partner');

-- Firms (now unreferenced)
DELETE FROM business_partners;

-- ---- AFTER counts (sanity check before COMMIT) -----------------------------
-- Expect zeros for clients/firms/matters/parties/documents, staff users intact.
SELECT
  (SELECT count(*) FROM clients)           AS clients,
  (SELECT count(*) FROM business_partners) AS firms,
  (SELECT count(*) FROM matters)           AS matters,
  (SELECT count(*) FROM matter_parties)    AS parties,
  (SELECT count(*) FROM documents)         AS documents,
  (SELECT count(*) FROM users)             AS users_remaining;

-- If the above looks correct:
COMMIT;
-- Otherwise:
-- ROLLBACK;

-- ============================================================================
-- §3. AUTH CLEANUP (do AFTER COMMIT) — public.users rows are gone, but the
-- Supabase Auth logins (auth.users) for those clients/partners remain.
-- Option A (UI): Dashboard → Authentication → Users → delete the client/partner
--   accounts (keep your staff/admin logins).
-- Option B (SQL): delete auth users that no longer have a public.users row:
--   DELETE FROM auth.users
--   WHERE id NOT IN (SELECT auth_user_id FROM public.users WHERE auth_user_id IS NOT NULL);
--   ⚠ Verify the subquery returns your staff auth ids before running.
--
-- §4. STORAGE CLEANUP (if migration 015 applied + any test docs uploaded):
--   Dashboard → Storage → matter-documents → delete all objects.
-- ============================================================================
