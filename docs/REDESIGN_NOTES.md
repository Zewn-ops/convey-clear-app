# Portal redesign — review notes

Branch `feature/portal-redesign`. Running log of every user-visible change, so the
review is a checklist rather than a pile of commits.

**Review on staging**, not prod: `./scripts/use-env.sh staging && npm run dev`, then log in as
`dryrun.partner@sterlinghayes.co.za`. Staging holds 8 matters across five phases, aged 3 to 201 days,
so the phase bars, workday chips and the 60-day amber threshold all have live cases.

Design system: `DESIGN.md`. Tokens: `src/styles/tokens.css`.

---

## Decisions taken (Zewn, 2026-08-04/05)

| Decision | Choice |
|---|---|
| Primary colour | Navy `#1B2E6B` for chrome, brighter `#2c4ab2` for actions |
| Orange | **You must act.** Amber = waiting on the council |
| Themes | Light and dark, both first-class. Dark is **opt-in only** until every surface is migrated |
| Density | Rich cards for matters and transfers, tables for clients / firms / council contacts |
| Panels | Tint + coloured label. **Coloured side stripes banned portal-wide** |
| Card spacing | `p-5`/`sm:p-6`, `space-y-4` between, `mt-4` inside |
| Dark ground | `#171c25` grey-blue, lifted from near-black after review |
| Theme toggle | Bottom of the sidebar, labelled row |

---

## Route status

| Route | State | Notes |
|---|---|---|
| `partner/layout.tsx` | ✅ | Canvas token, `bg-chrome` sidebar, theme toggle at sidebar foot (desktop + mobile) |
| `partner/page.tsx` | ✅ | Rebuilt on `MatterCard`. Stat tiles link to filtered lists |
| `partner/matters/page.tsx` | ✅ | Table → cards, `showStage`, real empty state, selects `updated_at` |
| `partner/transfers/page.tsx` | ✅ | Table → `TransferCard`. Zero-matter transfers flag in the required tone |
| `partner/clients/page.tsx` | ✅ | Stays a table, on the new `Table` shell |
| `partner/enquiries/page.tsx` | ✅ | Card rows + real empty state |
| `partner/matters/[id]` | 🟡 | Inherits primitives + neutral sweep; layout not reworked |
| `partner/transfers/[id]` | 🟡 | Same |
| `partner/clients/[id]` | 🟡 | Same |
| `partner/enquiries/[id]` | 🟡 | Same |
| `partner/firm`, `refer`, `transfers/new` | 🟡 | Same |
| `/admin` (25 files) | 🟡 | Primitives only, deliberately not swept |
| `/dashboard` (10 files) | ⬜ | Not started |
| `/onboard` (4 files) | ⬜ | Not started |

---

## Changes worth a second look

Things where I made a judgement call rather than a mechanical swap.

### Shared primitives were tokenised, so unmigrated pages moved too
`Card` (50 files), `Button` (25), `Badge` (20), `Input` (18), `Select` (10) now read tokens. This makes
dark mode correct wherever they appear and shifts light mode only slightly, since the tokens were
derived from the brand colours already in use. Pages marked 🟡 above got this for free without their
layout being reworked.

`Button` outline lost its navy border for a neutral one: on a page where orange means "you must act", a
navy outline on every secondary control competed with the one control that needed attention.

### Contrast sweep — 242 changes, 65 files, app-wide
`text-gray-400` measured **2.54:1** on white, failing WCAG AA (4.5) and even the 3:1 large-text bar.
Moved to `gray-500` (4.83:1). Muted text is very slightly darker **everywhere**, including pages not
yet redesigned.

Two deliberate exclusions: `AdminSidebar.tsx` renders muted text on `bg-gray-900` where gray-400 is
6.99:1 and gray-500 would be **3.67:1**, i.e. the sweep would have introduced the failure it was
removing. And a disabled `<select>`, since WCAG 1.4.3 exempts disabled controls and raising contrast
makes them read as enabled.

### No next-action callout on the dashboard
Deriving it honestly needs document and party state the query does not fetch. A plausible guess on an
attorney's dashboard is worse than an absent row. The `Callout` component exists and is wired for when
the data does.

### "Last update" does not come from the activity feed
It reads `matters.updated_at`. `matter_activities` RLS allows non-staff only `status_change`,
`document_upload`, `phase_transition` and `poa_signed` — staff notes are internal by design. A chip
driven by that table rendered **blank for exactly the people the page is for**. Caught by impersonating
the partner role against staging.

### Stage names can leak
`MatterCard`'s `showStage` collapses a stage the client is not meant to see to "In progress" rather than
printing the internal step name. Same rule the old table applied; carried over deliberately.

### Amber past 60 workdays
A matter open beyond 60 **workdays** flags amber. Weekends excluded, public holidays **not** — the
function is called `workdaysSince` and means it, because a wrong number a firm repeats to a client is
worse than a consistently weekend-only one. Verified against seven hand-counted cases.

---

## Staging fixtures

`supabase/scripts/seed_staging_extra.sql`, applied with `./scripts/staging-bootstrap.sh extra`.

- 3 firm-linked clients (natural person, business, trust) so the firm → client RLS path is exercised
- 8 matters across five phases, backdated 3 to 201 days
- 4 transfers across open / on hold / registered, one with **zero matters** so that chip has a live case

## Known gaps

- **Peer benchmark** ("Tshwane clearances averaging X days") is computable but needs volume. Do not ship
  a fabricated figure — an attorney will quote it to a client.
- **"You checked N days ago"** has no storage. Needs a column if wanted.
- **Dark mode is opt-in** and only correct on migrated surfaces. Restore the
  `prefers-color-scheme` block in `tokens.css` in the same commit that finishes the migration.
