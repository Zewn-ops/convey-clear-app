-- ============================================================================
-- 035 — Property Transfers: activity feed + enquiry thread
--       (and a bug fix: two activity types the app already writes were illegal)
--
-- PART A — 🐛 THE BUG FIRST.
--   matter_activities.activity_type carries a CHECK from migration 004:
--     ('post','status_change','document_upload','phase_transition',
--      'email_bridge','system','poa_signed')
--   The app has since started writing TWO types that are not in it:
--     • 'document_status' — the partner "not available" toggle (commit a11f922)
--     • 'fica_capture'    — in-place FICA capture (migration 033)
--   Both inserts are fire-and-forget (`await insert(...)` with no error check), so
--   Postgres rejected them with a 23514 and NOBODY NOTICED. The features work; the
--   audit-feed entries they claim to write were being silently discarded.
--   Widening the CHECK is the fix. (The app-side inserts now log their errors too,
--   so the next one of these surfaces instead of vanishing.)
--
--   Note what is NOT changed: migration 018's client-visibility policy lists the
--   types a CLIENT may read. Neither new type is added to it, so both stay staff-
--   internal — which is right: 'fica_capture' is bookkeeping, not client news.
--
-- PART B — the transfer becomes a workspace, not just a grouping.
--   A property transaction has its own history and its own conversation, distinct
--   from any one matter inside it ("the bank's guarantee is late", "seller signed
--   the mandate"). Today that has to be shoehorned into whichever matter happens
--   to be open.
--
--   transfer_activities — mirrors matter_activities, scoped by can_access_transfer,
--   and BOTH staff and the owning firm may post to it.
--
-- WHY THERE IS NO `enquiries.transfer_id`
--   The obvious move is to hang the enquiry machinery off transfers too. It was
--   drafted and then cut: a feed that both sides can post to already IS the
--   transfer conversation. Adding enquiries beside it would mean two messaging
--   surfaces for one need, each with its own status, assignment and notification
--   rules to keep in step. Per-matter questions keep the enquiry thread (027);
--   the transaction gets one feed. If transfer questions later need triage
--   (assignee, resolved/closed), revisit — but do not carry the machinery
--   speculatively.
--
-- 🔒 CLIENTS SEE NOTHING AT TRANSFER LEVEL, AND THAT FALLS OUT FOR FREE.
--   can_access_transfer() is staff + the owning attorney firm — never a client, by
--   design (026: a transfer spans BOTH sides of the deal, so showing it to one
--   party leaks the counterparty). Gating the feed on that same function means the
--   transfer conversation is structurally unreachable by a client; there is no
--   visibility flag to get wrong.
--
-- Additive, idempotent, single transaction. Applied manually in the SQL editor.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- A. Legalise the two activity types the app already writes.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  con_name text;
BEGIN
  SELECT c.conname INTO con_name
  FROM pg_constraint c
  WHERE c.conrelid = 'public.matter_activities'::regclass
    AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) ILIKE '%activity_type%';

  IF con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.matter_activities DROP CONSTRAINT %I', con_name);
  END IF;
END $$;

ALTER TABLE public.matter_activities
  ADD CONSTRAINT matter_activities_activity_type_check
  CHECK (activity_type IN (
    'post', 'status_change', 'document_upload',
    'phase_transition', 'email_bridge', 'system', 'poa_signed',
    'document_status',   -- NEW: a doc marked / unmarked "not available"
    'fica_capture',      -- NEW: client details or consent recorded in place
    'transfer_link'      -- NEW: matter linked to / unlinked from a transfer
  ));

-- ----------------------------------------------------------------------------
-- B1. The transfer's own history.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.transfer_activities (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id   uuid NOT NULL REFERENCES public.property_transfers(id) ON DELETE CASCADE,
  author_id     uuid REFERENCES public.users(id) ON DELETE SET NULL,
  author_label  text,
  activity_type text NOT NULL DEFAULT 'post'
                  CHECK (activity_type IN (
                    'post', 'system', 'matter_linked', 'matter_unlinked',
                    'document_upload', 'status_change'
                  )),
  body          text,
  metadata      jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transfer_activities_transfer
  ON public.transfer_activities(transfer_id, created_at DESC);

ALTER TABLE public.transfer_activities ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON public.transfer_activities TO authenticated;

DROP POLICY IF EXISTS transfer_activities_read ON public.transfer_activities;
CREATE POLICY transfer_activities_read ON public.transfer_activities FOR SELECT TO authenticated
  USING (public.can_access_transfer(transfer_id));

-- The owning firm may post to the transfer thread; that is the point of it.
DROP POLICY IF EXISTS transfer_activities_post ON public.transfer_activities;
CREATE POLICY transfer_activities_post ON public.transfer_activities FOR INSERT TO authenticated
  WITH CHECK (public.can_access_transfer(transfer_id));

COMMENT ON TABLE public.transfer_activities IS
  'The property transaction''s own history and conversation. Staff and the owning '
  'attorney firm both read and post; clients cannot reach it at all, because '
  'can_access_transfer excludes them (a transfer spans both sides of the deal). '
  'Deliberately the ONLY messaging surface at transfer level — see the header note '
  'on why enquiries were not extended here.';

COMMIT;

-- ============================================================================
-- Verification
-- ============================================================================
-- The two illegal activity types are now legal (expect no error):
--   INSERT INTO matter_activities (matter_id, activity_type, body)
--   SELECT id, 'fica_capture', 'migration 035 smoke test' FROM matters LIMIT 1;
--   DELETE FROM matter_activities WHERE body = 'migration 035 smoke test';
--
-- New table + policies:
--   SELECT to_regclass('public.transfer_activities');
--   SELECT policyname FROM pg_policies WHERE tablename='transfer_activities';  -- 2
