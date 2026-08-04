#!/usr/bin/env bash
# Swap the local dev environment between production and staging.
#
#   ./scripts/use-env.sh staging
#   ./scripts/use-env.sh prod
#   ./scripts/use-env.sh which
#
# .env.local is what Next.js reads. This keeps a copy of each environment
# beside it and symlink-free copies them in, so a half-finished edit can never
# leave you pointed at production while you think you are on staging.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

label() {
  [ -f .env.local ] || { echo "(no .env.local)"; return; }
  u="$(grep -m1 '^NEXT_PUBLIC_SUPABASE_URL=' .env.local | cut -d= -f2- | tr -d '"')"
  case "$u" in
    *yhgriqagrhyblhmloctc*) echo "PRODUCTION  ($u)" ;;
    *) echo "staging     ($u)" ;;
  esac
}

case "${1:-which}" in
  which) echo "current: $(label)" ;;
  prod|production)
    [ -f .env.prod ] || { echo "no .env.prod saved. Run: cp .env.local .env.prod  (while on prod)" >&2; exit 1; }
    cp .env.prod .env.local; echo "→ $(label)" ;;
  staging)
    [ -f .env.staging ] || { cat >&2 <<'MSG'
No .env.staging yet. Create it from the staging project's API settings
(Supabase → Project Settings → API):

  cp .env.local .env.prod          # keep prod safe first
  cp .env.local .env.staging       # then edit .env.staging:

    NEXT_PUBLIC_SUPABASE_URL=https://ehidtynqxsnyukcfumyz.supabase.co
    NEXT_PUBLIC_SUPABASE_ANON_KEY=<staging publishable key>
    SUPABASE_SERVICE_ROLE_KEY=<staging secret key>
    NEXT_PUBLIC_APP_URL=http://localhost:3000

Leave the other vars as they are.
MSG
      exit 1; }
    [ -f .env.prod ] || cp .env.local .env.prod
    cp .env.staging .env.local; echo "→ $(label)" ;;
  *) echo "usage: $0 [staging|prod|which]" >&2; exit 2 ;;
esac

echo
echo "⚠️  NEXT_PUBLIC_* are inlined at BUILD time. Restart npm run dev after switching."
