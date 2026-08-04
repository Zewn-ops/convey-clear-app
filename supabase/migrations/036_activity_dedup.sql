-- ============================================================================
-- 036 — Duplicate activity-feed posts: the server-side half of the fix
--
-- THE BUG (confirmed in production data, and it PREDATES this week's work —
-- a duplicated phase_transition from 23 June proves it):
--
--   post              'Leanne to send peter Cer ID tomorrow'   x2, 1.10s apart
--   document_upload   'Reused transfer document: A4 - 2.pdf'   x2, 0.70s apart
--   phase_transition  'Phase: Onboarding'                      x2, 2.12s apart
--   document_status   'Document marked not available: …'       x7
--
-- TWO DISTINCT CAUSES, and each needs its own fix:
--
--   1. DOUBLE-CLICK RACE. A server action takes 1–2s. The controls had no
--      pending state, so the button looked dead and got clicked again. Both
--      requests then race, and a check-then-insert dedupe LOSES that race:
--      both read "nothing there yet" before either writes. The app-side guard
--      is now components/ui/SubmitButton (disabled while in flight) — but a
--      disabled button only stops the honest double-click. It cannot stop two
--      tabs, a flaky network retry, or the n8n flows, which do not go through
--      the UI at all. PART A is the backstop.
--
--   2. TWO CONTROLS, ONE DOCUMENT — not a race, and no pending state could ever
--      have caught it. The intake renders "From transfer" TWICE for the same
--      transfer document: once in the "From this property transfer" panel
--      (matter-level, matter_party_id NULL) and again on a matching slot row
--      (party-scoped). Two separate component instances, two separate busy
--      flags. The attach route's dedupe keys on (matter, transfer doc, PARTY),
--      so the second attach reads as a different slot and inserts a SECOND row
--      for the SAME file — which is also why it survived migration 030's slot
--      index: that index exempts document_type 'other', and 'A4 - 2.pdf' was
--      uploaded as 'other'. PART B is the fix.
--
-- WHY PART A IS A FUNCTION AND NOT A UNIQUE INDEX
--   "The same body twice" is only wrong when it happens within a few seconds; a
--   month later it is a legitimate repeat note. The rule is inherently
--   time-boxed, and a time-boxed rule cannot be a unique index: date_trunc over
--   timestamptz is STABLE, not IMMUTABLE, so it is not indexable. Hence an
--   advisory lock around a windowed check — the lock is what the old app-side
--   check was missing, and it is what makes the check win the race instead of
--   losing it.
--
-- Additive, idempotent, single transaction. Applied manually (Supabase SQL
-- editor) like every migration in this folder.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- PART A1 — matter_activities: append, unless an identical row landed moments ago.
--
-- SECURITY INVOKER on purpose. Every existing caller either writes with the
-- user-scoped client (the staff matter page, where RLS is the authorisation) or
-- with the service role (the API routes, which authorise for themselves and then
-- bypass RLS). A SECURITY DEFINER function would silently upgrade the first group
-- to service-role writes and quietly delete that authorisation check. The
-- function must not change WHO may write — only how many rows they get.
--
-- ⚠️ One consequence worth stating: the de-dup SELECT also runs as the caller, so
-- a caller who may INSERT a row but not SELECT it back would never see its own
-- duplicate. No such caller exists today (staff read every activity on a matter
-- they can access; everything else uses the service role). If a client-facing
-- write is ever added, re-check that assumption or the guard silently no-ops.
-- ----------------------------------------------------------------------------
-- Returns (activity_id, deduped) rather than a bare id: the caller needs to know
-- whether it actually wrote, because most of these actions ALSO fan out a
-- notification. A swallowed duplicate row that still sends a second push is only
-- half the bug fixed.
--
-- DROP first, then CREATE: CREATE OR REPLACE cannot change a function's return
-- type, so a re-run after any future change to that shape would fail on an
-- existing function. Dropping keeps this file re-runnable, like the rest of the
-- folder. (Nothing else depends on these functions — the app calls them by name.)
DROP FUNCTION IF EXISTS public.log_matter_activity(uuid, text, text, uuid, text, integer);
DROP FUNCTION IF EXISTS public.log_transfer_activity(uuid, text, text, uuid, text, integer);

