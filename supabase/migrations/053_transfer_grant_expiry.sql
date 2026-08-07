-- ============================================================================
-- 053 — attorney access expires 10 years after registration
-- ============================================================================
-- Decision, Portal Bi-Weekly Meeting 2 (2026-08-06), as clarified by Zewn
-- 2026-08-07: attorney access is TIME-BOUNDED to 10 years, while ConveyClear
-- itself retains everything indefinitely.
--
-- WHY THIS SHAPE
--   The meeting notes record "indefinite access ... to comply with legal 10-year
--   data retention requirements". Those are two different things: a 10-year
--   professional retention duty does not justify keeping a buyer's certified ID
--   reachable forever, and POPIA's minimality principle argues the other way.
--   So the obligation is honoured exactly — ten years — and no longer.
--
--   ConveyClear's own retention is unaffected: can_access_transfer() short-
--   circuits on app_is_staff() before it ever looks at a grant, so staff keep
--   seeing everything with no expiry applied. Only the FIRM branch is bounded.
--
--   Expiry is a separate column from revocation rather than a scheduled
--   revoked_at, because the two mean different things and the audit trail should
--   say which happened: revoked = someone took the access away; expired = the
--   retention period ran out. Collapsing them would lose that.
--
-- WHY THE CLOCK STARTS AT REGISTRATION
--   Retention runs from the end of the relationship, not its start. A transfer
--   that sits open for three years should not be nine-tenths through its
--   retention window on the day it completes.
--
-- ⚠️ can_access_transfer() is defined in 026 and REDEFINED in 052. Rewriting the
-- 052 version here, verified with:
--   grep -ln "FUNCTION public.can_access_transfer" supabase/migrations/*.sql
--   → 026, 052 (and now 053). 052 is the latest, so it is the base for this.
--   Per the house lesson: a function body is text, it does not follow renames,
--   and CREATE OR REPLACE takes the WHOLE body — find the LATEST definition.
-- ============================================================================

BEGIN;

ALTER TABLE public.transfer_access_grants
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

COMMENT ON COLUMN public.transfer_access_grants.expires_at IS
  'When this firm''s access lapses. Set to registration + 10 years by '
  'trg_tag_set_expiry when the transfer is first marked registered. NULL = no '
  'expiry yet (the transfer has not closed). Distinct from revoked_at on '
  'purpose: expired means the retention window ran out, revoked means somebody '
  'took the access away.';

-- Retention period in one place, so changing it later is one edit and the
-- number is greppable rather than buried in a trigger body.
CREATE OR REPLACE FUNCTION public.attorney_retention_interval()
RETURNS interval LANGUAGE sql IMMUTABLE AS $$ SELECT interval '10 years' $$;

COMMENT ON FUNCTION public.attorney_retention_interval() IS
  'How long a firm keeps access to a registered transfer. 10 years, per the '
  'attorney file-retention duty (Meeting 2, 2026-08-06).';

-- ----------------------------------------------------------------------------
-- Start the clock when a transfer is first registered.
-- ----------------------------------------------------------------------------
-- Only stamps grants that have no expiry yet. Re-registering a reopened
-- transfer therefore does NOT push the date out — the same principle 052 set
-- out for revocation: reopening must never silently widen access. If a genuine
-- extension is needed it is an explicit staff act, not a side effect of a
-- status flip.
CREATE OR REPLACE FUNCTION public.tag_set_expiry_on_registration()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.status = 'registered' AND COALESCE(OLD.status, '') <> 'registered' THEN
    UPDATE public.transfer_access_grants
       SET expires_at = now() + public.attorney_retention_interval(),
           updated_at = now()
     WHERE transfer_id = NEW.id
       AND revoked_at IS NULL
       AND expires_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tag_set_expiry ON public.property_transfers;
CREATE TRIGGER trg_tag_set_expiry
  AFTER UPDATE OF status ON public.property_transfers
  FOR EACH ROW EXECUTE FUNCTION public.tag_set_expiry_on_registration();

-- ----------------------------------------------------------------------------
-- Teach the access helper about expiry.
-- ----------------------------------------------------------------------------
-- Body is 052's, with one added conjunct on the firm branch. The staff branch is
-- untouched and still short-circuits first.
CREATE OR REPLACE FUNCTION public.can_access_transfer(t_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT app_is_staff()
      OR (app_user_partner_id() IS NOT NULL
          AND EXISTS (SELECT 1 FROM public.transfer_access_grants g
                      WHERE g.transfer_id = t_id
                        AND g.firm_id = app_user_partner_id()
                        AND g.revoked_at IS NULL
                        AND (g.expires_at IS NULL OR g.expires_at > now())));
$$;

COMMENT ON FUNCTION public.can_access_transfer(uuid) IS
  'Staff (always, no expiry), or a firm holding a grant that is neither revoked '
  'nor past expires_at. Expiry added 053: attorney access is bounded to 10 '
  'years from registration while ConveyClear retains indefinitely.';

COMMIT;

-- ============================================================================
-- ⚠️ KNOWN EDGE — re-granting a firm after its access has expired
--
--   transfer_access_grants_one_active is UNIQUE (transfer_id, firm_id)
--   WHERE revoked_at IS NULL. An EXPIRED row is still un-revoked, so it holds
--   that slot and a fresh INSERT for the same firm fails on the unique index.
--   The predicate cannot simply include expires_at > now(): now() is not
--   IMMUTABLE and Postgres will not accept it in an index predicate.
--
--   So re-granting after expiry is deliberately a two-step staff act:
--     UPDATE transfer_access_grants
--        SET revoked_at = now(), revoked_reason = 'retention period ended'
--      WHERE transfer_id = '<id>' AND firm_id = '<firm>' AND revoked_at IS NULL;
--     -- then insert the new grant
--   That is the right friction for handing a closed file back to a firm.
-- ============================================================================

-- ============================================================================
-- VERIFY
--
--   -- nothing expires until a transfer registers
--   SELECT count(*) FROM transfer_access_grants WHERE expires_at IS NOT NULL;
--   → 0 immediately after this migration
--
--   -- the clock starts on registration
--   UPDATE property_transfers SET status = 'registered' WHERE id = '<id>';
--   SELECT firm_id, granted_at, expires_at FROM transfer_access_grants
--    WHERE transfer_id = '<id>';
--   → expires_at ≈ now() + 10 years
--
--   -- and re-registering does not push it out
--   UPDATE property_transfers SET status = 'open'       WHERE id = '<id>';
--   UPDATE property_transfers SET status = 'registered' WHERE id = '<id>';
--   → expires_at UNCHANGED
--
--   -- expiry actually hides it (impersonate the firm's user)
--   UPDATE transfer_access_grants SET expires_at = now() - interval '1 day'
--    WHERE transfer_id = '<id>' AND revoked_at IS NULL;
--   → the transfer, its parties and its documents all leave that firm's view,
--     because all three route through can_access_transfer()
--   -- staff count over the same transfer: UNCHANGED
--
-- ROLLBACK — restores 052's function verbatim; the column and trigger are inert
-- once the function stops reading expires_at.
--   DROP TRIGGER IF EXISTS trg_tag_set_expiry ON public.property_transfers;
--   CREATE OR REPLACE FUNCTION public.can_access_transfer(t_id uuid)
--   RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
--     SELECT app_is_staff()
--         OR (app_user_partner_id() IS NOT NULL
--             AND EXISTS (SELECT 1 FROM public.transfer_access_grants g
--                         WHERE g.transfer_id = t_id
--                           AND g.firm_id = app_user_partner_id()
--                           AND g.revoked_at IS NULL));
--   $$;
-- ============================================================================
