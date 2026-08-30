-- ============================================================================
-- 072 — the service vocabulary the councils actually use
-- ============================================================================
-- From the handwritten notes transcribed 2026-08-31
-- (NOTES-HANDWRITTEN-2026-08-31.md, §11.1 / §11.15 / §11.16).
--
-- Zewn, on the three council sheets: the seven services are the same everywhere
-- and they run in ONE fixed order. The numbering on each sheet is the order the
-- discussion happened in, not data.
--
--     EBP · COC · MAD · PRC · COO · REF · OTHER
--
-- RENAMES (all four confirmed by Zewn 2026-08-31):
--
--     BP      -> EBP     Existing Building Plans
--     CERT    -> COC     Certificate of Compliance / Certificates
--     RCF     -> PRC     Property Rates Clearance   (the umbrella)
--     REFUND  -> REF     Refund
--
--     MAD, COO and OTHER are unchanged.
--
-- WHY RCF -> PRC IS A CORRECTNESS FIX, NOT COSMETICS
--   `RCF` currently means two different things in one system:
--     * services.code 'RCF'  seeded as "Rates Clearance Figures"  (002:277)
--       then restructured by 012 into the umbrella "Property Rates Clearance"
--     * the checklist's 'RCF', labelled "Property Rates Clearance"
--       (TransferServices.tsx:33)
--   while services.code 'RCC' exists SEPARATELY as "Rates Clearance
--   Certificate" (002:312) -- i.e. as one of the three things inside the
--   umbrella. Renaming the umbrella to PRC separates the two meanings.
--
-- WHY THIS IS SAFE WHERE 066 WAS NOT
--   066 renamed the CHECKLIST to match services.code, arguing services.code was
--   load-bearing. It is less load-bearing than it looked:
--     * matters.service_id is a UUID FK to services(id) (001:283) -- the code is
--       not the join key, so a rename cannot orphan a matter.
--     * transfer_services.service_code is free text with no FK; it is matched to
--       services.code by convention. That convention is what 066 repaired and
--       what this migration must preserve -- both sides are renamed together,
--       in one transaction.
--     * email_templates.service_code (001:491) also keys on the code and is
--       renamed here too. Missing it would silently detach every BP and RCF
--       template from its service.
--
--   Template CODES ('BP_T1', 'RCF_T1') are deliberately NOT renamed: they are
--   referenced by name from services.config JSON ("doc_request": "RCF_T1"), so
--   renaming them means rewriting that JSON as well. The cosmetic mismatch
--   (template RCF_T1 under service PRC) is harmless and reversible. ▶ Tidy in a
--   later migration if it ever grates.
--
-- PRC SUBTYPE
--   Zewn, 2026-08-31: "RCF, RCC and RCA are all PRC matters, just at different
--   levels. RCA is an application to open a rates clearance account, RCF is to
--   get rates clearance figures from the account and RCC is to get a
--   certificate."
--
--   So they are sequential STAGES of one job, not three alternatives, and the
--   choice has to be recorded per line. `prc_subtype` is nullable on purpose:
--   instantiate_transfer_services() creates all seven lines when a transfer is
--   opened, and at that moment nobody knows which rates-clearance stage is
--   wanted. The trigger below requires the subtype only at the point it becomes
--   answerable -- when the line is turned into a matter.
--
--   ⚠️ Existing PRC lines are left NULL rather than backfilled to 'RCF'. An
--   existing umbrella line could be RCA or RCC work; guessing would put a wrong
--   pipeline on real matters, and §3.6 in the resume file is the record of what
--   guessing at a note costs. Staff pick on the next touch.
--
-- EXPAND / CONTRACT
--   This is the EXPAND half and it is reversible -- see the DOWN notes at the
--   foot. Nothing is dropped here. The contract half (removing the old codes
--   from any remaining config) is a later migration, deliberately after launch.
--
-- VERIFICATION GATE (run before and after; the numbers must match)
--   SELECT count(*) FROM transfer_services WHERE matter_id IS NOT NULL;
--   That count is what 066 proved can silently go to zero.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. services.code -- the canonical vocabulary
-- ---------------------------------------------------------------------------
-- ON CONFLICT is impossible here: none of EBP/COC/PRC/REF exists as a
-- services.code today (002, 007, 011, 063 between them seed BC, BP, COO, MAD,
-- MAQ, PPM, RCC, RCF, REFUND, CERT). Guarded anyway so a re-run is harmless.

