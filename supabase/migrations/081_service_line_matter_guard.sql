-- ============================================================================
-- 081 — a service line may only track a matter on its own transfer
-- ============================================================================
-- From §5.2. Zewn, 2026-08-31: "we need to revisit how and why the matters link
-- to the prop trfs. currently its a bit all over the place and messy."
--
-- 🔴 THE GAP. `transfer_services.matter_id` is a plain FK to `matters(id)` with
--   nothing tying it to the line's own transfer. So a line on transfer A could
--   point at a matter on transfer B — and the checklist would then show B's
--   progress, its phase circles and its "Open matter" link on A's page, while
--   B's own line showed nothing.
--
--   063 does carry a same-transfer guard, but it is about SUB-SERVICES and
--   their parent ("A sub-service must live on the same transfer as its parent,
--   or the tree spans two transactions"). Nothing was watching matter_id.
--
--   The route does not check it either: PATCH /api/transfer-services takes
--   `matterId` and writes it. Until now nothing in the UI called that endpoint,
--   which is why this never bit — §5.2 adds a control that does, so the rule
--   has to exist before the control does.
--
-- WHY A TRIGGER RATHER THAN A CHECK OR AN FK
--   The rule spans two tables: it compares transfer_services.transfer_id with
--   matters.transfer_id. A CHECK cannot look at another table, and a composite
--   foreign key would need `matters` to carry a unique key on
--   (id, transfer_id) — real, but a heavier change to a table this one only
--   points at. Same shape as 071's guard and 072's stage trigger.
--
-- ⚠️ EXISTING ROWS ARE NOT VALIDATED, AND THE MIGRATION DOES NOT FAIL ON THEM.
--   The trigger is BEFORE INSERT OR UPDATE, so a row that is already wrong
--   survives untouched and is caught the next time anyone saves it. Failing the
--   whole migration on historical data would block a fix that prevents more of
--   it. ▶ The VERIFY block below finds any such rows; run it and decide about
--   them deliberately, rather than having this file decide.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.enforce_service_line_matter()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  matter_transfer uuid;
BEGIN
  -- Only when the link actually moves. An unrelated edit to a line whose
  -- matter predates this rule must not be blocked by it -- the same mistake
  -- 072's stage trigger made and had to fix.
  IF NEW.matter_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.matter_id IS NOT DISTINCT FROM OLD.matter_id THEN
    RETURN NEW;
  END IF;

  SELECT transfer_id INTO matter_transfer
    FROM public.matters WHERE id = NEW.matter_id;

  -- A matter on NO transfer is fine to adopt: linking it here is exactly how
  -- it joins one, and the route that does that sets both.
  IF matter_transfer IS NOT NULL
     AND matter_transfer IS DISTINCT FROM NEW.transfer_id THEN
    RAISE EXCEPTION
      'That matter belongs to a different property transfer.'
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_transfer_services_matter_same_transfer
  ON public.transfer_services;

CREATE TRIGGER trg_transfer_services_matter_same_transfer
  BEFORE INSERT OR UPDATE ON public.transfer_services
  FOR EACH ROW EXECUTE FUNCTION public.enforce_service_line_matter();

COMMENT ON FUNCTION public.enforce_service_line_matter() IS
  'A service line may only track a matter on its own transfer (081). '
  'Spans two tables, so it cannot be a CHECK; fires only when matter_id '
  'actually changes, so a line linked before this rule existed stays '
  'editable. A matter on no transfer is allowed -- linking it here is how '
  'it joins one.';

COMMIT;

-- ============================================================================
-- VERIFY
-- ============================================================================
--   The trigger is live:
--   SELECT tgname FROM pg_trigger
--    WHERE tgname = 'trg_transfer_services_matter_same_transfer';
--   -- expect: 1 row
--
--   🔴 RUN THIS AND READ IT. Any row here is a line already tracking a matter
--   from a different transfer -- pre-existing, not created by this migration,
--   and now visible for the first time:
--   SELECT ts.id AS line, ts.transfer_id AS line_transfer,
--          m.id AS matter, m.transfer_id AS matter_transfer, ts.service_code
--     FROM transfer_services ts
--     JOIN matters m ON m.id = ts.matter_id
--    WHERE m.transfer_id IS NOT NULL
--      AND m.transfer_id IS DISTINCT FROM ts.transfer_id;
--   -- expect: 0 rows. If not, each one is showing another transfer's progress
--   -- on this transfer's page. Decide what to do with them deliberately.
--
--   The rule holds going forward:
--   BEGIN;
--     UPDATE transfer_services SET matter_id =
--       (SELECT id FROM matters WHERE transfer_id IS NOT NULL
--         AND transfer_id <> (SELECT transfer_id FROM transfer_services
--                              WHERE id = '<a line id>') LIMIT 1)
--      WHERE id = '<a line id>';
--   ROLLBACK;
--   -- expect: ERROR, 'That matter belongs to a different property transfer.'
--
-- ============================================================================
-- DOWN
-- ============================================================================
--   DROP TRIGGER IF EXISTS trg_transfer_services_matter_same_transfer
--     ON public.transfer_services;
--   DROP FUNCTION IF EXISTS public.enforce_service_line_matter();
-- ============================================================================
