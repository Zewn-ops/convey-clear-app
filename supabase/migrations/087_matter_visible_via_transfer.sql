-- ============================================================================
-- 087 — a matter on the firm's own transfer is the firm's matter
--
-- 🔴 THE BUG, FOUND IN FRONT OF THE CLIENT. Jukka, in the 2026-09-02 meeting,
-- after a COT RCF matter was created inside his own transfer: "matters … there
-- it is. Coot RCF. Maybe just reload." It never appeared. Zewn: "that also needs
-- to be fixed. If we create a matter in a property transfer, it needs to go to
-- the attorney's matters list."
--
-- WHY IT WAS INVISIBLE. `can_access_matter()` (006, extended by 014 and 049)
-- knows three ways a firm reaches a matter:
--
--   1. matters.business_partner_id = their firm
--   2. the matter's CLIENT carries clients.business_partner_id = their firm
--   3. they are a matter_subscriber
--
-- A matter created inside a transfer satisfies none of them. `api/admin/matters`
-- has never written `business_partner_id` (fixed in the same commit as this, so
-- the DATA is right and not only the policy), and a client created on that same
-- screen is born with no firm either — deliberately, because ConveyClear owns
-- the client database and a firm does not claim a client by typing a name.
--
-- Meanwhile the FIRM PLAINLY HAS ACCESS TO THE TRANSFER, through a live grant in
-- transfer_access_grants (052/053). Every other object hanging off a transfer —
-- its parties, its documents, its service lines, its activity — routes through
-- can_access_transfer() and is visible. Matters were the one child that did not,
-- so the portal showed an attorney a transaction, showed them the service line
-- saying a matter exists, and then had nowhere to send them.
--
-- THE FOURTH BRANCH: a matter whose transfer this caller can access. Not a new
-- kind of permission — it is the same grant that already governs the transfer,
-- applied to the work underneath it. "One transfer = one firm" is enforced on
-- creation (see api/admin/matters), so this cannot reach across firms.
--
-- ⚠️ IT WIDENS MORE THAN THE MATTERS LIST. Ten-plus policies route through this
-- helper — documents, matter_parties, matter_activities, enquiries, storage
-- objects. That is the intent rather than a side effect: an attorney who can see
-- the matter must be able to see its documents, or the page they finally reach
-- is empty. Two things it does NOT touch:
--   · matter_activities keeps 018's internal/shared split, which is a separate
--     column test and still applies on top of this.
--   · CLIENTS do not gain anything. Their branch of the helper is untouched, and
--     a client has no transfer grant to inherit from.
--
-- ADDITIVE AND SAFE TO APPLY ANY TIME. Staff are unaffected — app_is_staff()
-- short-circuits first, as it did before. Applying it ahead of its code simply
-- makes matters appear where the attorney already expected them.
-- ============================================================================

BEGIN;

-- 049's body, with one added branch. Branch order matters for cost, not for
-- correctness: the cheap client/partner-column tests stay first and the grant
-- lookup only runs when they have all missed.
CREATE OR REPLACE FUNCTION public.can_access_matter(m_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT app_is_staff()
      OR EXISTS (
           SELECT 1 FROM public.matters m WHERE m.id = m_id AND (
               m.client_id IN (SELECT app_user_client_ids())
            OR (app_user_partner_id() IS NOT NULL
                AND m.business_partner_id = app_user_partner_id())
            OR (app_user_partner_id() IS NOT NULL
                AND m.client_id IN (SELECT id FROM public.clients
                                    WHERE business_partner_id = app_user_partner_id()))
            -- 087 — the matter belongs to a transfer this caller may open.
            OR (app_user_partner_id() IS NOT NULL
                AND m.transfer_id IS NOT NULL
                AND public.can_access_transfer(m.transfer_id))
           ))
      OR EXISTS (SELECT 1 FROM public.matter_subscribers s
                 WHERE s.matter_id = m_id AND s.user_id = app_current_user_id());
$$;

COMMENT ON FUNCTION public.can_access_matter(uuid) IS
  'Staff; the matter''s own client (any entity they act for, 049); the firm on '
  'matters.business_partner_id; the firm on the client; the firm holding a live '
  'grant on the matter''s TRANSFER (087); or a matter subscriber.';

COMMIT;

-- ============================================================================
-- VERIFY — by impersonation, not by reading the policy text.
--
--   SELECT auth_user_id AS uid FROM users
--    WHERE email='dryrun.partner@sterlinghayes.co.za' \gset
--   BEGIN;
--     SET LOCAL role authenticated;
--     SELECT set_config('request.jwt.claims',
--       '{"sub":"' || :'uid' || '","role":"authenticated"}', true);
--     SELECT count(*) FROM matters;            -- must RISE by the matters that
--                                              -- sit on this firm's transfers
--     SELECT id, title FROM matters WHERE transfer_id IS NOT NULL;
--   COMMIT;
--
-- The two that must NOT move:
--   · a client session's matter count (no transfer grants exist for clients)
--   · a SECOND firm's count — pick a matter on firm A's transfer and confirm
--     firm B still cannot select it.
--
-- ROLLBACK — restores 049 verbatim: drop the 087 branch from the body above.
-- ============================================================================
