-- ============================================================================
-- 071 — the attorney firm may mark which services it needs
--
-- THE POINT
--   Zewn, 2026-08-28: *"we need to give the arttorneys the ability to mark which
--   services they need. then cc will create matters based on that"*, and
--   immediately after: *"fyi their only options for the dropdown should be
--   'Needs to be done' 'already Done' 'not applicable'"*.
--
--   This migration builds the MARKING half only. Nothing here creates matters —
--   that flow is undesigned (see §4.2 in RESUME_HERE_2026-08-28.md) and is
--   deliberately not committed to a shape by this change.
--
-- ⚠️ THIS REVERSES A DECISION, IT DOES NOT FIX A BUG
--   §122 has the markers set by ConveyClear, not by the firm, and until now all
--   three layers agreed: no partner UPDATE policy here, a blanket staff check in
--   api/transfer-services, and a `canManage` prop the partner page never passed.
--   That is the opposite of the gap 070 closed, where the UI offered something
--   the database refused. Nothing was broken; the decision changed.
--   Authorised by Zewn 2026-08-28 after being shown that §122 came out of a
--   meeting and is Jukka's to reverse.
--
-- ⚠️ WHY A TRIGGER AND NOT JUST A POLICY — READ BEFORE SIMPLIFYING THIS
--   The requirement is "a partner may change `status`, to one of three values,
--   and nothing else". An RLS policy cannot express that:
--
--     * An UPDATE policy's USING clause sees the OLD row and WITH CHECK sees the
--       NEW row. Neither can compare the two, so no policy can say "every column
--       except status must be unchanged".
--     * Column-level GRANTs (GRANT UPDATE (status) …) are per-ROLE, and staff and
--       partners are both `authenticated`. Restricting the column that way would
--       take matter_id, notes and third_party away from staff too.
--
--   And enforcing it only in the API route is not enough: Supabase exposes
--   PostgREST directly to any signed-in user holding the publishable key, so a
--   partner can PATCH this table without going near our route. A check that
--   lives only in application code is a suggestion.
--
--   So the rule lives in a BEFORE UPDATE trigger, which is the one place that
--   sees both OLD and NEW and runs however the row was reached. 063 already set
--   this precedent for its depth guard — "the only way to express it in
--   Postgres".
--
-- WHAT A PARTNER MAY AND MAY NOT DO
--   MAY:  set status to 'needed', 'already_done' or 'not_applicable' on a
--         service line of a transfer they can already reach.
--   MAY NOT:
--     * set 'completed' — 069 created that to mean "WE finished it", and it is
--       the field the firm's delivery is read out of. An attorney setting it
--       would assert that ConveyClear completed work. Excluded on purpose, and
--       Zewn named the three values without it.
--     * set 'not_specified' — that is the absence of a mark, not a choice. A
--       partner cannot un-mark; staff can.
--     * touch matter_id, notes, third_party, position, parent_id, service_code,
--       label, transfer_id or created_by.
--     * INSERT or DELETE a line at all — no policy is granted for either, so the
--       seven lines and any sub-services stay ConveyClear's to shape.
--
--   'already_done' IS included, deliberately. It means somebody outside us
--   already did this — which is information the attorney holds and ConveyClear
--   does not ("the seller's previous firm already got the rates clearance").
--   It is the single most useful thing an attorney can say on this list.
--
-- ATTRIBUTION — an assumption, flagged rather than buried
--   Zewn was asked whether the attorney's mark should be distinguishable from
--   staff's and did not answer before this was built. Built WITH attribution,
--   because who asked for what cannot be recovered afterwards, and because the
--   undesigned second half ("cc will create matters based on that") needs to
--   know which lines the FIRM asked for. Two columns, set by the trigger itself
--   so no caller can spoof them. Costless to ignore if the answer is "don't
--   care"; impossible to backfill if it is not.
-- ============================================================================

BEGIN;

-- ── Attribution ─────────────────────────────────────────────────────────────
ALTER TABLE public.transfer_services
  ADD COLUMN IF NOT EXISTS status_set_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status_set_at timestamptz;

COMMENT ON COLUMN public.transfer_services.status_set_by IS
  'Who last changed `status`, staff or partner (071). Set by the trigger, never '
  'by a caller, so it cannot be spoofed. NULL on rows untouched since 071.';
COMMENT ON COLUMN public.transfer_services.status_set_at IS
  'When `status` last changed (071). NULL on rows untouched since 071.';

-- ── The guard ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.transfer_services_partner_marking_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  -- Stamp attribution whenever the marker actually moves, for staff and partner
  -- alike. Done here rather than in the route so every path agrees.
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.status_set_by := public.app_current_user_id();
    NEW.status_set_at := now();
  ELSE
    -- Not a status change: carry the previous attribution forward untouched, so
    -- an unrelated edit cannot quietly reassign who set the marker.
    NEW.status_set_by := OLD.status_set_by;
    NEW.status_set_at := OLD.status_set_at;
  END IF;

  -- Staff are unrestricted — this whole function is about the partner case.
  IF public.app_is_staff() THEN
    RETURN NEW;
  END IF;

  -- Everything below applies to a non-staff caller who got past the RLS policy,
  -- which means a member of the firm on this transfer.

  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    -- No marker change, so there is nothing a partner is allowed to be doing.
    RAISE EXCEPTION 'Only the service marker can be changed here.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NEW.status NOT IN ('needed', 'already_done', 'not_applicable') THEN
    RAISE EXCEPTION
      'A firm may mark a service needed, already done, or not applicable.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Every other column must be untouched. Written out one by one on purpose: a
  -- to_jsonb() diff would silently start allowing any column added later, which
  -- is exactly the failure this guard exists to prevent. ADD NEW COLUMNS HERE.
  IF NEW.id           IS DISTINCT FROM OLD.id
  OR NEW.transfer_id  IS DISTINCT FROM OLD.transfer_id
  OR NEW.parent_id    IS DISTINCT FROM OLD.parent_id
  OR NEW.service_code IS DISTINCT FROM OLD.service_code
  OR NEW.label        IS DISTINCT FROM OLD.label
  OR NEW.matter_id    IS DISTINCT FROM OLD.matter_id
  OR NEW.third_party  IS DISTINCT FROM OLD.third_party
  OR NEW.position     IS DISTINCT FROM OLD.position
  OR NEW.notes        IS DISTINCT FROM OLD.notes
  OR NEW.created_by   IS DISTINCT FROM OLD.created_by
  OR NEW.created_at   IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'A firm may only change the service marker.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END $$;

