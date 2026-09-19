-- ============================================================================
-- 100 — every firm gets a code, and no two firms share one
-- ============================================================================
-- WHY
--   uq_property_transfers_reference (026) is UNIQUE (upper(reference)) across
--   the WHOLE TABLE. References belong to the FIRM, and firms do not coordinate
--   file numbering with each other, so two firms both running a "5600" is
--   ordinary rather than exceptional.
--
--   Today the second firm to submit that reference is refused — and neither the
--   attorney nor the staff member on the screen can resolve it, because the
--   colliding transfer belongs to someone else and RLS correctly hides it. With
--   one firm live this has never fired. It fires on the second firm's FIRST
--   transfer, which is also the worst possible moment for it.
--
--   Jukka, 2026-09-18: "if I get another attorney and they also use the same
--   referencing style then it'll be a problem … so we should determine an
--   abbreviation for each attorney."
--
--   The abbreviation column has existed since 023 and was never required, never
--   validated, and never reached the reference. This migration makes it real.
--
-- WHAT IT DOES
--   1. Backfills a code onto every firm that lacks one, from its initials.
--   2. Constrains the format: 2–6 characters, A–Z and 0–9 only.
--   3. Makes it unique across firms, case-insensitively.
--
--   The app (src/lib/firm-reference.ts) then prefixes the firm's reference with
--   its code at the point the request is submitted, so BSI_5600 and AA_5600 are
--   different references and the existing global unique index becomes CORRECT
--   rather than merely tolerated.
--
-- ⚠️ EXISTING TRANSFER REFERENCES ARE NOT REWRITTEN, DELIBERATELY.
--   Sterling Hayes' live transfers read SH-2026-1001 — the code is already at
--   the front, with a hyphen. Rewriting them would change references that
--   attorneys have written on physical files and that the dry-run guide names
--   by number. The app treats a reference that already opens with the firm's
--   code as qualified and leaves it exactly as typed, whatever separator it
--   uses, so these rows keep working untouched and need no data change.
--
-- ⚠️ THE BACKFILL IS A SUGGESTION THAT BECAME A VALUE.
--   Initials are a reasonable guess and not an authority — Jukka said the codes
--   should be "determined", and determining them is his call. Check the result
--   of the first VERIFY query below with him and correct any that are wrong
--   BEFORE a second firm starts submitting, because changing a code afterwards
--   does not retro-qualify references already issued under the old one.
-- ============================================================================

BEGIN;

-- 1. Backfill ----------------------------------------------------------------
-- Initials of every word longer than one character: "Bert Smith Inc" → BSI,
-- "Adams & Adams" → AA. Firms whose name yields fewer than two usable initials
-- fall back to the first three characters of the name, so the result always
-- satisfies the CHECK added below.
WITH derived AS (
  SELECT
    bp.id,
    COALESCE(
      NULLIF(
        (
          SELECT string_agg(left(w, 1), '' ORDER BY ord)
            FROM unnest(
                   regexp_split_to_array(upper(regexp_replace(bp.name, '[^A-Za-z0-9]+', ' ', 'g')), '\s+')
                 ) WITH ORDINALITY AS t(w, ord)
           WHERE length(w) > 1
        ),
        ''
      ),
      ''
    ) AS initials,
    upper(regexp_replace(bp.name, '[^A-Za-z0-9]', '', 'g')) AS squashed
  FROM public.firms bp
  WHERE bp.abbreviation IS NULL OR btrim(bp.abbreviation) = ''
)
UPDATE public.firms bp
   SET abbreviation = CASE
         WHEN length(d.initials) >= 2 THEN left(d.initials, 6)
         ELSE left(d.squashed, 3)
       END
  FROM derived d
 WHERE bp.id = d.id
   AND length(COALESCE(NULLIF(d.initials, ''), d.squashed)) >= 2;

-- 2. Format ------------------------------------------------------------------
-- NULL still permitted: a firm record can be created before its code is
-- settled, and the app falls back to an unprefixed reference rather than
-- refusing the transfer. What is NOT permitted is a malformed code, because
-- a separator inside one would make "does this reference already carry its
-- firm's code" ambiguous about where the code ends.
ALTER TABLE public.firms
  DROP CONSTRAINT IF EXISTS firms_abbreviation_format;
ALTER TABLE public.firms
  ADD CONSTRAINT firms_abbreviation_format
  CHECK (abbreviation IS NULL OR abbreviation ~ '^[A-Z0-9]{2,6}$');

-- 3. Uniqueness --------------------------------------------------------------
-- Case-insensitive, matching how uq_property_transfers_reference compares the
-- references these codes are about to prefix. Two firms sharing a code would
-- reproduce the exact collision this migration exists to remove, one level up.
CREATE UNIQUE INDEX IF NOT EXISTS uq_firms_abbreviation
  ON public.firms (upper(abbreviation))
  WHERE abbreviation IS NOT NULL;

COMMENT ON COLUMN public.firms.abbreviation IS
  'Firm code, 2-6 chars of A-Z/0-9, unique across firms. Prefixed onto the '
  'firm''s transfer reference (BSI_5600) so two firms can both run a file '
  '"5600". Set at firm creation; changing it does not re-qualify references '
  'already issued under the old code.';

COMMIT;

-- ============================================================================
-- VERIFY (run after COMMIT)
--
--   -- 1. ⚠️ READ THIS ONE WITH JUKKA. Every firm and the code it now carries.
--   SELECT name, abbreviation FROM public.firms ORDER BY name;
--
--   -- 2. Nobody was left without a code.
--   SELECT count(*) AS firms_without_code
--     FROM public.firms
--    WHERE abbreviation IS NULL OR btrim(abbreviation) = '';
--   -- expect 0
--
--   -- 3. No two firms share one.
--   SELECT upper(abbreviation) AS code, count(*)
--     FROM public.firms
--    WHERE abbreviation IS NOT NULL
--    GROUP BY 1 HAVING count(*) > 1;
--   -- expect 0 rows
--
--   -- 4. Existing references are untouched — Sterling Hayes still reads
--   --    SH-2026-1001, not SH_SH-2026-1001.
--   SELECT reference FROM public.property_transfers ORDER BY created_at LIMIT 10;
--
-- THEN, IN THE APP: as the firm, request a transfer with reference "5600" and
-- confirm it is stored and displayed as "<CODE>_5600". Request a SECOND one
-- with a reference that already opens with the firm's code and confirm it is
-- left exactly as typed rather than double-prefixed.
--
-- ROLLBACK
--   DROP INDEX IF EXISTS public.uq_firms_abbreviation;
--   ALTER TABLE public.firms
--     DROP CONSTRAINT IF EXISTS firms_abbreviation_format;
--   -- The backfilled codes are left in place: they are correct data, and
--   -- references issued while this was live already embed them.
-- ============================================================================
