-- ============================================================================
-- 094 — Business Compliance and Pre-Paid Meter Conversion join the checklist
-- ============================================================================
--
-- Zewn, 2026-09-11: "add the extra services to the prop trf page ... add the new
-- ones to the service list and all should be good."
--
-- BC and PPM were seeded as `services` rows in 002 and have been reachable ever
-- since through a client's "Request a service", but they were never lines on a
-- property transfer. The note in lib/councils/types.ts said why:
--
--   "these are not lines of their own (the checklist instantiates the seven, and
--    adding to that would put a Business Compliance line on every property
--    transfer), so they attach under OTHER"
--
-- That objection was correct until the same day. An unchosen line now draws no
-- circle and is not in any denominator (the 2026-09-11 change to
-- transferProgress), so two more `not_specified` rows are invisible to every
-- role on every screen. An existing transfer carrying seven lines and a new one
-- carrying nine read identically; the only difference is that the firm's "+"
-- offers two more things to ask for.
--
-- ⚠️ THIS MIGRATION IS HALF OF A PAIR. Applied WITHOUT the code change it puts
-- two visible "Not specified" rows on the staff checklist of every transfer —
-- harmless, but noise. Applied AFTER it, nothing changes on screen until someone
-- chooses one. Merge the branch first, then run this.
--
-- ── What it does ────────────────────────────────────────────────────────────
--   1. instantiate_transfer_services() creates nine lines, not seven.
--   2. Existing checklists are repositioned to the same canonical order, so an
--      old transfer and a new one do not read differently (072 set the same
--      precedent, and OTHER moves 7 → 9).
--   3. Every existing transfer gets its BC and PPM lines, so the "+" offers the
--      same nine everywhere. Without this a transfer opened yesterday could
--      never be asked for Business Compliance.
--
-- ── Why the trigger comes off ───────────────────────────────────────────────
-- 071's guard runs BEFORE UPDATE on every path and asks `app_is_staff()` first.
-- A migration session has no JWT, so it is judged as a firm and refused — 072
-- hit this and disabled the trigger explicitly; 085's header confirms the
-- behaviour is deliberate ("a migration touching these rows must disable the
-- trigger explicitly rather than be quietly waved through"). The DISABLE and the
-- ENABLE are in the same transaction, so the guard is never off to anyone else.
-- The INSERT below does not need it — the guard is UPDATE-only — but the
-- reposition does.
-- ============================================================================

BEGIN;

ALTER TABLE public.transfer_services
  DISABLE TRIGGER trg_transfer_services_partner_marking;

-- ---------------------------------------------------------------------------
-- 1. New checklists get nine lines
-- ---------------------------------------------------------------------------
-- OTHER stays last: it is the catch-all, and a catch-all in the middle of a
-- list reads as a service.

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
    ('COO', 5), ('REF', 6), ('BC', 7), ('PPM', 8), ('OTHER', 9)
  ) AS v(code, pos)
  ON CONFLICT (transfer_id, service_code) WHERE parent_id IS NULL
  DO NOTHING;
  GET DIAGNOSTICS inserted = ROW_COUNT;
  RETURN inserted;
END;
$$;

COMMENT ON FUNCTION public.instantiate_transfer_services(uuid, uuid) IS
  'Creates the nine top-level service lines for a transfer, in the canonical '
  'order, as not_specified. Idempotent: re-running adds only what is missing, '
  'which is how 094 backfilled BC and PPM onto transfers created when the list '
  'was seven.';

-- ---------------------------------------------------------------------------
-- 2. Existing checklists take the same order
-- ---------------------------------------------------------------------------
-- Sub-service rows (parent_id NOT NULL) keep their hand-set positions.

UPDATE public.transfer_services ts
   SET position = v.pos
  FROM (VALUES
    ('EBP', 1), ('COC', 2), ('MAD', 3), ('PRC', 4),
    ('COO', 5), ('REF', 6), ('BC', 7), ('PPM', 8), ('OTHER', 9)
  ) AS v(code, pos)
 WHERE ts.parent_id IS NULL
   AND ts.service_code = v.code
   AND ts.position IS DISTINCT FROM v.pos;

-- ---------------------------------------------------------------------------
-- 3. Every existing transfer gets the two new lines
-- ---------------------------------------------------------------------------
-- As `not_specified` (064's default), which is what "nobody has asked for this"
-- means and what keeps them invisible until someone does.
--
-- created_by is NULL: no person created these, a migration did. The column is
-- nullable and every other backfill in this schema has done the same.

INSERT INTO public.transfer_services (transfer_id, service_code, position)
SELECT t.id, v.code, v.pos
  FROM public.property_transfers t
 CROSS JOIN (VALUES ('BC', 7), ('PPM', 8)) AS v(code, pos)
ON CONFLICT (transfer_id, service_code) WHERE parent_id IS NULL
DO NOTHING;

ALTER TABLE public.transfer_services
  ENABLE TRIGGER trg_transfer_services_partner_marking;

COMMIT;

-- ============================================================================
-- VERIFY
-- ============================================================================
--
-- 1. Every transfer carries nine top-level lines:
--    SELECT count(*) AS transfers_not_nine FROM (
--      SELECT transfer_id FROM transfer_services
--       WHERE parent_id IS NULL
--       GROUP BY transfer_id HAVING count(*) <> 9
--    ) x;
--    -- expect: 0
--
-- 2. The two new lines are unchosen everywhere, so nothing appeared on screen:
--    SELECT status, count(*) FROM transfer_services
--     WHERE service_code IN ('BC','PPM') AND parent_id IS NULL
--     GROUP BY status;
--    -- expect: one row, not_specified, = 2 x (number of transfers)
--
-- 3. 🔴 071's guard is ENABLED again. If this says 'D', partners can edit
--    columns they must not:
--    SELECT tgenabled FROM pg_trigger
--     WHERE tgname = 'trg_transfer_services_partner_marking';
--    -- expect: 'O'
--
-- 4. Nothing that was already chosen moved:
--    SELECT count(*) FROM transfer_services
--     WHERE parent_id IS NULL AND status <> 'not_specified';
--    -- expect: the same count as before the migration
--
-- ============================================================================
-- DOWN
-- ============================================================================
-- Only safe while no BC or PPM line has been chosen. Check first:
--   SELECT count(*) FROM transfer_services
--    WHERE service_code IN ('BC','PPM') AND status <> 'not_specified';
--   -- must be 0
--
--   BEGIN;
--   ALTER TABLE public.transfer_services
--     DISABLE TRIGGER trg_transfer_services_partner_marking;
--   DELETE FROM public.transfer_services
--    WHERE parent_id IS NULL AND service_code IN ('BC','PPM')
--      AND status = 'not_specified' AND matter_id IS NULL;
--   -- then restore 072's seven-code instantiate_transfer_services() body and
--   -- its position UPDATE (OTHER back to 7).
--   ALTER TABLE public.transfer_services
--     ENABLE TRIGGER trg_transfer_services_partner_marking;
--   COMMIT;
-- ============================================================================