CREATE OR REPLACE FUNCTION public.log_matter_activity(
  p_matter_id      uuid,
  p_activity_type  text,
  p_body           text,
  p_author_id      uuid    DEFAULT NULL,
  p_author_label   text    DEFAULT NULL,
  p_window_seconds integer DEFAULT 5
) RETURNS TABLE (activity_id uuid, deduped boolean)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_window_seconds > 0 THEN
    -- Serialise concurrent writers of the SAME (matter, type, body) and NOTHING
    -- else — two different notes a second apart never wait on each other. The
    -- lock is transaction-scoped, so it is released on COMMIT/ROLLBACK with no
    -- unlock path to forget. This is the whole fix: the loser of the race now
    -- blocks here until the winner commits, and its SELECT below (a fresh
    -- READ COMMITTED snapshot per statement) then SEES the winner's row.
    PERFORM pg_advisory_xact_lock(
      hashtextextended(
        p_matter_id::text || '|' || p_activity_type || '|' || coalesce(p_body, ''),
        0::bigint          -- hashtextextended(text, bigint); be explicit, don't lean on the cast
      )
    );

    SELECT a.id
      INTO v_id
      FROM public.matter_activities a
     WHERE a.matter_id     = p_matter_id
       AND a.activity_type = p_activity_type
       AND a.body IS NOT DISTINCT FROM p_body
       AND a.created_at    > now() - make_interval(secs => p_window_seconds)
     ORDER BY a.created_at DESC
     LIMIT 1;

    -- Same matter, same type, same words, seconds apart: one intent, one row.
    IF v_id IS NOT NULL THEN
      activity_id := v_id;
      deduped     := true;
      RETURN NEXT;
      RETURN;
    END IF;
  END IF;

  INSERT INTO public.matter_activities (matter_id, author_id, author_label, activity_type, body)
  VALUES (p_matter_id, p_author_id, p_author_label, p_activity_type, p_body)
  RETURNING id INTO v_id;

  activity_id := v_id;
  deduped     := false;
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.log_matter_activity IS
  'Append to a matter''s feed, ignoring an identical (type, body) entry written '
  'within p_window_seconds. Takes a transaction-scoped advisory lock on the key '
  'FIRST, so two racing double-click requests serialise instead of both reading '
  '"nothing there yet" and both inserting. Returns (activity_id, deduped) — the '
  'EXISTING id when deduped, so the caller can also skip its duplicate '
  'notification. The ONLY write path the app should use (lib/activity.ts).';

-- ----------------------------------------------------------------------------
-- PART A2 — the same guard for the transfer feed (migration 035's table).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_transfer_activity(
  p_transfer_id    uuid,
  p_activity_type  text,
  p_body           text,
  p_author_id      uuid    DEFAULT NULL,
  p_author_label   text    DEFAULT NULL,
  p_window_seconds integer DEFAULT 5
) RETURNS TABLE (activity_id uuid, deduped boolean)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_window_seconds > 0 THEN
    PERFORM pg_advisory_xact_lock(
      hashtextextended(
        p_transfer_id::text || '|' || p_activity_type || '|' || coalesce(p_body, ''),
        0::bigint
      )
    );

    SELECT a.id
      INTO v_id
      FROM public.transfer_activities a
     WHERE a.transfer_id   = p_transfer_id
       AND a.activity_type = p_activity_type
       AND a.body IS NOT DISTINCT FROM p_body
       AND a.created_at    > now() - make_interval(secs => p_window_seconds)
     ORDER BY a.created_at DESC
     LIMIT 1;

    IF v_id IS NOT NULL THEN
      activity_id := v_id;
      deduped     := true;
      RETURN NEXT;
      RETURN;
    END IF;
  END IF;

  INSERT INTO public.transfer_activities (transfer_id, author_id, author_label, activity_type, body)
  VALUES (p_transfer_id, p_author_id, p_author_label, p_activity_type, p_body)
  RETURNING id INTO v_id;

  activity_id := v_id;
  deduped     := false;
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.log_transfer_activity IS
  'Transfer-feed twin of log_matter_activity. Same advisory-lock guard, same '
  'RLS semantics (SECURITY INVOKER — can_access_transfer still decides who may post).';

-- Same audiences that hold INSERT on the tables today. No new privilege: the
-- function runs as its caller, so RLS still decides.
GRANT EXECUTE ON FUNCTION public.log_matter_activity(uuid, text, text, uuid, text, integer)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.log_transfer_activity(uuid, text, text, uuid, text, integer)
  TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- PART B1 — REPAIR: collapse the document rows the second bug already created.
