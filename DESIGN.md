# ConveyClear Portal — Design System

**v1, 2026-08-04.** Tokens: `src/styles/tokens.css`. Spec page: the Design System v1 artifact.

Reference: trackmyapp.co.za's layered-card language, rebuilt on ConveyClear's palette. Extracted
tokens for that site are in the session scratchpad, not vendored here.

## The one idea

**The action blue is navy, moved.** ConveyClear navy is `oklch(0.325 0.109 267)`; the reference blue is
`oklch(0.424 0.181 266)`. Same hue family. So the interactive blue is navy pushed up its own lightness
scale to `#2c4ab2`, and the palette extends the brand rather than replacing it.

## Colour

Solved, not chosen. Every pair verified against its own theme's surface: **40 of 40 pass WCAG AA in both
themes.** Regenerate with the OKLCH solver rather than hand-editing — each value carries a contrast proof
and a manual tweak silently breaks it.

| Role | Light | Dark | Means |
|---|---|---|---|
| `chrome` | `#1b2e6b` | `#0a1538` | Sidebar, header. Brand presence, never interactive |
| `action` | `#2c4ab2` | `#587eec` | Buttons, links, active state, progress |
| `required` | `#d43e00` | `#e85219` | **You must act.** Orange |
| `waiting` | `#b15f00` | `#f59e0a` | **Waiting on someone else** (council, CFR). Amber |
| `ok` | `#00872f` | `#16a34a` | Approved, registered, complete |
| `danger` | `#d33b36` | `#e74f47` | Destructive, disapproved |

Brand orange `#E8521A` is natively readable on a dark card (4.64:1). Light mode forces it to `#d43e00`.

Neutrals are tinted toward hue 267 (chroma 0.006–0.03), never pure grey and never `#000`/`#fff`.
Badge fills carry a solved label colour: white on blue and red, **ink on orange, amber and green** —
white on `#ef5923` is 2.9:1 and fails.

## The orange/amber split

The distinction the portal cannot currently express, and the one most worth having. Orange means the
firm is the blocker. Amber means the council is. An attorney who can tell those apart at a glance stops
phoning ConveyClear about delays nobody controls.

## Type

Inter, already in use by both ConveyClear and the reference. The typeface is not the variable; weight
and tracking are.

| Role | Size / weight / tracking |
|---|---|
| Page title | 32 / 800 / -0.03em |
| Section | 22 / 750 / -0.02em |
| Card title | 15 / 750 |
| Body | 14 / 400, capped 68ch |
| Metadata | 12 / 400, `muted` |
| Label | 10 / 700 / 0.11em, uppercase, mono |

Tabular numerals wherever digits align in columns.

## Surface

Two radii (`10px`, `14px`), not the **six** currently shipped. Shadows are navy-tinted
(`rgb(27 46 107 / .08)`), never grey — this carries most of the modern read. Motion:
`cubic-bezier(.22,1,.36,1)`, 120ms and 200ms, no bounce.

## Card spacing

Locked 2026-08-05 after review. The first cut felt clustered.

| | Value |
|---|---|
| Card padding | `p-5`, `sm:p-6` |
| Between cards | `space-y-4` |
| Between layers inside a card | `mt-4` |
| Chip row | `gap-2`, chips `px-2.5 py-1.5` |
| Card title | 15.5px / 700 / -0.015em |
| Section rhythm | `space-y-8` |

Deliberately not one flat value everywhere: the gap between cards is larger
than the gap between layers inside a card, so a card reads as one object rather
than as five evenly-spaced rows.

## Density

**Rich cards for transfers and matters** — where the anxiety is. **Tables for clients, firms and council
contacts** — where it is just a list. Same split the reference makes.

## Rules

1. Answer "where am I, what's next" above the fold.
2. Show elapsed time, not only state.
3. Progress beats status: "Phase 2 of 4" over "Docs pending".
4. One primary action per object, in the user's words.
5. Never dead-end; every empty state carries its filling action.
6. Nothing critical behind hover.
7. No nested cards. No modal where a page will do.

## Callouts and panels

**DECIDED 2026-08-04: tint + coloured heading. No side stripes.**

A coloured panel is a soft background tint, a 1px border in the same hue, and a coloured uppercase
label. The reference's thick left border is not used anywhere in the portal.

```
background: var(--cc-{role}-tint);
border: 1px solid color-mix(in srgb, var(--cc-{role}) 26%, transparent);
label:  var(--cc-{role}), 10px / 700 / 0.11em, uppercase, mono
```

Rationale: the colour-coding carries the meaning, the stripe was only one way to draw it. The tint also
survives dark mode, where a 4px stripe against `#171b24` reads muddy rather than deliberate.

⛔ **`border-left` / `border-right` wider than 1px as a coloured accent is banned** on cards, list items,
callouts and alerts. If a panel needs to read as a category, use the tint, the label colour, or a
leading icon.

## Rollout state (2026-08-04)

Dark mode is **opt-in only**. `tokens.css` deliberately has no
`prefers-color-scheme` block, and `ThemeToggle` appears only in the partner
shell. **42 of 59 page files still hardcode `bg-white` / `bg-gray-50` /
`text-gray-900`**; following the OS preference today would hand every one of
those users a dark canvas behind white cards, with no action on their part.

Restore the media query in the same commit that finishes the migration.

| Surface | State |
|---|---|
| Partner dashboard (`/partner`) | ✅ tokens, primitives, both themes |
| Partner shell (`layout.tsx`) | ✅ canvas token + toggle |
| Rest of `/partner` (11 files) | ⬜ hardcoded greys |
| `/admin` (22 files) | ⬜ hardcoded greys |
| `/dashboard` (5 files) | ⬜ hardcoded greys |
| `/onboard` (4 files) | ⬜ hardcoded greys |

## Open

- **Peer benchmark** ("Tshwane clearances averaging 74 workdays") is computable but needs volume.
  Do not ship a fabricated figure — an attorney will quote it to a client.
- **"You checked 11d ago"** has no storage. Needs a column if wanted.
