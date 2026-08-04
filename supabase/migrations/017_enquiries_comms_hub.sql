-- ============================================================================
-- ConveyClear — Migration 017: Matter enquiries / internal comms hub
-- ============================================================================
-- Created: 2026-06-15. Target: Supabase yhgriqagrhyblhmloctc.
--
-- WHY (Jukka demo): a business partner needs a "new matter enquiry" button; when
-- they send one, ALL ConveyClear staff should see it in a central inbox and be
-- able to claim/assign + reply. This adds:
--   • enquiries        — one per enquiry (subject + opening message + status + assignee)
--   • enquiry_messages — the reply thread
-- RLS: staff full; a partner sees/creates only their own firm's enquiries and
-- can post replies on them. service_role (API routes) bypasses RLS.
-- Idempotent + additive.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.enquiries (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_partner_id UUID REFERENCES public.business_partners(id) ON DELETE SET NULL,
  matter_id           UUID REFERENCES public.matters(id) ON DELETE SET NULL,
  created_by          UUID REFERENCES public.users(id) ON DELETE SET NULL,
  subject             TEXT NOT NULL,
  message             TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','assigned','resolved','closed')),
  assigned_to         UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at          TIMESTAMPTZ DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_enquiries_status   ON public.enquiries(status);
CREATE INDEX IF NOT EXISTS idx_enquiries_partner  ON public.enquiries(business_partner_id);
CREATE INDEX IF NOT EXISTS idx_enquiries_assigned ON public.enquiries(assigned_to);
CREATE INDEX IF NOT EXISTS idx_enquiries_created  ON public.enquiries(created_at DESC);

DROP TRIGGER IF EXISTS trg_enquiries_updated_at ON public.enquiries;
CREATE TRIGGER trg_enquiries_updated_at BEFORE UPDATE ON public.enquiries
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS public.enquiry_messages (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enquiry_id   UUID NOT NULL REFERENCES public.enquiries(id) ON DELETE CASCADE,
  author_id    UUID REFERENCES public.users(id) ON DELETE SET NULL,
  author_label TEXT,
  body         TEXT NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_enquiry_messages_enquiry ON public.enquiry_messages(enquiry_id, created_at);

-- ---- RLS -------------------------------------------------------------------
ALTER TABLE public.enquiries        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enquiry_messages ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.can_access_enquiry(e_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT app_is_staff()
      OR EXISTS (
        SELECT 1 FROM public.enquiries e
        WHERE e.id = e_id
          AND app_user_partner_id() IS NOT NULL
          AND e.business_partner_id = app_user_partner_id()
      );
$$;

-- enquiries
DROP POLICY IF EXISTS enquiries_staff_all ON public.enquiries;
CREATE POLICY enquiries_staff_all ON public.enquiries FOR ALL TO authenticated
  USING (app_is_staff()) WITH CHECK (app_is_staff());
DROP POLICY IF EXISTS enquiries_partner_read ON public.enquiries;
CREATE POLICY enquiries_partner_read ON public.enquiries FOR SELECT TO authenticated
  USING (app_user_partner_id() IS NOT NULL AND business_partner_id = app_user_partner_id());
DROP POLICY IF EXISTS enquiries_partner_insert ON public.enquiries;
CREATE POLICY enquiries_partner_insert ON public.enquiries FOR INSERT TO authenticated
  WITH CHECK (
    app_user_partner_id() IS NOT NULL
    AND business_partner_id = app_user_partner_id()
    AND created_by = app_current_user_id()
  );

-- enquiry_messages
DROP POLICY IF EXISTS enquiry_messages_staff_all ON public.enquiry_messages;
CREATE POLICY enquiry_messages_staff_all ON public.enquiry_messages FOR ALL TO authenticated
  USING (app_is_staff()) WITH CHECK (app_is_staff());
DROP POLICY IF EXISTS enquiry_messages_read ON public.enquiry_messages;
CREATE POLICY enquiry_messages_read ON public.enquiry_messages FOR SELECT TO authenticated
  USING (can_access_enquiry(enquiry_id));
DROP POLICY IF EXISTS enquiry_messages_post ON public.enquiry_messages;
CREATE POLICY enquiry_messages_post ON public.enquiry_messages FOR INSERT TO authenticated
  WITH CHECK (can_access_enquiry(enquiry_id) AND author_id = app_current_user_id());

COMMIT;

-- Verification
SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('enquiries','enquiry_messages');
SELECT policyname FROM pg_policies WHERE tablename IN ('enquiries','enquiry_messages') ORDER BY tablename, policyname;