--
-- A reused document is a POINTER to one storage object, so a duplicate row is
-- two pointers to the same file. Demote the older one to 'superseded' — the
-- app's own word for "replaced, kept for audit" (migration 030), which drops it
-- out of every document list and out of the index below. Nothing is deleted, and
-- the storage object is untouched.
--
-- This MUST run before the indexes, or CREATE UNIQUE INDEX aborts on the
-- known 'A4 - 2.pdf' pair.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  fixed int;
BEGIN
  WITH dupes AS (
    SELECT id,
           row_number() OVER (
             PARTITION BY matter_id, transfer_document_id
             ORDER BY created_at DESC, id DESC
           ) AS rn
      FROM public.documents
     WHERE transfer_document_id IS NOT NULL
       AND document_status <> 'superseded'
  )
  UPDATE public.documents d
     SET document_status = 'superseded',
         updated_at      = now()
    FROM dupes
   WHERE d.id = dupes.id
     AND dupes.rn > 1;
  GET DIAGNOSTICS fixed = ROW_COUNT;
  RAISE NOTICE '036: superseded % duplicate transfer-document row(s)', fixed;

  WITH dupes AS (
    SELECT id,
           row_number() OVER (
             PARTITION BY matter_id, client_document_id
             ORDER BY created_at DESC, id DESC
           ) AS rn
      FROM public.documents
     WHERE client_document_id IS NOT NULL
       AND document_status <> 'superseded'
  )
  UPDATE public.documents d
     SET document_status = 'superseded',
         updated_at      = now()
    FROM dupes
   WHERE d.id = dupes.id
     AND dupes.rn > 1;
  GET DIAGNOSTICS fixed = ROW_COUNT;
  RAISE NOTICE '036: superseded % duplicate vault-document row(s)', fixed;
END $$;

-- ----------------------------------------------------------------------------
-- PART B2 — one row per reused source document, per matter.
--
-- Deliberately NOT keyed on the party. A transfer document is PROPERTY-level (a
-- deed search is never a person's document) and a vault document is PERSON-level
-- (a certified ID belongs to one client) — in neither case does the same source
-- file legitimately land on one matter twice. Keying on the party is exactly what
-- let the two "From transfer" buttons each insert a row.
--
-- 'superseded' rows are excluded so that replacing a document and re-attaching
-- the original later still works.
--
-- The predicate matches the app's filter (.neq document_status 'superseded')
-- exactly, including its NULL semantics: a row with a NULL document_status sits
-- outside BOTH. Nothing writes one today (the column has DEFAULT 'provided' and
-- every insert path sets it), so this is a note, not a hole — but if a NULL ever
-- appears, it is invisible to this index.
-- ----------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS documents_one_row_per_transfer_doc
  ON public.documents (matter_id, transfer_document_id)
  WHERE transfer_document_id IS NOT NULL
    AND document_status <> 'superseded';

CREATE UNIQUE INDEX IF NOT EXISTS documents_one_row_per_client_doc
  ON public.documents (matter_id, client_document_id)
  WHERE client_document_id IS NOT NULL
    AND document_status <> 'superseded';

COMMENT ON INDEX public.documents_one_row_per_transfer_doc IS
  'A transfer document reuses onto a matter at most once. Backstop for the '
  'attach route''s dedupe check, which cannot be atomic on its own.';

COMMIT;

-- ----------------------------------------------------------------------------
-- Verification (run after COMMIT)
-- ----------------------------------------------------------------------------
-- 0. ⚠️ PostgREST caches the schema. A brand-new function is invisible over the
--    REST API until that cache reloads — Supabase normally does it for you within
--    seconds, but if the app logs
--      "[activity] … log RPC not found — migration 036 is not applied"
--    while the function DOES exist in the SQL editor, the cache is simply stale:
--      NOTIFY pgrst, 'reload schema';
--    (The app falls back to a plain un-deduplicated insert meanwhile, so nothing
--    breaks and no feed entry is lost — the duplicates just aren't caught yet.)
--
-- 1. Both functions exist:
--      SELECT proname FROM pg_proc
--       WHERE proname IN ('log_matter_activity', 'log_transfer_activity');
--
-- 2. The guard actually de-duplicates — two identical calls, ONE row.
--    The first returns deduped = false, the second the SAME id with
--    deduped = true, and the feed gains a single entry:
--      SELECT * FROM public.log_matter_activity(
--               '<some-matter-uuid>'::uuid, 'system', '036 dedupe probe');
--      SELECT * FROM public.log_matter_activity(
--               '<some-matter-uuid>'::uuid, 'system', '036 dedupe probe');
--      SELECT count(*) FROM matter_activities WHERE body = '036 dedupe probe';  -- 1
--    Then clean up:
--      DELETE FROM matter_activities WHERE body = '036 dedupe probe';
--
-- 3. No matter holds the same reused document twice (must return 0 rows):
--      SELECT matter_id, transfer_document_id, count(*)
--        FROM documents
--       WHERE transfer_document_id IS NOT NULL AND document_status <> 'superseded'
--       GROUP BY 1, 2 HAVING count(*) > 1;
--
-- 4. The duplicate rows ALREADY in the feed are NOT removed by this migration —
--    the guard only stops new ones. They are history, and the feed is append-only.
--    To tidy the demo data before Jukka sees it, see cleanup_dupe_activities.sql.
