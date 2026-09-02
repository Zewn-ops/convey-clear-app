-- ============================================================================
-- 085 — let the SERVER attach a matter to its service line
-- ============================================================================
--
-- 🔴 THE BUG THIS FIXES, found by clicking on 2026-09-02.
--
-- Creating a matter inside a property transfer is supposed to attach it to the
-- matching line on that transfer's service checklist, so the umbrella tracks it
-- without anyone linking the two by hand (063, reworked in `d309dba`). It has
-- never once worked on production. Across the whole table only five lines carry
-- a matter_id, and every one of those was linked by hand through the
-- "Track an existing matter" control.
--
-- 071's guard is why. It runs BEFORE UPDATE on every path "including PostgREST,
-- which is the point", and its first question is `app_is_staff()`. The API route
-- writes the link with the SERVICE ROLE client, deliberately — it is a system
-- linkage, not a firm edit, the same reasoning that fixed the 409 on 2026-09-01.
-- But the service role has no `auth.uid()`, so `app_is_staff()` is false, the
-- caller is treated as a firm, and an update touching only `matter_id` lands on:
--
--     RAISE EXCEPTION 'Only the service marker can be changed here.'
--
-- The route did not read the error (see the companion change in
-- `api/admin/matters/route.ts`), so matter creation reported success while the
-- checklist stayed empty. Silent refusal, exactly the shape of the 2026-09-01
-- 409 — a policy written for one kind of caller applied to another.
--
-- Reproduced directly against production:
--   PATCH /rest/v1/transfer_services?id=eq.<line> {"matter_id": "<matter>"}
--   → 42501 "Only the service marker can be changed here."
--
-- ── The fix, and why it does not widen anything ─────────────────────────────
--
-- The service role is exempted. That grants nothing new: a caller holding the
-- service key already bypasses RLS entirely and can write any row in the
-- database, so refusing it here never protected anything — it only broke the
-- server's own bookkeeping. The guard exists to constrain a FIRM reaching the
-- row through PostgREST with its own JWT, and that case is untouched below.
--
-- `auth.role()` reads the JWT role claim, so it is 'service_role' only for the
-- secret key. A migration session has no JWT at all and still gets NULL, which
-- is left deliberately blocked: 072 already showed that a migration touching
-- these rows must disable the trigger explicitly rather than be quietly waved
-- through.
--
-- Additive and safe to apply at any time. It only ever ADDS a path that returns
-- NEW; every existing refusal still refuses.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.transfer_services_partner_marking_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
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
  --
  -- 085: so is the SERVER. The service role holds the secret key, bypasses RLS
  -- on every other table, and is how the API route writes system linkages such
  -- as transfer_services.matter_id. It has no auth.uid(), so without this it
  -- was being judged as if it were a firm.
  IF public.app_is_staff() OR auth.role() = 'service_role' THEN
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
END $fn$;

COMMENT ON FUNCTION public.transfer_services_partner_marking_guard() IS
  'Enforces what an RLS policy cannot (071): a non-staff caller may change ONLY '
  '`status`, and only to needed / already_done / not_applicable. Also stamps '
  'status_set_by/at for every caller. Runs on every path including PostgREST, '
  'which is the point — the API route alone would be bypassable. 085 exempts the '
  'service role, which already bypasses RLS everywhere else and is how the '
  'server writes its own linkages; without that, matter-to-line adoption was '
  'refused silently on every matter created inside a transfer.';

-- ── Verify ──────────────────────────────────────────────────────────────────
-- The staff and partner branches must still be present, and the service-role
-- exemption must actually be in the compiled body.
DO $verify$
DECLARE src text;
BEGIN
  SELECT prosrc INTO src
    FROM pg_proc
   WHERE proname = 'transfer_services_partner_marking_guard';

  IF src NOT LIKE '%service_role%' THEN
    RAISE EXCEPTION '085 did not take: service_role exemption missing.';
  END IF;
  IF src NOT LIKE '%Only the service marker can be changed here.%' THEN
    RAISE EXCEPTION '085 broke the partner guard: marker refusal missing.';
  END IF;
  IF src NOT LIKE '%A firm may only change the service marker.%' THEN
    RAISE EXCEPTION '085 broke the partner guard: column refusal missing.';
  END IF;
END $verify$;

COMMIT;

-- ── Backfill ────────────────────────────────────────────────────────────────
-- Deliberately NOT included. Existing matters were created without ever
-- adopting a line, and picking which of several same-service matters a line
-- "should" have tracked is a guess about real work. Staff link those by hand
-- with "Track an existing matter", which is the control that has been doing
-- this job all along.
