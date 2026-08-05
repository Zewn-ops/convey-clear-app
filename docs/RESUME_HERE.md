# ConveyClear — Resume Point (waypoint)

**Last worked:** 2026-08-05. **Read this first in a new window**, then `~/brain/SESSION_LOG.md` (top entry).

---

# ▶ 2026-08-05 — START HERE

## State in one line

Prod `master` = **`edd09d6`**, unchanged. **26 commits sit unreviewed on `feature/portal-redesign`**,
applied only to **staging**. Zewn has not yet seen the redesign render.

## The six open branches

| Branch | Head | What | Risk |
|---|---|---|---|
| `fix/text-contrast-gray-400` | `b80bb15` | 242 a11y fixes | none, visual only |
| `chore/staging-runbook` | `46999f5` | `docs/STAGING.md` + bootstrap script | none, docs |
| `feature/design-system` | `2f29822` | tokens, `DESIGN.md`, `PRODUCT.md` | none, no runtime |
| `feature/firms-rename` | `ca21ca9` | rename + migrations 046/047 | ⚠️ needs migration ordering |
| `feature/portal-redesign` | `9a3d521` | **everything** — stacked on firms-rename | ⚠️ the big one |
| `chore/migrations-into-git` | `c70ccb1` | **already merged** to master | — |

`feature/portal-redesign` contains all the others' work except the runbook. Merging it alone gets
everything; the standalone branches exist for a smaller first merge if wanted.

## 🔴 Deploy ordering — this is not a normal merge

Migrations 046–052 are NOT applied to prod. Sequence matters:

1. Run **046** (rename + `security_invoker` compat view). Both table names work afterwards, so this is
   safe to run **before** the deploy — which matters because Zewn pushes master by hand and cannot flip
   the DB and Vercel in the same second.
2. Deploy the app.
3. Run **047** (drops the shim). Only after the deploy is ● Ready and
   `grep -rn business_partners src/` is empty.
4. Then **048 → 052**, in order. 049 and 052 are behaviour-changing.

**Before 049 and before 052: capture an access baseline by JWT impersonation.** That is how 049's
regression was caught on staging. The method is in each migration's VERIFY block.

## Staging — how to use it

```bash
cd ~/projects/convey-clear/convey-clear-app
./scripts/use-env.sh which          # prints which project .env.local points at, from the ref
./scripts/use-env.sh staging        # switch (restart npm run dev after — NEXT_PUBLIC_* inline at build)
./scripts/staging-bootstrap.sh      # apply all migrations
./scripts/staging-bootstrap.sh 053  # resume from a number
./scripts/staging-bootstrap.sh seed # base dry-run data
./scripts/staging-bootstrap.sh extra # multi-entity + transfer fixtures
```

Logins on staging: `dryrun.partner@sterlinghayes.co.za` (firm, 6 matters), `dryrun.client@example.com`
(client, **2 entities — the switcher appears**), `zuaan@quantra.co.za` (admin). Password set by Zewn.

⚠️ **If the app renders unstyled, it is a stale `.next`, not the code.** Stop the dev server,
`rm -rf .next`, restart. This cost hours on 08-05.

## What Zewn still owes

1. **Review the redesign.** Nothing has been seen rendered. This gates further UI work.
2. **Rotate the staging API keys** — I leaked them by sourcing `.env.local` in a shell that echoed the
   values. Staging only, synthetic data, Quantra org, but do it. Re-paste keeping the `VARIABLE_NAME=`
   prefix; dropping it silently breaks the file.
3. **Vercel Preview env vars** → staging, scoped to All Preview branches. Ends a 23-day outage.
4. **3 private storage buckets** on staging — `matter-documents`, `transfer-documents`,
   `client-documents`. Needed before any upload flow is testable.
5. **`git push origin master`** — Gitea is behind; needs LAN.
6. **The 5 pending docs → `/admin/approvals`**, then 043 can finally be applied. Still true. Still the
   oldest open item.
7. **Go/no-go was Thu 06 Aug** — outcome unknown to this session.

## Known gaps in what was built

- **No UI for revoking a firm's access.** 051/052 enforce it; revocation is still SQL-only.
- **`locations` not built** — Section 3 (Seattle, ~500 stores) needs it, and building it later means
  backfilling every transfer.
- **Councils hierarchy + compliance columns** not built. Both inert and additive.
- **Dark mode is opt-in** and correct only by mechanical sweep — nobody has *looked* at admin, the client
  dashboard or onboarding in dark. Restore the `prefers-color-scheme` block in `tokens.css` only after
  someone has.
- **Peer benchmark** ("Tshwane averaging X days") is computable but needs volume. Do not ship a fabricated
  figure; an attorney will quote it to a client.

## Two traps that bit twice — check both before any schema work

1. **Function bodies are TEXT.** They do not follow a table rename, and `CREATE OR REPLACE` takes the whole
   body. Before rewriting one: `grep -ln "FUNCTION public.<name>" supabase/migrations/*.sql` and use the
   LATEST. Missing this cost an access regression (049) and a silent insert failure (046).
2. **A precondition satisfied by an empty table is satisfied only until someone uses the app.** 043 has
   been "unblocked" twice and re-blocked twice.

---

## ▶ 2026-08-04 — DEPLOYED TO PROD · migrations in git · Section 1 decisions locked

**Prod `master` = `edd09d6`** (was `94c7d11`, frozen 11 days). Two branches merged + pushed to `github`:
`feature/filters-and-approvals-history` (`d22958b`) and `chore/migrations-into-git` (`c70ccb1`).
Vercel Production ● Ready, 49s. **No migration was needed** — verified, not assumed: all 13 tables the
branch queries exist in prod, every column identifier resolves, and the two approvals selects (with the
named FK hints `users!documents_uploaded_by_user_id_fkey` / `users!transfer_documents_uploaded_by_fkey`
plus the `matters(title)` and `property_transfers(reference)` embeds) both return **200** against prod.
**New build confirmed live by control test:** `/admin/notifications` (new in this branch) redirects to
`/auth/login` 200, while a nonexistent route 404s — so the route is genuinely in the deployed bundle.

⚠️ **`origin` (NUC Gitea) is still at `94c7d11`** — only `github` was pushed. Run `git push origin master`
on the LAN; until then the self-hosted mirror is not a backup of what is live.

**Zewn is click-testing on prod.** Three things to know while testing:
1. **043 is still NOT applied**, so the approvals page's "staff uploads stay hidden from clients and
   partner firms" is **still false — nothing is hidden.** Live count probed 2026-08-04: `documents` =
   **5 total, 5 pending, 0 approved**; `transfer_documents` = 5 total, all approved. Clear the 5 in
   `/admin/approvals` (clicks, not SQL — SQL skips `notifyUsers` + the activity log), re-check the count
   is 0, then apply 043. **The 07-28 note called 043 "unblocked" only because the wipe had emptied the
   table; five uploads later it is blocked again — re-check at flip time, every time.**
2. **`chk_party_name` rejects a nameless party**, so an uncaptured side is seeded with the role word as
   its name. A council pack generated before capture would read "Seller". Filling the create form avoids it.
3. **`matter_parties` = 0 rows in prod** — that is the COO bug this deploy fixes, visible in the data.
   The first staff-created COO matter after this deploy is the real test.

**Section 1 redesign — all 3 blocking decisions answered 2026-08-04** (detail in
`~/brain/clients/convey-clear/REDESIGN_SECTION1_PLAN.md`): `business_partners` → **`firms`** (migration
046 + 127 refs across 36 files; Postgres renames follow the OID so policies/FKs/functions need no
rewrite) · **entity subsections** adopted, each its own `clients` row, party rows reference the entity not
the per-viewer label · **separate staging Supabase project = YES, now P0** · `role` column ships in 047,
only `owner`/`member` enforced in Section 1.

⏰ **Go/no-go checkpoint is Thu 2026-08-06; internal launch 2026-08-20.** Section 1 is 10–13 working days
and has not started — that conflict is Jukka's call, not a scheduling detail.

---

## ▶ RESUME HERE — next pickup (2026-07-28)

**🧹 THE WIPE IS DONE.** Committed + independently verified 2026-07-28: `users=6`, `business_partners=1` (Bert Smith), everything else `0`. Cascades cleared 112 documents + 338 notifications without explicit deletes. Script kept at `WIPE_2026-07-28.sql`.

**The 07-24 "no backup" blocker was wrong.** Free-tier Supabase has no auto-backup, but Zewn's OWN pipeline was alive the whole time: VPS `/root/conveyclear-db/backup-supabase.sh` → cron 03:15 UTC → rclone → `nuc:~/backups/conveyclear-supabase/`. Built 05-30, fixed 06-18, still running. **Generalisable: before concluding "there is no backup", check the infra you already built — the session log had it.** The Pro upgrade was never actually a prerequisite for the wipe.

