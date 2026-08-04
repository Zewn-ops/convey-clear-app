#!/usr/bin/env bash
# Stand up the staging database by driving the VPS, which already has
# psql 16 and already reaches Supabase over the IPv4 pooler.
#
# Why not run this on the laptop: psql is not installed there, docker needs
# sudo, the docker daemon is stopped, and sudo cannot run through a non-tty
# shell. The VPS has everything already.
#
# The staging password never touches this laptop, this repo, or the chat. It
# lives only in /root/.conveyclear-staging.env on the VPS, chmod 600, next to
# the existing /root/.supabase-backup.env.
#
#   ./scripts/staging-bootstrap.sh            # apply all migrations
#   ./scripts/staging-bootstrap.sh 048        # resume from a migration
#   ./scripts/staging-bootstrap.sh seed       # apply the dry-run seed data
set -euo pipefail

VPS="root@187.124.112.180"
REMOTE="/root/cc-staging"
ENVFILE="/root/.conveyclear-staging.env"
PROD_REF="yhgriqagrhyblhmloctc"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ARG="${1:-000}"

ssh -o BatchMode=yes -o ConnectTimeout=10 "$VPS" "test -f $ENVFILE" 2>/dev/null || {
  cat >&2 <<EOF
Missing $ENVFILE on the VPS.

Create it there (the password stays on the VPS, nowhere else):

  ssh $VPS
  umask 077
  cat > $ENVFILE <<'ENVEOF'
STAGING_DB_URL="postgresql://postgres.<staging-ref>:<password>@aws-0-eu-west-1.pooler.supabase.com:5432/postgres?sslmode=require"
ENVEOF
  chmod 600 $ENVFILE

Use the POOLER host above, not db.<ref>.supabase.co (IPv6 only).
The pooler user must carry the project ref: postgres.<staging-ref>
EOF
  exit 1
}

echo "→ syncing SQL to $VPS:$REMOTE"
ssh "$VPS" "mkdir -p $REMOTE/migrations $REMOTE/scripts"
scp -q "$HERE"/supabase/migrations/*.sql "$VPS:$REMOTE/migrations/"
scp -q "$HERE"/supabase/scripts/*.sql    "$VPS:$REMOTE/scripts/"
echo "  $(ls "$HERE"/supabase/migrations/*.sql | wc -l) migrations, $(ls "$HERE"/supabase/scripts/*.sql | wc -l) scripts"
echo

# Everything below runs on the VPS. The guard is repeated there because that is
# where the URL actually resolves.
ssh "$VPS" ARG="$ARG" PROD_REF="$PROD_REF" REMOTE="$REMOTE" ENVFILE="$ENVFILE" 'bash -s' <<'REMOTE_EOF'
set -euo pipefail
# shellcheck disable=SC1090
. "$ENVFILE"
: "${STAGING_DB_URL:?STAGING_DB_URL not set in $ENVFILE}"

if [[ "$STAGING_DB_URL" == *"$PROD_REF"* ]]; then
  echo "REFUSED: that URL points at production ($PROD_REF)." >&2
  echo "This replays seeds and backfill UPDATEs. Never against prod." >&2
  exit 1
fi

if [ "$ARG" = "extra" ]; then
  echo "→ seeding staging-only extra fixtures"
  psql "$STAGING_DB_URL" -v ON_ERROR_STOP=1 -q -f "$REMOTE/scripts/seed_staging_extra.sql"
  psql "$STAGING_DB_URL" -q -A -F' | ' -c "SELECT coalesce(current_phase,'(none)') AS phase, status, count(*)::text FROM matters GROUP BY 1,2 ORDER BY 1,2;"
  exit 0
fi

if [ "$ARG" = "seed" ]; then
  echo "→ seeding dry-run data"
  psql "$STAGING_DB_URL" -v ON_ERROR_STOP=1 -q -f "$REMOTE/scripts/seed_dryrun_data.sql"
  echo "  seeded."
  echo
  echo "Logins are NOT seeded (auth.users is Supabase-owned). In the staging"
  echo "dashboard: Authentication → Users → Add user, with the EXACT emails from"
  echo "the seed, a password, and Auto confirm. handle_new_user() links them by"
  echo "email and preserves the seeded role."
  exit 0
fi

applied=0
for f in "$REMOTE"/migrations/[0-9]*.sql; do
  n="$(basename "$f")"; num="${n%%_*}"
  [[ "$num" < "$ARG" ]] && { printf '  skip  %s\n' "$n"; continue; }
  printf '  ---→  %-52s ' "$n"
  if out="$(psql "$STAGING_DB_URL" -v ON_ERROR_STOP=1 -q -f "$f" 2>&1)"; then
    echo "ok"; applied=$((applied+1))
  else
    echo "FAILED"; echo; echo "$out" | sed 's/^/      /' >&2
    echo >&2; echo "Stopped at $n. Nothing after it ran." >&2
    echo "Fix, then resume:  ./scripts/staging-bootstrap.sh $num" >&2
    exit 1
  fi
done

echo
echo "applied $applied"
echo
echo "=== verify (shape, not exit code) ==="
psql "$STAGING_DB_URL" -q -A -F' | ' <<'SQL'
SELECT 'tables', count(*)::text FROM information_schema.tables WHERE table_schema='public'
UNION ALL SELECT 'policies', count(*)::text FROM pg_policy
UNION ALL SELECT 'firms is a', coalesce((SELECT table_type FROM information_schema.tables
    WHERE table_schema='public' AND table_name='firms'),'MISSING')
UNION ALL SELECT 'business_partners is a', coalesce((SELECT table_type FROM information_schema.tables
    WHERE table_schema='public' AND table_name='business_partners'),'absent (047 applied)')
UNION ALL SELECT 'denorm fn still broken', coalesce((SELECT (prosrc ~ 'business_partners')::text
    FROM pg_proc WHERE proname='matters_set_firm_denorm'),'fn missing');
SQL
REMOTE_EOF

echo
echo "Next:"
echo "  ./scripts/staging-bootstrap.sh seed     # populate something to look at"
echo "  then create the 3 private storage buckets + auth redirect URLs by hand"
echo "  (docs/STAGING.md — migrations do not carry either)"
