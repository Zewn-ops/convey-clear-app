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

**001–045 are applied to production, except 043. 046–053 are NOT applied to production** — they
are the Section 1 redesign work, live on `feature/portal-redesign` only. `053` additionally has
never been applied anywhere, including staging (written 2026-08-07).

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