**Backups covering the wipe (keep until confident):**
- DB — `~/backups/conveyclear/conveyclear_supabase_20260728_031501.sql.gz` (+ NUC copy). Verified: valid gzip, 460 KB raw, 35 tables, row counts matched live *exactly* at wipe time.
- Storage — `~/backups/conveyclear/storage-2026-07-28/`, **114/114 files, 91.7 MB, 0 failures**, all `%PDF` headers valid. The nightly dump is `--schema=public` only, so storage was never covered by it — this download was the gap.
- ⚠️ `auth.users` is in NO backup. Deleting those logins is unrecoverable.

**Left deliberately undone (both inert, safe to defer):**
1. **9 orphan auth logins** — `public.users` rows gone, so RLS joins nothing; they can sign in but the app gives them nothing. Delete in Auth dashboard: services@testcc, andrewjordaan95@gmail, jukka@holl, zuaan@holl, dryrun.partner@sterlinghayes, dryrun.client@example.com, andrew@hotline101, fake@quantratech, test.runner@test.com.
2. **114 storage files** — unreferenced by any DB row. Inert, but real FICA PII → clear on POPIA grounds.

**⚠️ The local storage backup is 91.7 MB of unencrypted FICA PII** (IDs, proof of address) sitting in `~/backups` outside the app's access controls. Set a delete date; don't let it sit.

**📌 Supabase SQL editor does NOT hold a transaction open between Run clicks.** A `BEGIN` batch with no `COMMIT` is discarded when the execution ends — the first run looked like it worked and silently rolled back. Put `COMMIT` in the SAME execution. (Safe either way: if a statement errors the transaction is already aborted, so the `COMMIT` degrades to a rollback.)

**Also note:** Adams & Adams was deleted per the locked plan — they're a real prospect (demo feedback 06-29), so recreate the firm if they come back.

### Still open (unchanged by the wipe)

Prod `master` = `94c7d11`. Migrations **041 · 042 · 044 · 045 applied**; **043 still NOT applied.** Working tree clean. Five features shipped + browser-verified on prod (see the 07-24 block below); email-signature layout later reworked to match the legacy design.

### 🚨 2026-07-28 — VERCEL PREVIEW DEPLOYS HAVE BEEN BROKEN FOR 15 DAYS

The Preview environment variables are scoped to **a single git branch, `feature/sprint-1`** (set 15d ago). Any preview built from any other branch gets no Supabase config and fails at prerender with `@supabase/ssr: Your project's URL and API key are required`. In `vercel ls`, every Preview row is ● Error while every Production row is ● Ready — going back days.

**This means the standing "feature branch → staging/preview → review → merge" rule has not actually been running since 07-13.** That session's "Vercel staging works at last" was true only for `feature/sprint-1`.

**Fix:** Vercel → Settings → Environment Variables → for each of the 5 vars, change Preview scope from `feature/sprint-1` to **All Preview branches**. ⚠️ Decide deliberately first: preview deployments would then read/write the **production** Supabase database with the service_role key, on URLs that are public unless Deployment Protection is on. Options are (a) scope to all previews and turn on protection, or (b) stand up a separate staging Supabase project — the cleaner answer, and already on the P1 DevOps list from 05-30.

### ⏳ Branch awaiting review: `feature/filters-and-approvals-history`

Pushed to GitHub (`d22958b`, 3 commits). **Cannot be preview-tested until the Vercel issue above is fixed** — verified locally instead: production build green, and all 19 filter queries probed directly against the live database.

**🐛 COO buyer/seller regression — FIXED (`d22958b`), needs a click to confirm.** Zewn reported the buyer/seller sections had vanished when creating a COO matter. Root cause was NOT a UI change: **`api/admin/matters` never created `matter_parties` rows at all** — only `/onboard` and `api/partner/refer` did. `InPlaceIntake` builds its COO party sections by looping over parties that already exist, so a staff-created matter rendered "Matter documents" and nothing else, with nowhere to file either side's FICA. **Latent for a long time and invisible because every matter in the database had arrived via onboard or a referral — the 07-28 wipe removed them all, so the next staff-created COO matter exposed it.** Fixed in three places: the API seeds seller + buyer for COO and accepts their details; `CreateMatterForm` gained a COO-only "Parties to the transaction" section; `InPlaceIntake` renders a placeholder section for any missing side.
⚠️ `chk_party_name` rejects a nameless party, so an **uncaptured side is seeded with the role word as its name** ("Seller"/"Buyer"). That is a real name field — a council pack generated before capture would read "Seller". Filling the creation form avoids it. **Verified by build + constraint probing, NOT by creating a real matter** (that writes to the freshly-wiped prod DB) — Zewn to click it.

**Also in this branch:** transfer documents show "N of 5 uploaded" (the five named types; `other` excluded as an open-ended catch-all, counts distinct types, a disapproved doc does not count) · the FICA card's "Complete now" is now an orange button, stepping down to a quiet "Review" once details + consent are captured.

- Left-hand `FilterRail` (URL-driven facets) on Matters, Property Transfers, Clients, Partner Firms, Council POCs.
- Matters: per-status / council / priority / phase / period. Council + phase options read from the DB.
- Council POCs: council + region/branch + department facets, new Region column, council codes render as names.
- Document Approvals: decided docs no longer vanish — tabs (Pending/Approved/Not approved/All), green + red row tints, disapproval reason on the row. Page is role-aware: admins get the review queue, staff get their own uploads read-only (RLS-scoped, service role stays admin-only).
- New `/admin/notifications` page, All/Unread tabs, explicit mark-read (does NOT auto-clear like the bell).
- **Two column bugs caught by schema probing that TypeScript could not see** (the Supabase client is untyped): `property_transfers.erf_number` does not exist, and `business_partners` is `abbreviation` not `abbrev`. Both would have 500'd on any search. **Generalisable: after writing a query against an untyped client, probe the column names against the live schema — a green build proves nothing about them.**

**Open threads, priority order:**

0a. **🎯 Zewn's feature list from 07-28 — 3 of 5 done, 2 need a design decision first.**
   - ✅ COO buyer/seller · ✅ transfer doc counter (N of 5) · ✅ orange "Complete now".
   - ⏳ **Parties on property transfers** (create-or-link buyer/seller/estate agents/attorneys). **Blocked on a schema call, not UI:** transfer parties are *client* records today, while matter parties are inline `matter_parties` captures with no login. Adding agents + attorneys means either extending `matter_parties` roles or a new join table. Decide the model before building.
   - ⏳ **Client profiles more present in matter + transfer creation.** Follows from the same decision.
   - Also still open from the same list: filters were built but **never click-verified** — the database is empty post-wipe, so seeding is needed to exercise them (offered, not done: prod would carry fake matters).

0. **🟢 043 IS NOW UNBLOCKED — apply it.** Its stated precondition was `SELECT count(*) FROM documents WHERE approved_at IS NULL` = 0; the 07-28 wipe left `documents` at 0 rows, so that is trivially satisfied. Until it is applied the approvals page's claim that staff uploads "stay hidden from clients and partner firms" is **false** — nothing is hidden. This is the safest window there will ever be.
1. **🧹 Full production data wipe — DEFERRED until Supabase Pro.** Jukka to approve Pro first. The whole plan is built + ready (FK graph mapped, transactional wipe script, keep-set decided) in the **"DB WIPE (deferred)"** section lower down — do NOT lose it. Rationale for waiting: free tier has no auto-backup, and the manual `pg_dump` backup kept failing (Docker daemon + SSL). Pro's daily backups make the wipe safe. **Keep-set locked:** 6 users (zuaan@quantratech, jukka@conveyclear, francois@, ops@, services@conveyclear, jukka@bertsmith) + Bert Smith firm. testcc = delete.
2. **🔴 Legacy Supabase `service_role` JWT STILL LIVE** — still needs disabling. ⚠️ **The long-repeated claim "the app reads only new-format keys, so disabling is a no-op" was NEVER VERIFIED** — it has been asserted since 07-22 and is an assumption, not a finding. Checked 07-28: `.env.local` genuinely uses new-format (`sb_publishable_` / `sb_secret_`) and those keys work against prod. But **Vercel production values are marked Sensitive (write-only) — `vercel env pull` returns them EMPTY, so prod's key format is UNKNOWN.** Both Supabase vars were created ~40 days ago (≈06-18), same day, which is suggestive but not proof.
   **Before disabling:** check the *last used* indicator on Supabase's legacy API keys page. Recent usage = prod is still on legacy = confirming the dialog takes the portal DOWN. If so, update the two Vercel vars to new-format keys and redeploy FIRST, then disable. Do it at a desk where a login smoke-test is possible, never right before leaving.
