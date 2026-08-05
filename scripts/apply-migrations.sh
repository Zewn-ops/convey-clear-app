#!/usr/bin/env bash
# Apply supabase/migrations/*.sql in order against a target database.
#
# Built for standing up the STAGING project. It refuses to run against
# production: re-running 001-045 there would re-seed and re-UPDATE live rows.
#
#   ./scripts/apply-migrations.sh "postgresql://postgres.<ref>:<pw>@aws-0-eu-west-1.pooler.supabase.com:5432/postgres?sslmode=require"
#   ./scripts/apply-migrations.sh "$URL" 046        # start at a given migration
#
# Always the POOLER host. The direct db.<ref>.supabase.co host resolves IPv6
# only and is unreachable from most of our machines. The pooler user must carry
# the project ref (postgres.<ref>), not a bare postgres.
set -euo pipefail

PROD_REF="yhgriqagrhyblhmloctc"
URL="${1:-}"
START="${2:-000}"

[ -z "$URL" ] && { echo "usage: $0 <postgres-url> [start-number]" >&2; exit 2; }

if [[ "$URL" == *"$PROD_REF"* ]]; then
  echo "REFUSED: that URL points at production ($PROD_REF)." >&2
  echo "This script replays the whole migration history, including seeds and" >&2
  echo "backfill UPDATEs. Apply single migrations to prod by hand instead." >&2
  exit 1
fi

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/supabase/migrations"
[ -d "$DIR" ] || { echo "no migrations dir at $DIR" >&2; exit 1; }

command -v psql >/dev/null || { echo "psql not found. apt install postgresql-client" >&2; exit 1; }

echo "target : ${URL%%:*}://…@$(sed -E 's|.*@([^/?]+).*|\1|' <<<"$URL")"
echo "source : $DIR"
echo

applied=0 skipped=0
for f in "$DIR"/[0-9]*.sql; do
  n="$(basename "$f")"
  num="${n%%_*}"
  if [[ "$num" < "$START" ]]; then
    printf '  skip  %s\n' "$n"; skipped=$((skipped+1)); continue
  fi
  printf '  ---→  %s ... ' "$n"
  if out="$(psql "$URL" -v ON_ERROR_STOP=1 -q -f "$f" 2>&1)"; then
    echo "ok"; applied=$((applied+1))
  else
    echo "FAILED"; echo; echo "$out" | sed 's/^/      /' >&2
    echo >&2
    echo "Stopped at $n. Nothing after it ran. Fix, then re-run with:" >&2
    echo "  $0 \"\$URL\" $num" >&2
    exit 1
  fi
done

echo
echo "applied $applied, skipped $skipped"
echo
echo "Now verify the shape rather than trusting the exit code:"
cat <<'SQL'
  SELECT count(*) FROM information_schema.tables WHERE table_schema='public';
  SELECT count(*) FROM pg_policy;
  SELECT table_name, table_type FROM information_schema.tables
   WHERE table_schema='public' AND table_name IN ('firms','business_partners');
  SELECT prosrc ~ 'business_partners' AS denorm_still_broken
    FROM pg_proc WHERE proname='matters_set_firm_denorm';
SQL
