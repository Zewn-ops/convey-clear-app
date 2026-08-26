-- ============================================================================
-- 066 — the checklist speaks the same service codes as the rest of the system
-- ============================================================================
-- 063 seeded the service checklist using the ABBREVIATIONS FROM THE MEETING
-- NOTES rather than the codes already in `services`:
--
--     checklist   services   name
--     EBP    →    BP         Existing Building Plans
--     PRC    →    RCF        Property Rates Clearance
--
-- Everything else (CERT, COO, MAD, REFUND) happened to match, which is exactly
-- why it went unnoticed: on a transfer whose only matters were a change of
-- ownership and a refund, the checklist linked up perfectly.
--
-- The cost was silent and total for those two services. A matter attaches to its
-- checklist line by service code, so a rates clearance or a building-plans
-- matter could NEVER attach — the line stayed "Not started" no matter how far
-- the work had actually progressed, and "Open as matter" could not preselect the
-- service either. Those two are also the most common services ConveyClear runs.
--
-- Caught by the backfill on production: two of four expected links appeared.
--
-- Renaming the CHECKLIST is the right direction, not renaming the services.
-- `services.code` is load-bearing — pipelines are keyed on it (lib/pipelines),
-- n8n reads it, and every existing matter references the row. The checklist is
-- three days old and its labels are presentational anyway: the UI already prints
-- "Existing Building Plans" from a label map, so nothing user-visible changes.
-- ============================================================================

BEGIN;

-- The unique index is on (transfer_id, service_code) WHERE parent_id IS NULL, so
-- a rename cannot collide unless a transfer already had BOTH spellings. It
-- cannot: 063 only ever created one of each. Belt and braces — drop any row that
-- would collide before renaming, preferring the one that already has a matter.
DELETE FROM public.transfer_services a
 USING public.transfer_services b
 WHERE a.parent_id IS NULL AND b.parent_id IS NULL
   AND a.transfer_id = b.transfer_id
   AND a.service_code = 'EBP' AND b.service_code = 'BP'
   AND a.matter_id IS NULL;

DELETE FROM public.transfer_services a
 USING public.transfer_services b
 WHERE a.parent_id IS NULL AND b.parent_id IS NULL
   AND a.transfer_id = b.transfer_id
   AND a.service_code = 'PRC' AND b.service_code = 'RCF'
   AND a.matter_id IS NULL;

UPDATE public.transfer_services SET service_code = 'BP'  WHERE service_code = 'EBP';
UPDATE public.transfer_services SET service_code = 'RCF' WHERE service_code = 'PRC';

-- Same correction in the function that creates new checklists, or every transfer
-- opened from here would reintroduce the mismatch.
CREATE OR REPLACE FUNCTION public.instantiate_transfer_services(t_id uuid, actor uuid DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  inserted integer;
BEGIN
  -- Order is the municipal sequence: everything else clears before Change of
  -- Ownership, and the refund follows it. Codes MUST match services.code — see
  -- 066; using the meeting's abbreviations here silently broke matter linking.
  INSERT INTO public.transfer_services (transfer_id, service_code, position, created_by)
  SELECT t_id, v.code, v.pos, actor
  FROM (VALUES
    ('BP', 1), ('CERT', 2), ('RCF', 3), ('MAD', 4), ('COO', 5), ('REFUND', 6), ('OTHER', 7)
  ) AS v(code, pos)
  ON CONFLICT (transfer_id, service_code) WHERE parent_id IS NULL DO NOTHING;
  GET DIAGNOSTICS inserted = ROW_COUNT;
  RETURN inserted;
END $$;

-- Now that the vocabularies agree, attach any matter that was unattachable
-- before. Oldest wins where a transfer carries two of the same service.
WITH first_matter AS (
  SELECT DISTINCT ON (m.transfer_id, s.code)
         m.transfer_id, s.code AS service_code, m.id AS matter_id
    FROM public.matters m
    JOIN public.services s ON s.id = m.service_id
   WHERE m.transfer_id IS NOT NULL
   ORDER BY m.transfer_id, s.code, m.created_at
)
UPDATE public.transfer_services ts
   SET matter_id = fm.matter_id
  FROM first_matter fm
 WHERE ts.transfer_id = fm.transfer_id
   AND ts.service_code = fm.service_code
   AND ts.parent_id IS NULL
   AND ts.matter_id IS NULL;

UPDATE public.transfer_services
   SET status = 'needed'
 WHERE matter_id IS NOT NULL AND status = 'not_specified';

COMMIT;

-- ============================================================================
-- VERIFY — every checklist code must exist in services, except OTHER.
-- ============================================================================
SELECT ts.service_code,
       (s.code IS NOT NULL) AS matches_a_service,
       count(*) AS lines,
       count(ts.matter_id) AS linked
  FROM public.transfer_services ts
  LEFT JOIN public.services s ON s.code = ts.service_code
 WHERE ts.parent_id IS NULL
 GROUP BY ts.service_code, (s.code IS NOT NULL)
 ORDER BY ts.service_code;