3. **Enable leaked-password protection** — one toggle (Auth → Policies), do before real client signups. From the Supabase linter triage.
4. **Signup email-delivery test** — do ONE real signup to Gmail + Outlook, confirm the confirmation email lands (check Supabase Auth → SMTP is custom, not default). This is the gate for "clients creating accounts." Same channel powers the new Create-login credentials email.
5. **Uploader bell** (from 07-23) — still not eyeballed. Low priority; code path confirmed.
6. **039 stranded-mirror cleanup** — preview WAS run (1 row: `A4 - 4.pdf` on AS1234). **The UPDATE was never run** — either run it (SQL below in the 07-23 section) or let the wipe erase it.
7. **Post-launch hardening** — SECURITY DEFINER functions exposed to anon/authenticated + `set_updated_at` mutable search_path (linter WARNs). Low real risk; do NOT blind-revoke (breaks RLS). Move RLS helpers to a private schema — a tested migration, later.

## 2026-07-24 — five features shipped + verified · DB wipe deferred to Pro

All merged to `master` (now `d35eaa8`) and **browser-verified on prod**. Migration 045 applied.

- **🐛 `/admin/approvals` was broken every load** (`column matters_1.reference does not exist`). NOT migration 042 (the banner guessed wrong) — the query embedded `matters(reference)` but `matters` has no such column. Fixed to `matters(title)`. Verified: queue loads, doc listed.
- **🆕 Document disapproval (migration 044) + notifications.** Approvals queue gained **View** (signed URL) + **Disapprove** (inline required reason). New `{documents,transfer-documents}/[id]/disapprove` routes (admin-only). Approve AND disapprove now **notify the uploader in-app** (`notifyUsers`); disapprove carries the reason. Matter/transfer doc rows: **grey while pending, red "Not approved" + reason on hover**. Verified end-to-end (disapprove w/ reason → red badge + activity log; View opens signed URL; approve clears queue). ⏳ only the uploader's bell itself unseen (can't log in as them).
- **🆕 Council POC fields (migration 045).** Added Tel, Office description, Birthday (date), Region, Job title; Comments = existing `notes`, now shown on create too. Verified: saved a POC (Thabo) → card shows all fields.
- **🆕 New client + Create login.** `/admin/clients` "New client" button → creates a bare client entity (no matter). Client page → "Create login" provisions a portal account (temp password, emailed/relayed, `must_change_password`). Supports Jukka's **legacy-matter backfill** (create clients → give logins → attach old matters after). No migration. Verified: created "Legacy Test Client" → Portal-access card + enabled Create login button. (Didn't click Create login — real account creation, Zewn's to click.)
- **🆕 Email-signature admin tab.** `/admin/email-signature` (admin-only) — the signature builder inside the portal for Zewn + Jukka. Fields → live preview → Copy signature. Same output as `email-signatures/signature-builder.html` (logo/tagline/icons, editable sign-off "Kind Regards / Vriendelike Groete,", absolute URLs = no CID collisions). Verified: tab shows, preview renders with live images + icons, contact rows correct.
- **🎨 Email-sig LAYOUT reworked to match the legacy** (`fix/sig-layout-legacy`, `94c7d11`). First cut stacked logo→tagline vertically with a divider; Zewn compared to the original and wanted the legacy arrangement: **logo across the top, name+title+contacts on the LEFT, "Your Key In Property" tagline on the RIGHT, no divider**; logo bumped to 320px; email/website links navy-underlined. Rendered against the legacy screenshot before shipping; **verified on prod the new layout is live** (tab reload during the browser test dropped my field input, but the structure rendered correct — tagline right, no divider). All 3 copies synced (in-portal `SignatureBuilder.tsx` + `email-signatures/signature-{template,builder}.html`). ⏳ Open nit: I vertically-centered the tagline beside the details; legacy sits a touch higher — one-line nudge if Zewn wants it, pending his eyeball on prod.
- **Email signature saga:** root cause was CID collisions on replies → fixed with absolute-URL images hosted at `public/email/` (`feature/email-signature-assets`, live). Icons dropped then **restored** at Zewn's request (bigger, stacked on top). Builder now also in-portal (above).
- **📌 Supabase linter triaged:** ~40 SECURITY DEFINER "executable by anon/authenticated" WARNs = low real risk (RLS helpers returning caller's own perms), don't blind-fix. `set_updated_at` search_path = trivial. Leaked-password protection OFF = enable it (easy win). None launch-blocking.
- **📌 Supabase Pro rating = 8/10 before real prod** (backups/PITR the driver for a legal app; storage limits; email). Fine for the supervised Bert Smith trial; get Pro before multi-firm / A&A launch. Jukka to approve.

## DB WIPE (deferred to Supabase Pro) — full plan, do not lose

**Goal:** clean slate. Keep only ConveyClear staff/admin + jukka@bertsmith + Bert Smith firm. Delete all clients, matters, property transfers, firms (≠ Bert Smith), council POCs, and all storage PDFs.

**Keep-set (6 users):** zuaan@quantratech.co.za, jukka@conveyclear.co.za, francois@conveyclear.co.za, ops@conveyclear.co.za, services@conveyclear.co.za, jukka@bertsmith.co.za. **Delete** services@testcc.co.za + all clients + 3 non-Bert-Smith firms. Bert Smith firm id = `4651fa0a-3db4-4d0b-a962-d104db589682`.

**FK landmines:** `invoices.matter_id` RESTRICT (delete invoices first) · `matters.client_id` RESTRICT (matters before clients). Good news: `users.client_id` + `users.business_partner_id` are CASCADE → deleting clients/firms auto-removes their logins. `users.auth_user_id` → auth.users = SET NULL → **auth logins need a SEPARATE delete (dashboard, ~9 users)**. Storage: delete via dashboard (matter-documents 98 / transfer-documents 7 / client-documents 6, ~89 MB).

**Transactional wipe (run AFTER a verified backup):**
```sql
BEGIN;
DELETE FROM invoices;
DELETE FROM property_transfers;
DELETE FROM matters;
DELETE FROM clients;
DELETE FROM business_partners WHERE id <> '4651fa0a-3db4-4d0b-a962-d104db589682';
DELETE FROM enquiries;
DELETE FROM council_pocs;
DELETE FROM public.users WHERE email NOT IN (
  'zuaan@quantratech.co.za','jukka@conveyclear.co.za','francois@conveyclear.co.za',
  'ops@conveyclear.co.za','services@conveyclear.co.za','jukka@bertsmith.co.za');
-- review counts (expect users=6, business_partners=1, rest 0), then COMMIT or ROLLBACK
SELECT 'clients' t,count(*) FROM clients UNION ALL SELECT 'matters',count(*) FROM matters
UNION ALL SELECT 'business_partners',count(*) FROM business_partners
UNION ALL SELECT 'users',count(*) FROM users;
COMMIT;
```
Then: Auth dashboard → delete the ~9 dead logins · Storage dashboard → empty the 3 buckets.

**Backup command (kept failing on Docker/SSL — fix was `PGSSLMODE=require`):**
```bash
sudo docker run --rm -e PGPASSWORD='PW' -e PGSSLMODE=require -v "$PWD:/backup" postgres:16 \
  pg_dump -h aws-0-eu-west-1.pooler.supabase.com -p 5432 \
  -U postgres.yhgriqagrhyblhmloctc -d postgres --no-owner --no-privileges \
  -Fc -f /backup/conveyclear-pre-wipe.dump
```
(Docker daemon must be started: `sudo systemctl start docker`. Or just use Pro's backups once upgraded.)

## 2026-07-23 EOD threads (some still open — see priority list above)

Prod `master` = `f976206`. Migrations **041 · 042 · 044 applied**; **043 still NOT applied.** Approval + disapproval feature is BUILT, DEPLOYED, and UI-VERIFIED live (View / Approve / Disapprove-with-reason / grey+red states / activity logging). Working tree clean.

**Open threads, in priority order:**
1. **Eyeball the uploader's bell** — sign in as `Test Services` and confirm the notifications arrived: "Transfer document approved" (from the AS1234 Deed Search I approved) and "Document not approved: Test rejection…" (from the matter doc I disapproved). Only thing in the approval feature not yet seen with human eyes; the code path is confirmed running.
2. **039 stranded-mirror cleanup** — SQL handed to Zewn; **run the PREVIEW select first** (lists the rows; deletes nothing — it only flips stale mirror copies `current`→`superseded` so they drop off the transfer view, kept for audit). Paste the preview result to sanity-check before the UPDATE. SQL at the bottom of `039_sync_supersede_mirror.sql`.
3. **Firm-admin flag — DEFERRED, not a launch blocker.** It's set on `test.runner@test.com` (Demo firm), so nobody can exercise `/partner/firm` (banking/trust) against a real firm. Only flip it (`UPDATE users SET is_firm_admin=true WHERE email='dryrun.partner@sterlinghayes.co.za'`) if you want to test/demo the banking page or a real firm needs to enter trust-account details. Target depends on goal: Sterling & Hayes for dry-run testing, a Batsmith user if Batsmith will manage banking.
4. **Still open from before:** 🔴 legacy Supabase `service_role` JWT still live (disable in dashboard — Batsmith have accounts now), chase Jukka (account approval + feedback, both late + gating), Document Remove never clicked, decide when to apply **043** (needs: staff upload hidden from a client proven → then flip).

**043 is the real finish line** — the gate does nothing until it's applied. Sequence before flipping: prove a pending/disapproved staff upload is invisible to a client account, confirm `SELECT count(*) FROM documents WHERE approved_at IS NULL AND disapproved_at IS NULL` = 0, then apply 043.

## 🔧 2026-07-23 — approvals page fixed + pending badge shipped — `master` = `45a075e`

Two branches merged to master (Zewn, via `!`), both remotes, Vercel auto-deploy triggered. Files disjoint, `--ff-only` + clean merge.

- **🐛 `/admin/approvals` was broken on EVERY visit** — rendered the load-failure banner with `column matters_1.reference does not exist`. **NOT migration 042** (which is applied + verified) — the banner's "042 not applied" guess was misleading. Real cause: the matter-side query embedded `matters(reference)`, but `matters` has no `reference` column — only `property_transfers` does. Fixed to `matters(title)` (matters' human label, used by every other matter select). Transfer half was already correct. Branch `fix/approvals-matter-embed` (`fe77806`).
- **🆕 "Awaiting approval" badge** — Zewn uploaded as a services user and the doc appeared with **no indication it was held**. Confirmed the mechanics: 042's trigger DID stamp it pending (`approved_at IS NULL`), but (a) 043 isn't applied so nothing hides it, and (b) **no doc view selected or showed `approved_at`** — held docs rendered identical to released ones. Added an amber "Awaiting approval" badge on the admin matter doc rows + transfer doc rows, **staff/admin-only** (`canManage`), so the partner firm never sees the internal review state. `MatterDocument`/`TransferDocument` gained `approved_at`; both transfer pages already `select("*")`. Branch `feature/pending-approval-badge` (`245ece7`).
- **✅ The services-role upload IS the trigger-proof** RESUME_HERE wanted — it's pending in the DB. Remaining behavioural check (pending Zewn's click): doc shows in `/admin/approvals` + carries the badge on its matter; approving it clears both → proves approve route + propagate trigger. THEN apply 043.
- **⚠️ Watch during the approve test:** confirm a REUSED (borrowed vault/transfer) doc does NOT land in the queue — if the trigger flags an already-vetted reuse as pending, that's a bug to fix before 043.
- **📌 Banner text left as-is** (still says "042 not applied") — it also prints the raw error below it, which is what enabled the diagnosis. Soften post-launch.

