# Database migrations

These are the schema migrations for the ConveyClear portal, in apply order.

Until 2026-08-04 they lived in `~/projects/convey-clear/cc-notes and stuff/sql/` (and `.../old/` for
001–003) — outside any git repository and outside the nightly NUC backup. The app code was versioned
while the DDL needed to rebuild the system existed on one laptop. They now live here.

## How they are applied

**Manually — there is no `supabase db push` in this project.** The migration numbering is ours, not
the Supabase CLI's, so the CLI's migration table does not know about any of these. Apply one of two ways:

1. **Supabase SQL editor** (usual route). Paste the file, Run.
   ⚠️ The editor does **not** hold a transaction open between Run clicks. A `BEGIN` with no `COMMIT`
   in the *same execution* is discarded silently — the first run looks like it worked and rolls back.
   Keep `BEGIN` and `COMMIT` in one execution. (Safe either way: if a statement errors the transaction
   is already aborted, so the `COMMIT` degrades to a rollback.)

2. **psql via the pooler**, from the VPS host:

   ```
   psql "postgresql://postgres.yhgriqagrhyblhmloctc:[PASSWORD]@aws-0-eu-west-1.pooler.supabase.com:5432/postgres?sslmode=require"
   ```

   Always the pooler (IPv4). The direct `db.<ref>.supabase.co` host resolves IPv6 only and is
   unreachable from the VPS Docker containers. Pooler user must carry the project ref
   (`postgres.yhgriqagrhyblhmloctc`), not a bare `postgres`. Password lives in
   `/root/.supabase-backup.env` on the VPS — never in this repo.

## Applied state

**001–045 are applied to production, except 043. 046–060 are NOT applied to production** — they
are the Section 1 redesign work, live on `feature/portal-redesign` only.

**`046`–`061` are applied to STAGING.**
`053`–`058` landed 2026-08-11 via `./scripts/staging-bootstrap.sh 053` — six ok, shape verified
against PostgREST afterwards (`transfer_requests`, `signup_requests`,
`transfer_access_grants.expires_at`, `transfer_documents.client_document_id`,
`transfer_documents.visibility`, `properties.client_id/label/…`, `property_transfers.property_id`
all resolve).

🔴 **`060` and `061` must reach production BEFORE the code that reads them.** `060` adds
`properties.active`, which the branch reads on four surfaces (the client and admin property lists,
the property detail page, and the transfer PATCH that deactivates on registration) — deploying the
code first gives a `42703` on every one. `061` is the safer direction (a constraint the app already
satisfies), but keep the pair together. Confirm after applying:

```
curl -s -o /dev/null -w "%{http_code}" \
  "$URL/rest/v1/properties?select=active,deactivated_at&limit=0" \
  -H "apikey: $KEY" -H "Authorization: Bearer $KEY"     # → 200, not 400
```

**`061` is `NOT VALID` on purpose.** All five `transfer_requests` rows predate mandatory references
and every one has a NULL — four approved, one declined, none pending. `NOT VALID` checks every new
INSERT and UPDATE while leaving that history alone; backfilling would mean inventing a file
reference no firm ever supplied. `VALIDATE CONSTRAINT` is available if they are ever backfilled.

⚠️ **Applied is not exercised.** None of `053`–`058` has been driven through the UI yet. The
checks below are still owed:

`058` gives the buyer and seller a read path to transfer documents. It lands **inert** (`visibility`
defaults to `internal`), but the moment staff share something it is the first time a CLIENT can read
a `transfer_documents` row at all. **Verify the negative case on staging before production: pull the
seller's FICA onto a transfer, leave it internal, and confirm the BUYER cannot see it.**

`057` makes `handle_new_user()` refuse a self-signup on a known contact card. **It changes signup
behaviour — verify on staging that a clean email still registers before it goes near production.**

### 🔴 `056` does not create `properties` — it ALTERs it. Read this before prod.

`properties` has existed since `001_schema.sql:245`. The first draft of 056 opened with
`CREATE TABLE IF NOT EXISTS`, so on apply the CREATE was a silent no-op and the next statement failed
`42703`, rolling the migration back. Rewritten as an ALTER on 2026-08-11 (`406d00d`).

The reconciliation was **additive** on Zewn's call: 001's `street_address`, `premises_name`,
`municipality_id` and `property_type` are still there and now **permanently unused**, alongside 056's
`address`, `label`, `municipality`. Both databases held 0 rows, so nothing was lost — but the
duplicate pairs are **debt to clear before this reaches production**, and the merge only stays cheap
while the table is empty. Details in the migration's own header.

Also: 056 does **not** drop `006`'s `properties_read_scoped`. Read access on `properties` is the
**OR** of `can_access_property()` and "anyone who can access a matter pointing at this property".
Kept deliberately — matters have linked to properties since 001.

🔴 **Do not run the `DROP TABLE properties` that the old rollback block suggested.** It would take
the 001 table and `matters.property_id`'s FK with it. The corrected rollback drops columns only.

⚠️ **`055` must be applied before the transfer-request flow works at all** — `/partner/transfers/new`
posts to a table that does not exist yet, and direct partner transfer creation is already disabled
in the route. Until 055 lands, a firm has no way to open a transfer. Apply it in the same window as
disabling the old path, not after. *(Satisfied on staging 2026-08-11; still open for production.)*

⚠️ **The numbering in `~/brain/clients/convey-clear/REDESIGN_SECTION1_PLAN.md` has DRIFTED from
what actually shipped** — its planned `050` (`locations`) was never built, so everything after it
landed one number lower than the plan says:

| Plan says | Actually shipped as |
|---|---|
| 050 `locations` | **never built** — Section 3 still needs it |
| 051 `transfer_parties` | `050_transfer_parties.sql` |
| 052 `transfer_access_grants` | `051_transfer_access_grants.sql` |
| 053 `can_access_transfer()` enforce | `052_transfer_access_enforce.sql` |
| 054 councils hierarchy · 055 compliance columns | not built |

Trust the filenames in this directory, not the plan's table. Next free number = **054**.

`043_upload_approval_enforce.sql` is the enforce half of the staff-upload approval gate. Its
precondition is `SELECT count(*) FROM documents WHERE approved_at IS NULL` = 0 — every pending
document becomes invisible to clients and partner firms the instant it runs. Verify the count at
flip time, not when you last read a note about it. `../scripts/verify_042_before_043.sql` is the check.

## House pattern

**Inert prep first, enforce second — never both in one migration.** 042 (prep) / 043 (enforce) is the
reference pair, and the proposed 046–053 in
`~/brain/clients/convey-clear/REDESIGN_SECTION1_PLAN.md` follow it deliberately. An inert migration
adds structure nothing reads yet, so it can ship and sit; only the enforce migration changes
behaviour, and only after its backfill has been verified row for row.

## `../scripts/`

Not migrations — do not run them in sequence. Verification queries, seeds and demo-reset helpers.
`seed_dryrun_data.sql` and `test_reset_demo_data.sql` write test data: never against production.