UPDATE public.services SET code = 'EBP' WHERE code = 'BP'
  AND NOT EXISTS (SELECT 1 FROM public.services WHERE code = 'EBP');

UPDATE public.services SET code = 'COC' WHERE code = 'CERT'
  AND NOT EXISTS (SELECT 1 FROM public.services WHERE code = 'COC');

UPDATE public.services SET code = 'PRC' WHERE code = 'RCF'
  AND NOT EXISTS (SELECT 1 FROM public.services WHERE code = 'PRC');

UPDATE public.services SET code = 'REF' WHERE code = 'REFUND'
  AND NOT EXISTS (SELECT 1 FROM public.services WHERE code = 'REF');

-- The umbrella is now named as one. RCA / RCF / RCC hang off it as subtypes,
-- not as sibling services.
UPDATE public.services
   SET name = 'Property Rates Clearance',
       is_umbrella = true
 WHERE code = 'PRC';

-- ⚠️ services.code 'RCC' ("Rates Clearance Certificate", 002:312) is LEFT
-- ALONE. It is a skeleton row that matters may already reference by
-- service_id, so deactivating it would strand them. Under the new model it is
-- a PRC subtype rather than a service. ▶ Decide its fate once Phase 4 lands.

-- ---------------------------------------------------------------------------
-- 2. The transfer checklist speaks the same vocabulary
-- ---------------------------------------------------------------------------
-- Both sides move together, in this transaction. 066's failure mode was the two
-- drifting apart.

UPDATE public.transfer_services SET service_code = 'EBP'
 WHERE service_code = 'BP';

UPDATE public.transfer_services SET service_code = 'COC'
 WHERE service_code = 'CERT';

UPDATE public.transfer_services SET service_code = 'PRC'
 WHERE service_code = 'RCF';

UPDATE public.transfer_services SET service_code = 'REF'
 WHERE service_code = 'REFUND';

-- ---------------------------------------------------------------------------
-- 3. Email templates follow their service
-- ---------------------------------------------------------------------------
-- 001:491 -- service_code TEXT NOT NULL DEFAULT 'GLOBAL'. Not renaming these
-- would leave every BP and RCF template pointing at a code that no longer
-- exists.

UPDATE public.email_templates SET service_code = 'EBP'
 WHERE service_code = 'BP';

UPDATE public.email_templates SET service_code = 'COC'
 WHERE service_code = 'CERT';

UPDATE public.email_templates SET service_code = 'PRC'
 WHERE service_code = 'RCF';

UPDATE public.email_templates SET service_code = 'REF'
 WHERE service_code = 'REFUND';

-- ---------------------------------------------------------------------------
-- 4. The PRC subtype
-- ---------------------------------------------------------------------------

ALTER TABLE public.transfer_services
  ADD COLUMN IF NOT EXISTS prc_subtype text;

ALTER TABLE public.transfer_services
  DROP CONSTRAINT IF EXISTS transfer_services_prc_subtype_check;

ALTER TABLE public.transfer_services
  ADD CONSTRAINT transfer_services_prc_subtype_check
  CHECK (
    prc_subtype IS NULL
    OR (service_code = 'PRC' AND prc_subtype IN ('RCA', 'RCF', 'RCC'))
  );

COMMENT ON COLUMN public.transfer_services.prc_subtype IS
  'Which rates-clearance stage this PRC line is: RCA opens the '
  'account, RCF gets the figures from it, RCC gets the certificate '
  '(Zewn, 2026-08-31). Sequential stages of one job, not '
  'alternatives. NULL until the line is actioned -- the checklist is '
  'auto-created before anyone knows which stage is wanted. Required '
  'once the line becomes a matter; see '
  'trg_transfer_services_prc_subtype.';