COMMENT ON FUNCTION public.transfer_services_partner_marking_guard() IS
  'Enforces what an RLS policy cannot (071): a non-staff caller may change ONLY '
  '`status`, and only to needed / already_done / not_applicable. Also stamps '
  'status_set_by/at for every caller. Runs on every path including PostgREST, '
  'which is the point — the API route alone would be bypassable.';

DROP TRIGGER IF EXISTS trg_transfer_services_partner_marking ON public.transfer_services;
CREATE TRIGGER trg_transfer_services_partner_marking
  BEFORE UPDATE ON public.transfer_services
  FOR EACH ROW EXECUTE FUNCTION public.transfer_services_partner_marking_guard();

-- ── The policy ──────────────────────────────────────────────────────────────
-- Grants the ability to reach the row at all. The trigger above decides what may
-- then be done to it. Both halves are required: this policy alone would let a
-- firm rewrite matter_id.
--
-- can_access_transfer() is the same scope the read policy already uses, so this
-- adds no visibility — only the ability to write a marker on something already
-- readable. Note it covers the whole owning firm, not just firm admins, which is
-- the same widened scope §6.1 has open with Jukka for parties.
DROP POLICY IF EXISTS transfer_services_partner_mark ON public.transfer_services;
CREATE POLICY transfer_services_partner_mark ON public.transfer_services FOR UPDATE TO authenticated
  USING (public.can_access_transfer(transfer_id))
  WITH CHECK (public.can_access_transfer(transfer_id));

COMMENT ON POLICY transfer_services_partner_mark ON public.transfer_services IS
  'Lets the owning firm UPDATE a service line on a transfer it can reach (071). '
  'Deliberately broad here — WHAT may change is enforced by '
  'trg_transfer_services_partner_marking, because a policy cannot compare OLD to '
  'NEW. No INSERT or DELETE is granted: the shape of the checklist stays '
  'ConveyClear''s.';

COMMIT;

-- ============================================================================
-- VERIFY
--   -- 1. Columns, trigger and policy all present:
--   SELECT column_name FROM information_schema.columns
--    WHERE table_schema='public' AND table_name='transfer_services'
--      AND column_name IN ('status_set_by','status_set_at');           -- 2 rows
--
--   SELECT tgname FROM pg_trigger
--    WHERE tgrelid='public.transfer_services'::regclass AND NOT tgisinternal;
--   -- expect trg_transfer_services_guard AND trg_transfer_services_partner_marking
--
--   SELECT polname, CASE polcmd WHEN 'w' THEN 'UPDATE' WHEN 'r' THEN 'SELECT'
--                               WHEN 'a' THEN 'INSERT' ELSE 'ALL' END
--     FROM pg_policy WHERE polrelid='public.transfer_services'::regclass
--    ORDER BY polname;
--   -- transfer_services_partner_mark UPDATE · transfer_services_read SELECT
--   -- · transfer_services_staff_all ALL
--
--   -- 2. Staff are unaffected — as STAFF, all of these must still work:
--   --      UPDATE ... SET status='completed'   -> succeeds (069's value survives)
--   --      UPDATE ... SET matter_id='<id>'     -> succeeds
--   --      UPDATE ... SET notes='x'            -> succeeds
--
--   -- 3. ⚠️ THE CHECKS THAT MATTER, and they CANNOT be done in the SQL Editor:
--   --    the editor runs as the service role, which bypasses RLS *and* whose
--   --    app_is_staff() is false — so it exercises neither path correctly.
--   --    Do these in the browser as a PARTNER (Sarah Hayes):
--   --      a) mark a service "Needs to be done"      -> succeeds
--   --      b) status_set_by is HER user id           -> attribution works
--   --      c) PATCH status='completed' via the API   -> refused
--   --      d) PATCH matter_id directly at PostgREST  -> refused by the trigger
--   --         (this is the one that proves the guard, not the route)
--   --      e) DELETE a service line                  -> refused, no policy
--
-- ROLLBACK
--   DROP POLICY IF EXISTS transfer_services_partner_mark ON public.transfer_services;
--   DROP TRIGGER IF EXISTS trg_transfer_services_partner_marking ON public.transfer_services;
--   DROP FUNCTION IF EXISTS public.transfer_services_partner_marking_guard();
--   -- Leave the two columns: they hold real attribution once anything has been
--   -- marked, and dropping them loses it. They are nullable and unread by any
--   -- pre-071 code, so keeping them costs nothing.
--   ⚠️ Dropping the trigger ALSO stops status_set_by/at being stamped for staff.
--   If the policy is rolled back but marking is wanted later, restore both.
-- ============================================================================
