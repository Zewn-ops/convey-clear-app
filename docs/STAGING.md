# Standing up staging

**Why this exists:** Vercel Preview deploys have been broken since 2026-07-13. The five Preview
environment variables are scoped to a single git branch (`feature/sprint-1`), so a preview built from
any other branch gets no Supabase config and dies at prerender with
`@supabase/ssr: Your project's URL and API key are required`. Every Preview row in `vercel ls` has been
● Error for weeks while Production stays ● Ready, which is why nobody noticed: **the standing
"feature branch → staging → review → merge" rule has silently not been running.**

The cheap fix — re-scope the vars to all Preview branches — points every preview at the **production**
database with the service_role key, on URLs that are public unless Deployment Protection is on. That is
worse than no staging. Hence a separate project.

Decided 2026-08-04. This is P0: the multi-entity work in Section 1 changes who can see whose data, in a
system holding real FICA records, while Bert Smith are using it. Proving that safe by testing against
production is not a plan.

---

## 1. Create the project

Supabase dashboard → New project.

| Setting | Value | Why |
|---|---|---|
| Name | `convey-clear-staging` | |
| Region | **West EU (Ireland), `eu-west-1`** | Must match prod. The POPIA §72 cross-border basis in `/privacy` is written for Ireland |
| Organisation | **A Quantra org, NOT the ConveyClear org** | ConveyClear's org is on Pro, where every extra project bills ~$10/mo compute. Pro projects do not consume free slots, so a Quantra org should still offer Free. Staging is a Quantra development tool, not a client asset, so it belongs on Quantra's books |
| Plan | Free | Pauses after 7 days idle: the first preview after a quiet week fails until you unpause. Acceptable — staging is disposable and is not a backup target |

Save the database password straight into Vaultwarden. Do not paste it into chat, this repo, or the vault.

## 2. Load the schema

**From the VPS, not the laptop.** The laptop has no `psql`; docker there needs `sudo`, the daemon is
stopped, and `sudo` cannot run through a non-tty shell — which covers both Claude's Bash tool and the
`!` prefix (confirmed 2026-06-30). The VPS already has `postgresql-client-16` and already reaches
Supabase over the IPv4 pooler.

**Put the connection string on the VPS.** It never touches the laptop, this repo, the vault or chat —
same convention as the existing `/root/.supabase-backup.env`:

```bash
ssh root@187.124.112.180
umask 077
cat > /root/.conveyclear-staging.env <<'EOF'
STAGING_DB_URL="postgresql://postgres.<staging-ref>:<password>@aws-0-eu-west-1.pooler.supabase.com:5432/postgres?sslmode=require"
EOF
chmod 600 /root/.conveyclear-staging.env
```

Always the **pooler** host. `db.<ref>.supabase.co` resolves IPv6 only. The pooler user must carry the
project ref (`postgres.<staging-ref>`), never a bare `postgres`.

**Then from the laptop:**

```bash
cd ~/projects/convey-clear/convey-clear-app
./scripts/staging-bootstrap.sh
```

Syncs the SQL to the VPS, applies every migration in order, prints a shape check. Refuses the production
ref on both sides of the ssh boundary, because it replays seeds and backfill `UPDATE`s — correct on an
empty database, destructive on a live one. Resume after a failure with `./scripts/staging-bootstrap.sh <number>`.

`scripts/apply-migrations.sh` is the direct-psql equivalent, for a machine that has psql locally.

Only possible because the migrations went into git on 2026-08-04. Before that, standing up a second
environment meant finding 45 loose files in `cc-notes and stuff/sql/` on one laptop.

## 3. Seed something to look at

```bash
./scripts/staging-bootstrap.sh seed
```

Then create auth users in the staging dashboard with **the same emails** as the seeded `public.users`
rows: the `on_auth_user_created` trigger links them by email and preserves the seeded role. Use
Add user → with password → auto-confirm.

⚠️🔴 **Never restore a production dump into staging. This is a contractual line, not a preference.**
Staging lives in a **Quantra** organisation, outside the environment ConveyClear has agreed their data
sits in. A dump would put real client FICA records — certified IDs, proof of address — into a third
party's Supabase org with weaker access control and no deletion policy. Seed synthetic data only.

The same reasoning applies to the 93 MB of unencrypted FICA storage still sitting in
`~/backups/conveyclear/storage-2026-07-28/`: do not use it to populate anything.

## 4. Point Previews at it

Vercel → `convey-clear-app` → Settings → Environment Variables. For each of the five, set the **Preview**
value to the staging project and change the scope from `feature/sprint-1` to **All Preview branches**:

- `NEXT_PUBLIC_SUPABASE_URL` → `https://<staging-ref>.supabase.co`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` → staging publishable key
- `SUPABASE_SERVICE_ROLE_KEY` → staging secret key
- `NEXT_PUBLIC_APP_URL` → leave Vercel's preview URL
- `N8N_WEBHOOK_URL` → leave, or point at a dead host so previews cannot fire real workflows

⚠️ `NEXT_PUBLIC_*` vars are inlined at **build** time. A preview built before this change keeps the old
values; push a new commit rather than redeploying the old one.

## 5. Prove it works

Push any branch and check the Preview row goes ● Ready rather than ● Error. Then confirm the preview is
talking to staging and not prod:

```bash
curl -s https://<preview-url>/_next/static/chunks/*.js | grep -o '<staging-ref>' | head -1
```

Seeing the **staging** ref in the bundle is the check that matters. A green build only proves the app
compiled; it says nothing about which database it points at. That distinction is exactly what went wrong
on 2026-05-31, when `NEXT_PUBLIC_SUPABASE_URL` was empty for thirteen days and the bundle silently fell
back to `placeholder.supabase.co`.

## 6. Keeping it current

Staging drifts the moment a migration lands on prod. Apply new migrations to **staging first**, then
prod — that ordering is the entire point.

```bash
./scripts/staging-bootstrap.sh 048
```

## What this does not cover

- **Storage buckets are not created by the migrations.** `matter-documents`, `transfer-documents` and
  `client-documents` need creating by hand in the staging dashboard, private, before any upload flow is
  testable.
- **Auth settings** (SMTP, redirect URLs, CAPTCHA, MFA) are per-project and are not in the migrations.
  Redirect URLs at minimum, or login on a preview will bounce.
- **n8n** points at prod. Leave it that way; a staging workflow set is not worth the maintenance.
