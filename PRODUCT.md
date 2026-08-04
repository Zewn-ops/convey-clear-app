# ConveyClear Portal

**Register:** product. The design serves the work; it is not the product.

Sourced from `~/brain/clients/convey-clear/CLAUDE.md`, `REDESIGN_SPEC_NOTES.md` and
`REDESIGN_SECTION1_PLAN.md`. Update here when those change.

## Product purpose

A South African property conveyancing and municipal compliance platform. Attorneys, their clients and
ConveyClear staff track property transfers, rates clearance certificates, changes of ownership and
municipal account work through slow, opaque council processes. The property transfer is the central
object; matters hang off it.

The portal replaces phone calls and email chasing. Its single job is to answer, on sight: **where is
this, and what happens next.**

## Users

- **Conveyancing attorneys and their firms** (Bert Smith Inc. live today; Adams & Adams the target).
  Time-poor professionals running many transfers at once. They log in to check state, not to browse.
  They are judged by clients on turnaround they do not control, which is the anxiety the product absorbs.
- **Property owners and businesses** (the clients). Log in rarely, often once. Low tolerance for jargon,
  high anxiety about documents and money. Frequently mobile.
- **ConveyClear staff** (Jukka, Francois, services and ops). Live in the portal all day. They are
  gatekeepers: they approve documents, run council packs and hand work back with reasons.

## Brand

- **Navy `#1B2E6B`** and **orange `#E8521A`**. Fixed. Jukka's brand, not open for redesign.
- Inter, already in use.
- Tone: plain, specific, unhurried. This is legal and municipal work; confidence comes from precision,
  never from enthusiasm. No exclamation marks. Never tell a user something is "easy".

## Strategic principles

1. **Answer "where am I, what's next" above the fold.** The only question anyone opens this portal for.
2. **Show elapsed time, not just state.** "Open 82 workdays" converts anxiety into information. Councils
   are slow; hiding that makes the portal feel broken rather than the council.
3. **Progress beats status.** "Phase 2 of 4" with a bar outperforms "Docs pending", because it implies
   movement on days when nothing moved.
4. **Exactly one primary action per object,** stated in the user's terms ("Upload the seller's FICA"),
   never the system's ("Complete intake").
5. **Never dead-end.** Every empty state explains why it is empty and offers the action that fills it.
6. **Distinguish "you must act" from "we are waiting on someone else."** In conveyancing these feel
   identical in the UI today and are completely different to the user.
7. **Nothing critical behind hover.** Learned the hard way: hover does not exist on a phone.

## Anti-references

- **Enterprise legal software.** Dense grey grids, twelve-column toolbars, everything a table. The thing
  attorneys already hate.
- **Consumer fintech cheerfulness.** Confetti, mascots, "You're all set!" This product handles FICA
  records and municipal debt. Warmth here reads as unserious.
- **Gradient-heavy SaaS marketing.** The portal is a working surface, not a landing page.
- **trackmyapp.co.za's chrome specifically:** its 90px blue gradient header carries no information on
  every page, and its sidebar upsell block. The layered card language is the reference. The chrome is not.

## Scene

A conveyancing attorney at a Centurion firm, mid-morning, daylight through the window, checking whether
the City of Tshwane moved a rates clearance forward before phoning a client back.

That forces **light as the default theme.** Dark is a real option, not the default: the same person at
22:00 finishing a lodgement, and staff who sit in the portal all day. Both themes are first-class.
