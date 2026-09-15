-- ============================================================================
-- 097 — which part of the council a property falls under
-- ============================================================================
-- WHY
--   Jukka, 2026-09-15: "I see there council City of Joburg. What I want us to
--   put in there is the region at which that property is operating" — Sandton,
--   Midrand, Lonehill — "because with each region we need to address the
--   selected services."
--
--   City of Johannesburg is one council in this system and several in practice:
--   which office a clearance goes to, who the contact is, and how long it takes
--   all vary by region. Today the portal records COJ and nothing finer, so a
--   runner works that out from the address every time.
--
-- WHO FILLS IT IN
--   ConveyClear, not the firm. Jukka again: "that's something only ConveyClear
--   will be able to put in — the attorneys, they look past that most of the
--   times. So I'm not guaranteeing on them to have it put in as a required
--   field." Attorneys can SEE it ("no no no, they can see it"), which is why it
--   lives on the transfer rather than in an internal note.
--
--   So: nullable, no CHECK, no default. A required field nobody reliable fills
--   is a field full of guesses.
--
-- WHY FREE TEXT AND NOT A LOOKUP TABLE
--   The only regions named so far are three COJ suburbs in one meeting. A
--   lookup table would freeze a taxonomy nobody has agreed — and the official
--   COJ regions are lettered A–G, which is NOT what Jukka asked for. The app
--   offers the known values as suggestions and accepts anything, so the list
--   can harden into a constraint once there is a real one to encode.
-- ============================================================================

BEGIN;

ALTER TABLE public.property_transfers
  ADD COLUMN IF NOT EXISTS council_region TEXT;

COMMENT ON COLUMN public.property_transfers.council_region IS
  'Sub-area of the council this property falls under, e.g. "Sandton" under COJ. Entered by ConveyClear staff, visible to the firm. Free text on purpose (097) — suggestions live in src/lib/councils/regions.ts.';

COMMIT;

-- ============================================================================
-- VERIFY (run after COMMIT)
--
--   -- 1. The column exists and is empty. Expect one row, council_region null.
--   SELECT column_name, data_type, is_nullable
--     FROM information_schema.columns
--    WHERE table_schema = 'public' AND table_name = 'property_transfers'
--      AND column_name = 'council_region';
--
--   -- 2. Nothing was disturbed. Expect the transfer count to be unchanged.
--   SELECT count(*) AS transfers, count(council_region) AS with_region
--     FROM public.property_transfers;
--
-- THEN, IN THE APP: open any transfer as admin, set a region, and confirm it
-- appears on the firm's view of the same transfer as read-only text.
--
-- ROLLBACK
--   ALTER TABLE public.property_transfers DROP COLUMN IF EXISTS council_region;
-- ============================================================================
