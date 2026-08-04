-- ============================================================================
-- 033 — In-place FICA capture: honest consent provenance
--
-- THE PROBLEM THIS EXISTS TO AVOID
--   On /onboard, the CLIENT ticks the POPIA / terms / marketing boxes themselves.
--   The resulting consent_events row is stamped source='fica_form' + the client's
--   own ip_address. That is a genuine record of consent given by the data subject.
--
--   The in-place intake lets STAFF (or the attorney firm) complete a matter without
--   sending that link. If staff ticking the same boxes wrote the same row, the
--   system would be MANUFACTURING a consent record — attributing consent to the
--   client while recording the staff member's IP. Under POPIA consent must come
--   from the data subject; a third party can only record that it was obtained
--   elsewhere, and say how.
--
--   So an in-place consent is never "the client agreed". It is "a named staff
--   member recorded, on this date, that the client gave consent by this method".
--   Different claim, different evidentiary weight, and the row must say which.
--
-- WHAT THIS ADDS
--   captured_by    — the user who RECORDED the consent (NULL when the client gave
--                    it directly through the portal — that is the point).
--   capture_method — how it was obtained. NULL for portal consent, which is
--                    self-evidencing.
--   note           — free text: reference of the signed mandate, email date, etc.
--
-- No existing row changes meaning: every consent_events row written to date came
-- from /onboard, has source='fica_form', and now simply has NULL provenance
-- columns — which reads correctly as "given directly by the client".
--
-- Additive, idempotent, single transaction. Applied manually in the SQL editor.
-- ============================================================================

BEGIN;

ALTER TABLE public.consent_events
  ADD COLUMN IF NOT EXISTS captured_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS capture_method text,
  ADD COLUMN IF NOT EXISTS note text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.consent_events'::regclass
      AND conname = 'consent_events_capture_method_check'
  ) THEN
    ALTER TABLE public.consent_events
      ADD CONSTRAINT consent_events_capture_method_check
      CHECK (
        capture_method IS NULL OR capture_method IN (
          'signed_form',   -- a signed mandate / FICA pack is on file
          'email',         -- the client confirmed in writing by email
          'in_person',     -- given in person, staff witnessed
          'verbal'         -- weakest; recorded for completeness, flagged in the UI
        )
      );
  END IF;
END $$;

-- A staff-recorded consent MUST say how it was obtained. A portal consent must
-- NOT claim a method — it IS the evidence. This makes the distinction structural
-- rather than a convention the next developer has to know about.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.consent_events'::regclass
      AND conname = 'consent_events_provenance_check'
  ) THEN
    ALTER TABLE public.consent_events
      ADD CONSTRAINT consent_events_provenance_check
      CHECK (
        (captured_by IS NULL AND capture_method IS NULL)   -- given via the portal
        OR (captured_by IS NOT NULL AND capture_method IS NOT NULL) -- recorded by staff
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_consent_events_matter
  ON public.consent_events (matter_id);

COMMENT ON COLUMN public.consent_events.captured_by IS
  'The staff user who RECORDED this consent. NULL = the client gave it directly '
  'through the portal (source=''fica_form''), which is the stronger record.';
COMMENT ON COLUMN public.consent_events.capture_method IS
  'How a staff-recorded consent was obtained. NULL for portal consent — that row '
  'is its own evidence. Enforced together with captured_by by '
  'consent_events_provenance_check.';

COMMIT;

-- ----------------------------------------------------------------------------
-- Verification (run after COMMIT)
-- ----------------------------------------------------------------------------
-- Every pre-existing consent still reads as client-given (expect captured_by NULL
-- on all of them, source 'fica_form'):
--   SELECT source, capture_method, count(*)
--     FROM consent_events GROUP BY 1,2;
--
-- The provenance rule holds (expect 0 rows):
--   SELECT id FROM consent_events
--    WHERE (captured_by IS NULL) <> (capture_method IS NULL);