## ✅ 2026-07-23 (later) — document disapproval + View + uploader notifications SHIPPED & VERIFIED LIVE — `master` = `f976206`, migration 044 applied

Zewn's follow-up ask, built + deployed + smoke-tested by driving his logged-in Chrome. **Migration 044 applied by Zewn BEFORE the merge** (correct order — the app now queries `disapproved_at`). Branch `feature/doc-disapproval` (`f976206`).

**What shipped:**
- **Disapprove-with-reason** on the approvals queue — inline required reason box → confirm. New routes `api/{documents,transfer-documents}/[id]/disapprove` (admin-only, act only on a still-pending row). Queue now excludes disapproved rows.
- **View** button per row (signed 5-min URL) so the reviewer can open the file before deciding. `ReviewDocActions` replaced `ApproveDocButton` (View + Approve + Disapprove).
- **Uploader notifications** — in-app bell on BOTH approve and disapprove (`notifyUsers`, best-effort). Approve → "Document approved"; disapprove → "Document not approved. Reason: …". Recipient = `documents.uploaded_by_user_id` (matter) / `transfer_documents.uploaded_by` (transfer).
- **Grey / red states** on the admin matter + transfer doc lists (staff/admin only): pending row **greyed**; disapproved row shows a red **"Not approved"** badge with the reason on hover.
- **Migration 044** (`044_document_disapproval.sql`) — `disapproved_at/by/reason` on both doc tables + a propagate trigger mirroring a matter disapproval onto its transfer copy. INERT for visibility (043 gates on `approved_at`, which a disapproved row leaves NULL), safe any deploy order.

