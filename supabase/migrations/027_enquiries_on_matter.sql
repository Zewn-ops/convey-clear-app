-- 027_enquiries_on_matter.sql
-- ============================================================================
-- A&A demo #3 — enquiries as the SHARED thread on a matter.
-- ============================================================================
-- Two channels, deliberately separate (Jukka, clarified 2026-06-29):
--   * matter_activities = INTERNAL. System events + staff notes. Untouched here.
--   * enquiries         = the SHARED ConveyClear / partner / CLIENT thread on a
--     matter ("Delayed: waiting for council", "COJ not operating — no water").
--
-- Today enquiries are firm-scoped: staff + the owning partner firm. This opens
-- them to the matter's CLIENT as well.
--
-- ⚠ THE SAFETY PROBLEM. Simply granting clients read on `enquiries WHERE
-- can_access_matter(matter_id)` would RETROACTIVELY expose every existing
-- partner→ConveyClear enquiry that happens to carry a matter_id. Those were
-- written when only staff + the partner could read them; a partner may well have
-- said something about the client in one.
--
-- So visibility is explicit, not inferred:
--   * new column `visibility` ∈ ('partner','shared'), DEFAULT 'partner'.
--   * ADD COLUMN ... DEFAULT backfills every existing row to 'partner' → no row
--     that exists today becomes client-readable.
--   * only threads created THROUGH the matter-detail UI are written as 'shared'.
--
-- Additive + idempotent. Apply via the Supabase SQL Editor.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. visibility — who a matter enquiry is shared with.
--    'partner' = staff + owning firm (the legacy behaviour, and the default).
--    'shared'  = staff + owning firm + the matter's client.
-- ----------------------------------------------------------------------------
ALTER TABLE public.enquiries
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'partner';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'enquiries_visibility_check'
  ) THEN
    ALTER TABLE public.enquiries
      ADD CONSTRAINT enquiries_visibility_check CHECK (visibility IN ('partner', 'shared'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_enquiries_matter ON public.enquiries(matter_id);

COMMENT ON COLUMN public.enquiries.visibility IS
  'partner = staff + owning firm (default, and what every pre-027 row is). shared = also readable by the matter''s client. Only the matter-detail thread creates ''shared''.';

-- ----------------------------------------------------------------------------
-- 2. can_access_enquiry — add the shared-matter branch.
--    A shared enquiry on a matter is readable by anyone who can access that
--    matter (staff / owning partner / the client). Partner firm access to its
--    own enquiries is unchanged, whatever the visibility.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_access_enquiry(e_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT app_is_staff()
      OR EXISTS (
        SELECT 1 FROM public.enquiries e
        WHERE e.id = e_id
          AND (
            -- shared matter thread → anyone who can see the matter
            (e.matter_id IS NOT NULL
             AND e.visibility = 'shared'
             AND can_access_matter(e.matter_id))
            -- or the owning partner firm (legacy path, any visibility)
            OR (app_user_partner_id() IS NOT NULL
                AND e.business_partner_id = app_user_partner_id())
          )
      );
$$;

-- ----------------------------------------------------------------------------
-- 3. enquiries — read + insert for the shared matter thread.
--    enquiries_partner_read / _insert (migration 017) stay as they are.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS enquiries_matter_read ON public.enquiries;
CREATE POLICY enquiries_matter_read ON public.enquiries FOR SELECT TO authenticated
  USING (matter_id IS NOT NULL AND visibility = 'shared' AND can_access_matter(matter_id));

-- Anyone on the matter may open a shared thread on it, as themselves. They may
-- NOT open a 'partner'-visibility one (that stays the firm's own channel), and
-- may not forge created_by.
DROP POLICY IF EXISTS enquiries_matter_insert ON public.enquiries;
CREATE POLICY enquiries_matter_insert ON public.enquiries FOR INSERT TO authenticated
  WITH CHECK (
    matter_id IS NOT NULL
    AND visibility = 'shared'
    AND can_access_matter(matter_id)
    AND created_by = app_current_user_id()
  );

-- enquiry_messages needs no new policy: its read/post policies already delegate
-- to can_access_enquiry(), which now covers the client.

COMMIT;

-- ============================================================================
-- Verification
-- ============================================================================
SELECT column_name, column_default, is_nullable FROM information_schema.columns
  WHERE table_name = 'enquiries' AND column_name = 'visibility';
-- Every pre-existing row must be 'partner' — nothing retroactively client-visible:
SELECT visibility, count(*) FROM public.enquiries GROUP BY visibility;
SELECT policyname FROM pg_policies WHERE tablename = 'enquiries' ORDER BY policyname;
