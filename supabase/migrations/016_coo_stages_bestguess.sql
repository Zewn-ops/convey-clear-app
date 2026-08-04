-- ============================================================================
-- ConveyClear — Migration 016: COO pipeline stages (BEST-GUESS, pending Jukka)
-- ============================================================================
-- Created: 2026-06-15. Target: Supabase yhgriqagrhyblhmloctc.
--
-- WHY: Jukka wants unique stages per matter type (BC ≠ COO ≠ PRC) and is sending
-- a definitive stage list. Until then, seed a BEST-GUESS COO stage set so the
-- matter-detail stage controls work for COO testing. Derived from COO_Research.md
-- §5, mapped onto the existing 4-phase model (matter-detail filters stages by
-- current phase). Admin matter-detail reads services.config.stages =
-- [{code,name,owner_role,phase}].
--
-- ⚠ REPLACE with Jukka's official list when it arrives. Idempotent — re-running
-- just resets COO's stages to this best-guess.
-- ============================================================================

BEGIN;

UPDATE public.services
SET config = jsonb_set(
  COALESCE(config, '{}'::jsonb),
  '{stages}',
  '[
    {"code":"coo_mandate",      "name":"Mandate & POA",                       "owner_role":"staff_services", "phase":1},
    {"code":"coo_parties",      "name":"Capture buyer & seller",              "owner_role":"staff_services", "phase":1},
    {"code":"coo_docs",         "name":"Collect documents (buyer & seller)",  "owner_role":"staff_services", "phase":2},
    {"code":"coo_clearance",    "name":"Rates clearance figures & certificate","owner_role":"staff_ops",     "phase":3},
    {"code":"coo_registration", "name":"Transfer registration",               "owner_role":"staff_ops",      "phase":3},
    {"code":"coo_ora",          "name":"Open buyer rates account (ORA)",       "owner_role":"staff_ops",     "phase":4},
    {"code":"coo_closure",      "name":"Seller account closure",              "owner_role":"staff_ops",      "phase":4},
    {"code":"coo_refund",       "name":"Seller deposit/credit refund & close","owner_role":"staff_ops",      "phase":4}
  ]'::jsonb,
  true
)
WHERE code = 'COO';

COMMIT;

-- Verification
SELECT code, jsonb_array_length(config->'stages') AS stage_count
FROM public.services WHERE code = 'COO';
