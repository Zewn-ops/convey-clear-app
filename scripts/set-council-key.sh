#!/usr/bin/env bash
# Set COUNCIL_CRED_KEY in every local env file, without the key ever appearing
# on screen, in shell history, or in a chat.
#
#   ./scripts/set-council-key.sh
#
# WHY THIS EXISTS RATHER THAN "just edit the file"
#   `use-env.sh` COPIES .env.prod or .env.staging over .env.local every time you
#   swap. A key added only to .env.local is gone the next time you switch, and
#   the failure is silent — the app just starts refusing to save council logins
#   again. So the key has to live in the stored copies, and this writes all
#   three at once.
#
# The key encrypts the council portal logins firms enter for their staff
# (migration 074). Losing it makes every stored login unreadable forever, so
# back it up in Vaultwarden as well — this script cannot do that for you.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

KEY_NAME="COUNCIL_CRED_KEY"

# -s: no echo. Nothing is printed, and because this is read rather than an
# argument, the value never reaches ~/.bash_history either.
printf 'Paste the key (openssl rand -base64 32), then Enter.\nIt will not be shown: '
read -rs KEY
echo

KEY="$(printf '%s' "$KEY" | tr -d '[:space:]')"

if [ -z "$KEY" ]; then
  echo "Nothing pasted. Stopping — no file was touched." >&2
  exit 1
fi

# 32 raw bytes base64-encode to exactly 44 characters ending in '='. Checked
# because a truncated paste would be accepted by the file and then rejected by
# the app at the worst possible moment, with an error about key length.
if ! printf '%s' "$KEY" | grep -Eq '^[A-Za-z0-9+/]{43}=$'; then
  echo "That does not look like the output of 'openssl rand -base64 32'." >&2
  echo "Expected 44 characters ending in '='. Got ${#KEY}." >&2
  echo "Nothing was written." >&2
  exit 1
fi

wrote=0
for f in .env.prod .env.staging .env.local; do
  [ -f "$f" ] || { echo "skip $f (not present)"; continue; }

  if grep -q "^${KEY_NAME}=" "$f"; then
    # Replace in place rather than appending a second line — the last one wins
    # in dotenv, so a duplicate is a file that says two different things.
    tmp="$(mktemp)"
    grep -v "^${KEY_NAME}=" "$f" > "$tmp"
    printf '%s=%s\n' "$KEY_NAME" "$KEY" >> "$tmp"
    cat "$tmp" > "$f"          # preserve the original file's permissions
    rm -f "$tmp"
    echo "updated  $f"
  else
    printf '\n# 🔒 Encrypts the council portal logins firms enter (074).\n' >> "$f"
    printf '# Back this up in Vaultwarden: losing it makes every stored\n' >> "$f"
    printf '# login unreadable forever.\n' >> "$f"
    printf '%s=%s\n' "$KEY_NAME" "$KEY" >> "$f"
    echo "added to $f"
  fi
  wrote=$((wrote + 1))
done

unset KEY

echo
echo "Done — $wrote file(s). The value was never printed."
echo
echo "Check it landed (shows the NAME only, never the value):"
echo "  grep -c '^${KEY_NAME}=' .env.prod .env.staging .env.local"
echo
echo "Still to do, and neither is something this script can do:"
echo "  · back the key up in Vaultwarden"
echo "  · set the same variable in the Vercel project that serves the portal"