-- The rule lives in a TRIGGER, not the CHECK above and not the API route.
-- Same three reasons as 071: a CHECK cannot see that matter_id was just set
-- while prc_subtype was not, a route is bypassable because Supabase exposes
-- PostgREST directly to any signed-in user, and column GRANTs are per-role
-- while staff and partners share `authenticated`.
CREATE OR REPLACE FUNCTION public.enforce_prc_subtype()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.service_code = 'PRC'
     AND NEW.matter_id IS NOT NULL
     AND NEW.prc_subtype IS NULL THEN
    RAISE EXCEPTION
      'A rates clearance line must say which stage it is '
      '(RCA, RCF or RCC) before it can become a matter.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_transfer_services_prc_subtype
  ON public.transfer_services;

CREATE TRIGGER trg_transfer_services_prc_subtype
  BEFORE INSERT OR UPDATE ON public.transfer_services
  FOR EACH ROW EXECUTE FUNCTION public.enforce_prc_subtype();

-- ---------------------------------------------------------------------------
-- 5. New checklists use the new vocabulary and the canonical order
-- ---------------------------------------------------------------------------
-- Without this, every transfer opened from here would reintroduce the old
-- codes -- which is precisely the bug 066 had to clean up.
--
-- Order is Zewn's canonical one, identical for every council. It differs from
-- 066's: MAD moves ahead of PRC.

CREATE OR REPLACE FUNCTION public.instantiate_transfer_services(
  t_id uuid, actor uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inserted integer;
BEGIN
  INSERT INTO public.transfer_services
    (transfer_id, service_code, position, created_by)
  SELECT t_id, v.code, v.pos, actor
  FROM (VALUES
    ('EBP', 1), ('COC', 2), ('MAD', 3), ('PRC', 4),
    ('COO', 5), ('REF', 6), ('OTHER', 7)
  ) AS v(code, pos)
  ON CONFLICT (transfer_id, service_code) WHERE parent_id IS NULL
  DO NOTHING;
  GET DIAGNOSTICS inserted = ROW_COUNT;
  RETURN inserted;
END;
$$;

-- Existing checklists get the canonical order too, so an old transfer and a new
-- one do not read differently. Sub-service rows (parent_id NOT NULL) keep their
-- hand-set positions.
UPDATE public.transfer_services ts
   SET position = v.pos
  FROM (VALUES
    ('EBP', 1), ('COC', 2), ('MAD', 3), ('PRC', 4),
    ('COO', 5), ('REF', 6), ('OTHER', 7)
  ) AS v(code, pos)
 WHERE ts.parent_id IS NULL
   AND ts.service_code = v.code
   AND ts.position IS DISTINCT FROM v.pos;

COMMIT;

-- ============================================================================
-- VERIFY (run after; block 1 and 2 are the ones that matter)
-- ============================================================================
--
-- 1. No old code survives anywhere:
--    SELECT 'services'   AS t, code AS v FROM services
--     WHERE code IN ('BP','CERT','RCF','REFUND')
--    UNION ALL
--    SELECT 'checklist', service_code FROM transfer_services
--     WHERE service_code IN ('BP','CERT','RCF','REFUND')
--    UNION ALL
--    SELECT 'templates', service_code FROM email_templates
--     WHERE service_code IN ('BP','CERT','RCF','REFUND');
--    -- expect: 0 rows
--
-- 2. Matter links survive (the 066 gate). Compare with the same count taken
--    BEFORE the migration -- they must be equal:
--    SELECT count(*) FROM transfer_services WHERE matter_id IS NOT NULL;
--
-- 3. The trigger is live:
--    SELECT tgname FROM pg_trigger
--     WHERE tgname = 'trg_transfer_services_prc_subtype';
--    -- expect: 1 row
--
-- ============================================================================
-- DOWN (reversible; nothing here was dropped)
-- ============================================================================
--   UPDATE services          SET code='BP'     WHERE code='EBP';
--   UPDATE services          SET code='CERT'   WHERE code='COC';
--   UPDATE services          SET code='RCF', is_umbrella=false WHERE code='PRC';
--   UPDATE services          SET code='REFUND' WHERE code='REF';
--   ...the same four UPDATEs on transfer_services.service_code
--   ...and on email_templates.service_code
--   DROP TRIGGER IF EXISTS trg_transfer_services_prc_subtype
--     ON transfer_services;
--   DROP FUNCTION IF EXISTS enforce_prc_subtype();
--   ALTER TABLE transfer_services DROP COLUMN IF EXISTS prc_subtype;
--   -- then restore 066's instantiate_transfer_services() body.
-- ============================================================================