**✅ Verified live (drove Zewn's Chrome):** approvals page loads clean (no error banner) → View/Disapprove/Approve all present → clicked Disapprove on the pending `Other — 2026-07-23.pdf` test doc, typed a reason, confirmed → doc left the queue → matter now shows red **"NOT APPROVED"** with the reason on hover → **Internal Activity Feed logged** "Document not approved: … — <reason>" by Super Admin (proves the handler ran through to the notify call).

**✅ Approve + View now verified too (2nd test doc, a transfer-level Deed Search on AS1234):** View opened a valid signed `transfer-documents` URL; Approve cleared it from the queue; `property_transfers(reference)` embed showed AS1234. **⏳ Only the uploader's bell is unseen** — code path confirmed (activity logs immediately before the notify in the same handler), but to SEE it, sign in as `Test Services`.

**📌 Reminder:** 043 still unapplied, so a disapproved (or pending) doc is still technically visible to client/partner until 043 flips the gate — the disapprove feature records/notifies/greys, but actual HIDING is 043's job.

## ⏭️ TODAY — Thursday 23 July, Batsmith launch day

1. **Prove the approval trigger** (staff-role upload → `/admin/approvals`), then apply **043**. Detail in the deploy section below.
2. **🔴 Legacy Supabase `service_role` JWT is STILL LIVE** — rotation was due 22 July and did not happen. Bypasses RLS on prod, and Batsmith get accounts today. Dashboard → Settings → API Keys → Legacy API keys → **Disable**. The app reads only the new-format keys, so this should be a no-op.
3. **039's one-off cleanup has still never been run** — stranded mirrors on AS1234. Self-contained SQL at the bottom of `039_sync_supersede_mirror.sql`.
4. **Firm-admin flag is on the wrong firm.** `UPDATE users SET is_firm_admin = true WHERE email = 'dryrun.partner@sterlinghayes.co.za';` (currently only on `test.runner@test.com`, which is in the placeholder "Demo" firm).
5. **Document Remove has still never been clicked** — logic audited and sound, but unexercised. Test on a *reused* doc.
6. **Chase Jukka** — Batsmith account-creation approval + his feedback were due Wednesday morning and are now late. Both gate the launch. Also his council-pack merge order against real demo docs.
7. **Do NOT build the quote/invoice acceptance feature** without confirming with Jukka first — the notes call it an aligned decision, the Details section calls it "Future Feature Planning", and there is no transcript to settle it.

## 🔔 2026-07-22 — Monday's meeting notes ARE IN (read + logged). Batsmith launches THURSDAY 23 July.

Notes live in **Google Drive, not on disk** — doc `Portal Bi-Weekly Meeting 1 – 2026/07/20 16:14 SAST` (the `16:00` doc is empty, ignore it). **Search Drive, not the filesystem.**

**⚠️ NO TRANSCRIPT EXISTS** (Google failed to produce one). The [[ai-meeting-notes-verify]] retraction diff — which caught 3 real errors in Meeting 1's notes — **could not be run.** Treat the Decisions list as a claim, not a record.

**Decisions, graded against the notes' own Details section + the repo:**
1. **Transfers locked to one firm** — corroborated, already built + enforced. No action.
2. **2FA stays OFF until external launch** — corroborated. ⚠️ **"Security finalised by Thursday" therefore does NOT mean enabling MFA.** Answers the open `FORCE_STAFF_MFA` scope question: leave off for Batsmith.
3. **Client quote/invoice approval section** — 🚩 **do not build yet.** Decisions calls it aligned but Details files it under *"Future Feature Planning — Quotations"* (Jukka suggesting, Zewn saying it's feasible). New scope one day before launch. Confirm with Jukka first.

**🐛 Top open bug — transfer-doc naming, root-caused 07-22.** Deed searches / transfer letters don't get the property name because **the naming code is never called on transfer-level uploads**, not because it fails to resolve. `canonicalDocumentName` is imported only by `api/onboard/submit` + `api/documents/confirm` (both matter-level); `api/transfer-documents/confirm/route.ts:80` writes the raw `body.file_name`. Fix needs a **transfer-level subject resolver** (property off `property_transfers`) — `canonicalDocumentName` takes a `matterId` and a transfer document has none.

**Waiting on Jukka (was due Wednesday morning, 22 July):** feedback + approval to create Batsmith accounts, both blocking Thursday. Also his council-pack merge-order verification against real demo docs.

**"Resolve Admin Assignment" is only partly unbuilt** — flag + `/partner/firm` exist (037 applied); only the assign-admin UI in edit-firm is missing.

### 🚀 DEPLOYED 2026-07-22 — `master` = `d682482` — migrations 041 + 042 applied, **043 NOT applied**

**▶ RESUME HERE TOMORROW (23 July, Batsmith launch day).** Everything below is live in prod except the gate itself, which is installed but deliberately not enforcing.

**THE ONE THING TO DO FIRST:** upload a document as a **staff-role** user (`staff_ops` / `staff_services` / `staff_delivery`) and check it appears in **/admin/approvals**. That proves `set_document_approval` actually fires — the only thing still unverified. **Zero risk right now**: with 043 unapplied, pending documents remain visible to everyone. Then re-check pending = 0 and apply 043.

⚠️ **Do not test this from an admin account.** Admin uploads auto-approve by design and will never reach the queue — correct behaviour that looks exactly like a broken trigger.

| Merged in | Commit | Migration | Status |
|---|---|---|---|
| `feature/transfer-doc-naming` | `eda24ae` | 041 | ✅ applied · live |
| `feature/staff-upload-approval` | `7c27986` | 042 ✅ applied · **043 pending** | gate installed, NOT enforcing |

**Deploy verified:** `/admin/approvals` went **404 → 307** (route exists only in this batch — cheap deploy fingerprint, same trick as 07-20). Regression sweep of 7 routes all 307, no 500s. Post-deploy data probe unchanged: documents 108/0 pending, transfer_documents 13/0, both FK embed hints 200 OK.

**✅ 042 VERIFIED AGAINST PROD (read-only probe, 2026-07-22):** all five columns present; backfill clean (**documents 108 total / 0 pending**, **transfer_documents 13 / 0**); **both FK embed hints confirmed correct** by issuing the actual query `/admin/approvals` uses — so the earlier "these names are a guess" risk is closed. 042 is a single `BEGIN`/`COMMIT`, so the columns existing proves the triggers and the replaced `sync_document_to_transfer` committed too.

**⚠️ Verified as SCHEMA, not as BEHAVIOUR.** No document has been uploaded since 042 landed, so `set_document_approval` has never actually fired. The trigger is inferred correct from the transaction committing, not observed.

**🔴 DO NOT APPLY 043 UNTIL THE APP IS DEPLOYED.** `/admin/approvals` does not exist in production yet; applying 043 first hides pending documents with no way to release them.

**Useful property: while 043 is unapplied the whole flow can be exercised at ZERO risk** — a pending document is still visible to everyone, so the trigger and the queue can be tested before anything is gated.

```
1. merge test/approval-and-naming → master, deploy
2. upload a doc as staff_ops → appears in /admin/approvals      (proves the trigger)
3. approve it → queue empties                                   (proves the route)
4. re-check pending count = 0
5. apply 043
6. re-test: client cannot see a pending doc; approving reveals it
   on the matter AND on the property transfer                   (proves the mirror)
```

Step 6's transfer half is the one that matters — it is the bypass the whole design turns on.

### 🆕 REQUIREMENT (Zewn, 2026-07-22) — staff-upload approval gate

**Jukka's ask:** documents uploaded by ConveyClear ops / services / runners must be **approved by an admin before clients and business partners can see them**. He wants to be sure his employees uploaded the *correct* document before it goes out. Needs a review/approve queue in the **admin** dashboard.

**Roles map cleanly:** uploaders = `staff_services` · `staff_ops` · `staff_delivery` (runners). Approvers = `ADMIN_ROLES` (`admin` + `super_admin`). Both already exist in `types/index.ts` (migration 013) — no role changes needed.

**Design findings (from reading the RLS, 2026-07-22):**
- ✅ **One clean choke point.** `documents_read_scoped` (006) is the SELECT policy every non-staff reader goes through: `USING (can_access_matter(matter_id))`. `documents_staff_all` is a **separate `FOR ALL` policy**, so staff keep full visibility — the uploading runner still sees their own file and the admin sees the pending queue. The gate is `AND approved` on `documents_read_scoped` alone.
- 🚫 **Do NOT put the gate in `can_access_matter`.** It backs matters, matter_parties, document_requests, properties and the storage.objects policies — gating there hides the matter, not the document.
- 🚩 **The sync creates a bypass — this is the part that is easy to miss.** `transfer_documents_read` (034) gates on `can_access_transfer` = staff **+ the owning firm**, and migration **038's trigger mirrors a matter upload to its transfer on INSERT, immediately**. So an unapproved staff upload surfaces on the property transfer where the partner firm reads it, *around* the documents gate. The mirror must inherit approval state, or not be created until approval. **Gating `documents` alone is not sufficient.**
- ⚠️ **Row gate, not an object lock.** The storage policies (`015:65`, `034:108`) authorise on the path prefix, not the row — hiding the row does not revoke the object. Paths carry a random UUID and the client never saw it, so not a practical leak, but describe it honestly.

**Deploy-order-safe shape (this project has been bitten by deploy-order gaps three sessions running):** two steps.
1. Migration adds `approved_at` / `approved_by`, **backfills every existing row as approved**, policy UNCHANGED. Inert, safe in either deploy order, nothing disappears.
2. Second migration flips `documents_read_scoped` (+ the transfer mirror) once the admin queue UI is live.

**Scope call: NOT for the Thursday 23 July Batsmith launch** — an RLS visibility change across two tables plus a trigger, on client-trial launch day. During a supervised trial Jukka is reviewing anyway; the gate earns its keep when it scales past him.

## 🚀 WAYPOINT — end of 2026-07-20. Deployed twice. Zewn returns 21 July WITH MEETING NOTES.

**`master` = `2fcc0ff` = PRODUCTION** (was `b99f44e` at the start of the day). github + origin(Gitea) + local all match. Working tree clean.

**Migrations 037 · 038 · 039 · 040 ALL APPLIED.** None outstanding.

**Nine branches shipped in two deploys:** audit-quickwins · onboard-hardening · section-colors · partner-transfers · council-pack · firm-admin · two-way-sync · document-replace-remove · doc-naming-and-transfer-nav.

**Zewn had a meeting on the evening of 20 July and will come back with notes on 21 July.** ⚠️ When those notes arrive, apply [[ai-meeting-notes-verify]] — AI meeting notes on this project have flattened retractions into decisions and lost "already done" items in BOTH previous meetings. Diff the Decisions list against the transcript before building anything.

### ▶ FIRST THINGS TO PICK UP

1. **Run 039's one-off cleanup — NOT yet done.** The migration installed a trigger that stops *future* replacements leaving both copies on a transfer, but it cannot fix what is already stranded. As of end of day transfer AS1234 showed **6 current / 0 superseded**, including Zewn's replaced Peter van der Merwe certified ID. The preview + update pair is at the bottom of `convey-clear-app/supabase/migrations/039_sync_supersede_mirror.sql`.
2. **Document Remove has never been clicked, and it deletes storage objects.** The case that matters is removing a document that was REUSED from a transfer or the client vault — it must only detach. A mistake there surfaces as a file blanked across several matters, not as an error message.
3. **Firm-admin testing is on the wrong firm.** `is_firm_admin` is set on `test.runner@test.com`, which belongs to the placeholder **"Demo"** firm. To test against real data: `UPDATE users SET is_firm_admin = true WHERE email = 'dryrun.partner@sterlinghayes.co.za';`

### Confirmed working on live
Two-way sync fired on real uploads (three mirrors on AS1234 at 11:31/11:34/11:36). The cross-firm cleanup ran clean (`UPDATE 4`).

### Documents produced today
- `ConveyClear_Action_Checklist_2026-07-20.pdf` — Zewn's do/check list, kept current through the day.
- `ConveyClear_Update_2026-07-20.pdf` — 5pp plain-language changes note. **Written CLIENT-SAFE**: MFA-being-off, key rotation and the cross-firm cleanup are deliberately excluded in case it goes to Jukka. An internal annex was offered and not yet written.

### Hard-won lessons from today, worth not relearning
- **Check which BUILD is serving a request before debugging a feature that "doesn't work".** An hour went into a sync that was working fine — the code simply was not deployed to the environment being clicked.
- **A de-dup guard keyed on the file cannot see a replacement.** Different file, different path, legitimately a different row — the *lifecycle* has to be handled separately from the duplicate guard (that is what 039 is).
- **Hand over self-contained SQL, never placeholders.** A `<ids from above>` in the same block as its SELECT got pasted whole and threw `42601`.
- **Ownership of a document is decided by storage PATH, not `transfer_document_id`** — since the sync landed, a matter's own upload carries that column too.

### Decided since Meeting 2
- **Two-way sync = OPTION B, everything syncs**, including person-scoped FICA docs. Safe only because **a property transfer belongs to exactly ONE firm** — two firms on one property means two independent transfers, one each (Zewn's model, 2026-07-20). Built and enforced; see the session log.
- **Council pack order resolved** — kept `deed_search` (prod has 13 of them; the notes' Details section just dropped it), and placed `council_account_statement` next to the clearance figures as the "existing account".
- **2FA: "for all"** — but note **Google sign-in is NOT a bypass** (the gate reads AAL, not the provider). MFA is simply OFF right now. Scope decision staff-vs-everyone still open.
- **Key rotation → Wednesday 22 July**, deliberately out of scope until then.

### Pending Zewn (all in the checklist PDF)
1. Unlink the **four cross-firm matters** (Bert Smith matters inside Sterling & Hayes transfers, `AS1234` + `zz-dry-02`) — before sync is used on real data. Nothing leaks retroactively; the sync only fires on new uploads.
2. `UPDATE users SET is_firm_admin = true` for a test user — nobody has it, so `/partner/firm` is invisible.
3. Apply **`038_document_sync_trigger.sql`** (in `convey-clear-app/supabase/migrations/`) — puts the sync in the DB so n8n's direct `INSERT INTO documents` is covered too. Safe in either deploy order, no backfill, no code change.
4. Decide 2FA scope → set `FORCE_STAFF_MFA`.
5. Merge `test/meeting2-all` → `master` and push (his, via `!`).

**Migration 037 IS applied** (verified against prod: `users.is_firm_admin`, `firm_banking`, `firm_bp_numbers` all live). **038 is written but NOT applied and NOT executed anywhere** — no local Postgres, so it is reasoned through, not run.

## ✅ DEPLOYED TO PROD 2026-07-16 (pre-meeting) — master = `b99f44e`

Migration **036 applied** (Zewn), `feature/meeting1-tier1` merged + pushed, **smoke-tested live by clicking**: dup guard (same note 2× → one row), create-matter-inside-transfer (chips, inherited property, transfer-feed entry), From-transfer reuse (2 clicks → one document), renames, vault padlock. 036's repair collapsed the old `A4 - 2.pdf` duplicate. Hotfix `b99f44e`: the vault border classes lost to Card's `border-gray-200` (cn() is a join, not tailwind-merge) — forced with `!important`.

**Old duplicate FEED rows still in prod** (036 stops new ones only) — `cleanup_dupe_activities.sql`, preview then delete, Zewn's call.

## ⏳ SIX BRANCHES ON GITHUB — merge/apply map (all off master `b99f44e`)

Suggested merge order: **quickwins → onboard-hardening → section-colors → partner-transfers → council-pack → firm-admin**. Files are mostly disjoint. Shared files to watch: `components/ui/Card.tsx` (only section-colors touches it — an `accent` rewrite); `admin/matters/[id]/page.tsx` (council-pack adds the CouncilPackButton — no other branch edits that region); `api/onboard/submit` + `api/fica/capture` (only onboard-hardening).

| Branch | Commit | Migration | Deploy risk | Notes |
|---|---|---|---|---|
| `fix/audit-quickwins` | `79269ab` | none | none | Review's safe batch (`used_at` fix, legacy routes deleted, role-import, captcha guard, n8n timeout, `.claude` untracked). **Merge any time.** |
| `fix/onboard-hardening` | `33810b0` | none | none | **Data-loss fixes — merge before Batsmith.** Onboard resubmit no longer nulls staff-entered fields (esp. municipal creds); consent timestamps only stamped-not-nulled (onboard + fica/capture); `matter_party_id` validated against the matter. |
| `feature/section-colors` | `ff4efb9` | none | none | **Jukka CONFIRMED the mapping in Meeting 2** (green clients · purple firms · sky services · navy admin). No longer a proposal. Eyeball then merge. Firm-admin shade still unspecified. |
| `feature/partner-transfers` | `312301b` | none | low | Partners create + populate their own transfers. **Thursday-critical** (Jukka's demo blocker). No migration. |
| `feature/council-pack` | `a8df644` | none | low | Merge a matter's docs into one council PDF (staff button on matter page). Engine verified offline. ⚠️ **The packing ORDER is only partly confirmed** — edit `COUNCIL_PACK_ORDER` in `lib/council-pack.ts` once Jukka gives the exact order (COC-last is settled; the middle isn't). |
| `feature/firm-admin` | `d5852d7` | **037** | **apply 037 first** | Firm-admin role (flag) + banking/trust/BP-number tables. If code ships before 037, `/partner/firm` + nav item error for firm-admins. ⚠️ Banking field set is a PROPOSAL. Set `is_firm_admin` via SQL for the demo (037 footer). |
| `feature/meeting1-tier1` | merged → prod | 036 (applied) | — | Already in prod. |

**Migration 037 (`037_firm_admin.sql`) is NOT applied.** Apply before merging firm-admin. No other unmerged branch needs a migration.

## 🟥 MEETING 2 (2026-07-16) — open questions that BLOCK remaining builds

The Gemini notes have the same disease as Meeting 1 (retractions/omissions flattened). Verified against them:

1. **PDF merge order contradicts ITSELF in the notes** — Decisions (§28) lists "deed search" as #2; Details (§68) omits it and says "K figures + existing account" instead. **COC is confirmed last, seller docs second-last, buyer docs early** (this DOES resolve the Meeting-1 open question). But the middle is ambiguous — get the exact order before building the merge feature. **Blocks PDF merge.**
2. **Two-way document sync A/B/C — never resolved.** Meeting-1's blocked decision appears only as "sync functionalities" in a next-step. No answer on which docs sync up / whether one firm works both sides. **Blocks sync build.**
3. **2FA scope** — notes say "all ConveyClear members" (§72, = staff) in one place, "all platform users" (§48, = partners too?) in another. What's built = `FORCE_STAFF_MFA` (staff only). Confirm before forcing partners.
4. **Google Maps** — greenlit but needs an API key + billing (Zewn to set up; cost-monitor in prod). SPXD Maps/Places wiring is reusable prior art.
5. **Firm-admin banking fields** — confirm the exact field set with Jukka (see 037 header) before firms enter real account data.

**Deadline moved up:** functionality + security "finalised by Thursday" (23 July), Batsmith trial next week, in-person Thursday. Realistically Thursday-deliverable: colours (done), 2FA-on (config flip), partner-transfers (done). Maps / firm-admin-full / Gantt / merge are during-trial, not Thursday.

## ▶ START HERE — Bi-Weekly Meeting 1 backlog

**Everything else is MERGED TO PROD** (`master` = `801da91`, migrations 026–035 all applied, live on `portal.conveyclear.co.za`). Prod is not yet in client use, so it doubles as the test environment.

**The work now is the meeting backlog: `BACKLOG_MEETING_2026-07-13.md`.** Read it before anything else — **Gemini's meeting notes are wrong in three places** and one "next step" is already built. The corrections table is at the top.

**Tier 1 (Jukka will poke these on Thursday):**
0. ✅ **DONE on `feature/meeting1-tier1` (2026-07-14)** — duplicate feed posts · Activity Feed → **Internal Activity Feed** · Enquiries → **Matter Enquiries** · FICA vault thick blue border + padlock. Needs migration 036 + a click-through; see the top of this file.
1. **🔴 Two-way document sync — ⏸️ BLOCKED ON ZEWN'S DECISION, do not build yet.** PROMISED to Jukka; 034 built transfer → matter only. **The tension:** a transfer is readable by its owning attorney firm AND spans both sides of the deal — so syncing a person's FICA doc upward makes the **seller's certified ID reachable by the buyer's attorneys**. Three options (A: property docs only — recommended; B: everything, as promised, with a real cross-party exposure; C: per-upload checkbox) are written up in full in **`BACKLOG_MEETING_2026-07-13.md`**. Sanity-check the premise first: if one firm handles both sides in practice, B becomes defensible.
   - **Two open questions to put to people:** (a) **Zewn** — pick A/B/C. (b) **Jukka** — the merge order contradicts itself in the transcript: "purchaser details at the very last" *vs* "very last is electrical COC". Everything before that is settled.
2. ~~**🐛 Duplicate activity-feed posts**~~ — **FIXED (2026-07-14, needs 036 + testing).** There were **two** causes, not one. (a) The double-click race, as diagnosed — now stopped by `components/ui/SubmitButton` (disabled in flight) plus an advisory-lock idempotency guard in the DB (`log_matter_activity` / `log_transfer_activity`, the only write path, `lib/activity.ts`). Duplicate **notifications** are suppressed too, via the `deduped` flag. (b) **The reused-document duplicate was never a race at all**: the intake renders "From transfer" twice for the same document (the panel, matter-level; and the slot row, party-scoped), and the attach route's dedupe keyed on the **party**, so the second click read as a different slot and inserted a second row for the same file. Migration 030 missed it because it exempts type `'other'`, which is what `A4 - 2.pdf` was. Now keyed on the matter alone + a unique index.
3. ~~**Create a matter from inside a property transfer**~~ — **DONE (2026-07-14).** Disclosure on the transfer detail page: linked on creation, inherits the transfer's property + municipality, offers seller/buyer as one-click client chips, mirrors onto the transfer feed. `POST /api/admin/matters` takes `transfer_id` (resolved through the caller's own RLS). Linking an existing matter stays — a PRC opened before anyone knew it belonged here still has to be attachable. **No migration.**
4. ~~Renames~~ — **DONE.** Staff matter page now reads **Internal Activity Feed** (with a padlock + a line saying the client and the firm never see it); the shared thread reads **Matter Enquiries**. Kept the codebase's British *Enquiries* spelling — Jukka says "inquiries", every route/table/component here says `enquir-`. **Flag it to him**; if he wants the American spelling on screen it is a label-only change, not a rename of the data.
5. ~~**FICA vault: thick blue border + lock icon**~~ — **DONE.** `border-2 border-[#1B2E6B]` on the vault card + a padlock chip in place of the shield.

**Tier 2 — also DONE (2026-07-14), no migration:**
- ~~#6 + #7 search in the client/matter pickers~~ — new `components/ui/SearchSelect.tsx`, applied to the transfer form's four party dropdowns, the matter picker, and the client picker.
- ~~#8 rename PDFs on transfer documents~~ — inline pencil, same as the matter side. The rename **follows the file onto every matter that reused it**, except rows someone deliberately renamed there.

**Still open in Tier 2–3:** #9 matter enquiries on the transfer feed · #10 PDF merge for council (**blocked** — Jukka's merge order contradicts itself) · #11 EC/AC contact roles (schema change) · #13 colour coding · #14 estate-agent portal.

**✅ Verified, NOT built — Tier 3 #12 "firm-level matter visibility" ALREADY WORKS.** `can_access_matter` (migration **014**, superseding 006) matches on `m.business_partner_id = app_user_partner_id()`, and that is the **firm**, not the user — so any employee of a firm already sees all of that firm's matters and nothing outside. That is exactly Melinda-covers-for-Leanne. **Tell Jukka it's done; do not build it.**

---

## Historical (pre-merge) — kept for context

> ⚠️ In `MEETING_PRIORITISATION_2026-07-06.md` the ✅ column means **"IN scope for 20 Aug"**, not "done".
> Every row reads ✅. Trust THIS file + `git log` for what is actually built.

---

## Where we are in the plan

- **Target:** internal launch **2026-08-20** (Thursday; moved from 11 Aug at Meeting 2). Foundation-first. Go/no-go checkpoint **Thu 6 Aug**. Then ~4wk testing → external A&A launch ~mid-Sep.
- Full plan: `ROADMAP_TO_GOLIVE_2026-07-06.md` · feature register: `MEETING_PRIORITISATION_2026-07-06.md` · Jukka PDFs: `ConveyClear_Roadmap.pdf` + `ConveyClear_Feature_Prioritisation.pdf`.

## Git state

- Branch **`feature/sprint-1`** (in `convey-clear-app/`), **19 commits ahead of `master`**, working tree **clean**.
- Commits through **`706fbdb`** are pushed to both remotes. **Local-only (6):** `1a7d697` firms admin · `b6a57a8` firm search · `33edc41` doc de-dup · `dee210e` forced password change · `def5b9d` forced staff MFA (dark) · `a11f922` partner not-available.
- **Four migrations pending: 028 · 029 · 030 · 031.** They touch different tables — any order, but all four before testing.
  - **029** — `b6a57a8`'s matters-search `.or()` references `firm_name`/`firm_abbrev`. Until 029 runs, **any matters-list search 400s.**
  - **031** — the middleware selects `must_change_password`. It falls back to a role-only select if the column is missing, **so deploying ahead of 031 no longer breaks sign-in** — but the gate simply won't fire until it's applied.
  - **028** — `/account` selects `notify_email`.
  - **030** — no code depends on the *index*, but the app writes `document_status='superseded'`, which the old CHECK constraint rejects. **Until 030 runs, re-uploading into a filled slot fails.**
- `master` = prod at `fd3145b` (Vercel auto-deploys it); **only Zewn merges to master.**
- ⚠️ **gitea `origin/master` is stale** at `399f3f5` (an ancestor of `fd3145b`) — github is the current one. Harmless, but don't read gitea as a mirror of prod.
- Vercel **preview deployments sit behind Deployment Protection** — every request 302s to `vercel.com/sso-api`, so `curl` sees a login page and *every path looks 200*. Smoke-test previews in a logged-in browser.

## ✅ Migrations 024 + 025 APPLIED (verified live 2026-07-10)

Both are in prod Supabase. Verified via the REST API + the migration's own transaction structure:
- `024` — `contact_first_name`/`contact_last_name` exist; backfill ran (11/11 legacy `contact_name` rows populated).
- `025` — `client_documents` table, `documents.client_document_id`, `matter_parties.client_id`, and the private
  `client-documents` bucket (public=false, 50 MB) all exist. The bucket INSERT and both `clientdocs_*`
  `storage.objects` policies sit inside the same `BEGIN`/`COMMIT` (lines 28–101), so the bucket's existence
  proves the policies committed. The `postgres`-role fallback was NOT needed.

**Next migration number = 036** (026–035 written; 026–031 applied 2026-07-13, **032 · 033 · 034 · 035 pending**).

Apply in order — 034 depends on `property_transfers` (026, applied), 035 on 034's table existing is not required but its CHECK fix matters.

- **032** — FICA vault v2 (status/expiry/verified/versioning on `client_documents`). Without it the client-profile vault reads columns that don't exist and renders **empty**.
- **033** — in-place FICA consent provenance (`consent_events.captured_by` / `capture_method` / `note` + a CHECK). Without it, **saving in-place consent fails**.
- **034** — transfer-level documents (`transfer_documents` + `transfer-documents` bucket + `documents.transfer_document_id`). Without it the transfer detail page's document card renders empty and "From transfer" never appears on the intake.
- **035** — transfer feed (`transfer_activities`) **+ a bug fix**: widens the `matter_activities.activity_type` CHECK to legalise `document_status` and `fica_capture`, which the app was already writing and which Postgres was **silently rejecting** (23514 swallowed by an unchecked `await`). Until 035 is applied, the partner "not available" toggle and in-place FICA still work but write **no audit-feed entry**.

## 🔴🔴 DO THIS FIRST — the leaked `service_role` key is STILL LIVE

Supabase → Project Settings → API Keys → **Legacy API keys → Disable**.

The live keys are already the new `sb_publishable_…` / `sb_secret_…` format, so "rotate keys" has *looked* done since 06-18. It isn't. The pair that leaked in chat was the **legacy `eyJ…` JWTs**, and adopting new-format keys **does not revoke them** — Supabase keeps legacy keys valid until explicitly disabled. The old `service_role` JWT bypasses RLS on production *today*. The app reads only the new keys, so disabling should be a no-op. Detail: `SECURITY.md` §2.5.

## 🔴 BLOCKING — waiting on Zewn (see `SPRINT1_TODO_ZEWN.md`)

1. ✅ 026 + 027 applied and verified (2026-07-10).
2. **Apply `028_email_notifications.sql`** before the email commit merges — `/account` selects `notify_email`. Inert until Resend keys exist, so applying early is safe.
3. **Run `verify_rls_026_027.sql`** (not a migration) — proves the 026/027 RLS properties. Every row must read `pass = t`.
4. **Chase Resend + DNS.** The email *code* is done and dark; only `RESEND_API_KEY` + `EMAIL_FROM` are missing. **Who owns the DNS?** — still unanswered, still on someone else's clock.
5. Merge to master is yours (`!` prefix).

## ✅ Done on `feature/sprint-1` (all tsc + `next build` green)

| Commit | What |
|---|---|
| `0fab845` | Bug #1 — clear stale council decision on phase/stage revert |
| `9e26648` | Bug #2 — onboard-link error UX + "request a fresh link" |
| `a8c9123` | #6 — business contact-person → first/surname split (migration 024 ✅ applied) |
| `57f852c` `15eac1c` | Intake spine — service-aware doc checklist + upload-in-place (staff + partner) |
| `c8ef88b` | Rates-account-# field (service_data, no migration) |
| `438ecf2` | Client doc view/download |
| `5dce9fb` `edb2489` `e5ef581` | **FICA vault v1** — backend (migration 025 ✅ applied + APIs) + client library + reuse picker |
| `baebcc7` | **Property Transfers hub (MVP)** — migration **026 ⏳ NOT applied** + admin/partner UI |
| `5256154` | **Enquiries-on-matter #3** — migration **027 ✅ applied**; shared thread on all 3 portals |
| `706fbdb` | **Phase emails #5 + auto client-login** — migration **028 ⏳ NOT applied**; ships DARK behind `RESEND_API_KEY` + `EMAIL_FROM` |
| `1a7d697` | **Partner firms admin** — list/detail/create/edit + `PATCH /api/admin/partners`. **No migration.** Unblocks firm `abbreviation` capture |
| `b6a57a8` | **Firm-searchable matters** — matters search matches firm name + code. Migration **029 ⏳ NOT applied** (denorm cache `matters.firm_name`/`firm_abbrev` + sync triggers) |
| `33edc41` | **Doc de-duplication** — migration **030 ⏳**. One current doc per **(matter, party, type)** slot; a re-upload **supersedes** rather than stacking. Also deletes a dead pre-rewrite upload chain |
| `dee210e` | **Forced password change** — migration **031 ⏳**. A staff-issued temp password now holds the account at `/auth/change-password` until it sets its own |
| `def5b9d` | **Forced staff 2FA** — restored from `f42978d`, **ships OFF** behind `FORCE_STAFF_MFA=true`. No migration |
| `a11f922` | **Partner "not available" toggle** — completes the intake spine. No migration |

**Sprint 1 + Sprint 2 = COMPLETE.** So is everything that was left on the "next" list.

**Launch scope now: the security gate + full E2E QA.** Both are Zewn's dashboard config plus a joint pass — **there is no remaining app code in the 20 Aug scope.**

## ⚠️ Built, compiles, but never RUN by a real user

Verified by `tsc` + `next build` + direct PostgREST probes — **not** by anyone clicking:

1. **FICA vault / reuse (025)** — applied, but `client_documents` is still empty (0 rows). The vault upload, the intake **Reuse** button, and mixed-bucket `signedDocUrls` signing have never executed.
2. **Property Transfers (026)** — applied. The FK-hinted embeds were confirmed to resolve (HTTP 200 on the real transfer-detail query, all four hints). UI flows unexercised.
3. **Enquiries #3 (027)** — applied. Guard verified: 6 enquiries, all `partner`, 0 `shared`, **4 carrying a `matter_id`** — exactly the rows the naive grant would have leaked to clients. Run `verify_rls_026_027.sql` to prove it per-role.
4. **Email #5 (028)** — migration not applied; channel is dark by design. Nothing to smoke-test until `RESEND_API_KEY` + `EMAIL_FROM` exist.
5. **Doc de-dup (030)**, **forced password change (031)**, **partner not-available** — all built 2026-07-12, none applied or clicked.
6. **Forced staff MFA** — built but **inert** (`FORCE_STAFF_MFA` unset). Test it by setting the env var locally *before* flipping it in Vercel; it will send every staff account to enrolment.

**PostgREST gotcha to remember:** a table with two FKs into the same target needs an embed hint (`clients!property_transfers_seller_client_id_fkey(...)`). No hint → **300 `PGRST201`**; wrong name → **400 `PGRST200`**. Neither is caught by `tsc` or `next build`.

**The recurring shape of the last three sessions' bugs:** code that compiles perfectly but assumes a column, a constraint value, or an RLS grant that isn't there yet. `tsc` and `next build` cannot see any of it. Before merging anything that touches the DB, ask *"what does this query need that production doesn't have?"* — the matters-search `.or()` (029), the `superseded` status (030), and the middleware's `must_change_password` select (031) were each one deploy away from a live 400.

## ▶ NEXT (pick up here)

**No app code is left in the 20 Aug launch scope.** In order:

1. **Zewn applies 028 · 029 · 030 · 031** (any order, all four).
2. **The big test round** — the 13-flow checklist in `SPRINT1_TODO_ZEWN.md` §2b. Nothing from `baebcc7` onward has ever been clicked by a real user.
3. **Security gate** — legacy-key disable (top of this file), Turnstile secret in Supabase, `FORCE_STAFF_MFA=true` in Vercel + enrol staff. The temp-password half is now **built** (`dee210e`), not config.
4. **Full E2E QA (2d)** — every role × portal × pipeline. Protected; do not compress.

**Carried over, not blocking:**
- **Pipedrive gate** ✅ built in `convey-clear-n8n-modules/CC - Submit Onboarding Docs.json` (a `Has Pipedrive Deal?` IF before "Move Deal to Stage 54", so portal-native matters with a NULL `pipedrive_deal_id` skip the deal-stage PUT instead of firing it at `…/deals/` with an empty id). ⏳ **Zewn must re-import that JSON into n8n on the NUC** — it isn't synced automatically.
- **`drive_file_id` write-back** — wiring + idempotency reviewed and sound, but **unverifiable statically.** `Update Doc Drive ID` reads `$('Prepare Docs').item.{matter_id,dtype}` and Prepare Docs emits one item PER doc; if n8n's paired-item lineage doesn't survive the Google Drive node, every row takes the first doc's `dtype`. Needs a real 2+-doc onboarding submission — check each `documents` row got its **own** `drive_file_id`.
- **Firm abbreviations** — all 4 firms still have `abbreviation` NULL. Set them at `/admin/firms`.

## ⚠️ Vercel previews do not work (found 2026-07-10)

All 7 Vercel env vars are scoped **Production**; `Preview` has none, so every preview build dies at prerender (`@supabase/ssr: Your project's URL and API key are required`). Both previews of this branch are `● Error`. **The standing feature-branch → staging → review gate has never actually run on this project.** Fix + tradeoff in `SPRINT1_TODO_ZEWN.md` §2. Zewn's call so far: smoke-test locally (`npm run dev`, `.env.local` already points at prod Supabase). Real fix = a separate staging Supabase project; bundle that with Jukka's pending Pro upgrade.

## Orientation for a cold start (key paths, `convey-clear-app/src/`)

- Matter detail (staff): `app/admin/matters/[id]/page.tsx` — inline `"use server"` actions (advancePhase/setStage/setOutcome/setRatesAccount); module-scope helpers `matterCtx`, `clearOutcomeIfReverted` (⚠️ the "use server" scoping rule — helpers referenced by actions MUST be module scope).
- Matter detail (partner): `app/partner/matters/[id]/page.tsx` · (client): `app/dashboard/matters/[id]/page.tsx`.
- Pipeline config (source of truth): `lib/pipelines/` + doc matrix `lib/coo-docs.ts` / `lib/prc-docs.ts`.
- In-place intake: `components/matters/InPlaceIntake.tsx` (+ `ReuseVaultDoc`, `StorageUpload`).
- FICA vault: `components/clients/ClientVault.tsx` · APIs `app/api/client-documents/*` · storage `lib/storage.ts` (`signedDocUrls` is bucket-aware).
- Property Transfers: `app/admin/property-transfers/*` · `app/partner/transfers/*` · `components/transfers/*` · card on both matter details = `components/matters/MatterTransferCard.tsx` · API `app/api/admin/property-transfers/{route,link}.ts`.
- Enquiries thread: `lib/enquiries.ts` (`getMatterEnquiries`, `enquiryAuthorLabel`) · `components/enquiries/MatterEnquiries.tsx` (on all 3 matter details) · APIs `app/api/enquiries/{matter,reply}/route.ts`.
- Partner firms: `app/admin/firms/*` · `components/firms/FirmForm.tsx` · API `app/api/admin/partners/route.ts` (POST + PATCH, admin-only; no DELETE). Read is staff, write is admin. The inline quick-create on `/admin/users` still exists and still only sets name/type/email.
- Email: `lib/email.ts` (`emailEnabled`/`sendEmail` — the ONLY outbound path) · `lib/email-templates.ts` · `app/api/email/unsubscribe/route.ts` · fired from `lib/notify.ts` for `type:'phase'` only.
- Document slots: `lib/documents.ts` (`supersedeSlot`, `dedupeSlotBatch`, `isSlotted`) — called by the three live insert paths: `api/documents/confirm`, `api/client-documents/attach`, `api/onboard/submit`. **A 4th writer exists outside the app** — the n8n onboarding-docs flow inserts `documents` rows directly, which is why the rule is also a DB index, not just app code.
- Auth gates (all in `middleware.ts`, in this order): temp-password hold → auth-page bounce → forced staff MFA (`FORCE_STAFF_MFA`) → area guards. Forced change: `app/auth/change-password/page.tsx` + `components/auth/ChangePasswordForm.tsx` (shared with `/account`) + `app/api/auth/change-password/route.ts` — **that route is the only thing that clears `must_change_password`.**
- **Migrations live IN the app repo** (moved into git 2026-08-04): `convey-clear-app/supabase/migrations/NNN_*.sql`, 001-045, applied **MANUALLY** in Supabase or via the pooler — not a `supabase db push` project. Next number = **046**. Verification queries + seeds are separate, in `supabase/scripts/`.
- Verify each change with `npx tsc --noEmit` + `npm run build` (no ESLint config wired). No live DB access from here — migrations are Zewn's to apply.

## Notes / gotchas

- Doc selects: matter pages use explicit column lists — adding a NEW matter column needs it added to the select (that's why rates-# used `service_data`). Party selects use `select("*")` (migration-safe reads). `transfer_id` had to be added to BOTH matter-detail selects.
- **PostgREST embeds need an FK hint when a table has two FKs into the same target** (`clients!property_transfers_seller_client_id_fkey(...)`). Without it PostgREST returns **300 `PGRST201`**; with a wrong name, **400 `PGRST200`**. Neither is caught by tsc or `next build`.
- `documents.uploaded_by` is a role-ish string ("staff"/"attorney"/"client"), not a user id.
- Reused vault docs carry the `client-documents` bucket → all matter views sign via `signedDocUrls` (mixed-bucket), not the old `signedDownloadUrls`.
