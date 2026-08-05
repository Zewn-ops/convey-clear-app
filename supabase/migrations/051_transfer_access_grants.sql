-- ============================================================================
-- 051 — transfer_access_grants: attorney access as a fact, not an inference
-- ============================================================================
-- Section 1, P3. INERT: the table is created and backfilled to mirror today's
-- access exactly. 052 makes can_access_transfer() read it.
--
-- WHY
--   A firm currently reaches a transfer because property_transfers.business_
--   partner_id happens to equal theirs. That is a pointer, not a record: it
--   cannot say when access began, who granted it, when it ended or why, and
--   moving the column silently rewrites history.
--
--   The spec wants an attorney scoped to ONE transfer and revoked when it
--   closes. Inferring revocation from status = 'registered' breaks the moment a
--   transfer is reopened — the attorney would silently regain access to a
--   matter that was closed. A revoked_at row does not.
--
--   It also allows what the single column cannot: two firms on one transfer
--   over time (a firm is replaced), or a second firm brought in deliberately.
--
-- business_partner_id IS KEPT and still written. It stays the "current primary
-- firm" pointer that the UI reads, and keeping it makes 051 + 052 revertible.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.transfer_access_grants (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id uuid NOT NULL REFERENCES public.property_transfers(id) ON DELETE CASCADE,
  firm_id     uuid NOT NULL REFERENCES public.firms(id)              ON DELETE CASCADE,

  granted_at  timestamptz NOT NULL DEFAULT now(),
  granted_by  uuid REFERENCES public.users(id) ON DELETE SET NULL,

  -- Revocation is a row edit, never a delete: the point of this table is that
  -- "who could see this, and when" survives the access ending.
  revoked_at     timestamptz,
  revoked_by     uuid REFERENCES public.users(id) ON DELETE SET NULL,
  revoked_reason text,

  note       text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT transfer_access_grants_revocation_coherent CHECK (
    (revoked_at IS NULL  AND revoked_by IS NULL AND revoked_reason IS NULL)
 OR (revoked_at IS NOT NULL)
  )
);

COMMENT ON TABLE public.transfer_access_grants IS
  'Which FIRM may work which property transfer, as an audit fact. Revocation '
  'sets revoked_at rather than deleting, so "who could see this, and when" '
  'survives the access ending. Replaces inferring access from '
  'property_transfers.business_partner_id as of 052.';

-- One LIVE grant per firm per transfer. Revoked rows are unconstrained, so a
-- firm can be granted, revoked and granted again and every step is kept.
CREATE UNIQUE INDEX IF NOT EXISTS transfer_access_grants_one_active
  ON public.transfer_access_grants (transfer_id, firm_id) WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_tag_transfer ON public.transfer_access_grants (transfer_id);
CREATE INDEX IF NOT EXISTS idx_tag_firm_active
  ON public.transfer_access_grants (firm_id) WHERE revoked_at IS NULL;

DROP TRIGGER IF EXISTS trg_tag_updated_at ON public.transfer_access_grants;
CREATE TRIGGER trg_tag_updated_at
  BEFORE UPDATE ON public.transfer_access_grants
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Backfill: one live grant per transfer that already names a firm.
--
-- granted_at is the TRANSFER's created_at, not now(). The grant is a record of
-- access that already existed; stamping it with the migration time would assert
-- that every firm gained access on the day this ran, which is false and would
-- be the first thing an audit disbelieved.
-- ---------------------------------------------------------------------------
INSERT INTO public.transfer_access_grants (transfer_id, firm_id, granted_at, note)
SELECT t.id, t.business_partner_id, t.created_at,
       'Backfilled from property_transfers.business_partner_id (051).'
  FROM public.property_transfers t
 WHERE t.business_partner_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- RLS. Staff manage grants. A firm may READ its own — so an attorney can see
-- that their access was revoked and when, rather than the transfer simply
-- vanishing — but may not grant itself anything.
-- ---------------------------------------------------------------------------
ALTER TABLE public.transfer_access_grants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tag_staff_all ON public.transfer_access_grants;
CREATE POLICY tag_staff_all ON public.transfer_access_grants FOR ALL TO authenticated
  USING (app_is_staff()) WITH CHECK (app_is_staff());

DROP POLICY IF EXISTS tag_firm_read_own ON public.transfer_access_grants;
CREATE POLICY tag_firm_read_own ON public.transfer_access_grants FOR SELECT TO authenticated
  USING (app_user_partner_id() IS NOT NULL AND firm_id = app_user_partner_id());

COMMIT;

-- ============================================================================
-- VERIFY (run after COMMIT) — the backfill must mirror today's access EXACTLY,
-- because 052 swaps the helper over to reading it.
--
--   -- counts match
--   SELECT (SELECT count(*) FROM property_transfers WHERE business_partner_id IS NOT NULL) AS pointers,
--          (SELECT count(*) FROM transfer_access_grants WHERE revoked_at IS NULL)          AS live_grants;
--
--   -- and row for row, in both directions
--   SELECT count(*) FROM property_transfers t
--    WHERE t.business_partner_id IS NOT NULL
--      AND NOT EXISTS (SELECT 1 FROM transfer_access_grants g
--                      WHERE g.transfer_id=t.id AND g.firm_id=t.business_partner_id
--                        AND g.revoked_at IS NULL);
--   -- expect 0
--
--   SELECT count(*) FROM transfer_access_grants g
--    WHERE g.revoked_at IS NULL
--      AND NOT EXISTS (SELECT 1 FROM property_transfers t
--                      WHERE t.id=g.transfer_id AND t.business_partner_id=g.firm_id);
--   -- expect 0. A grant with no matching pointer would WIDEN access at 052.
--
-- ROLLBACK
--   DROP TABLE IF EXISTS public.transfer_access_grants;
-- ============================================================================
