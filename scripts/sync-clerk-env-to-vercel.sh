#!/usr/bin/env bash
# Push FinTRK Clerk API keys (from your existing Clerk application) to Vercel.
# Do NOT use the Vercel Marketplace "Clerk" integration — it provisions a new Clerk app
# and will not see users in your FinTRK application.
#
# Usage:
#   1. Put NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY + CLERK_SECRET_KEY in .env.local (gitignored), or .env.clerk.fin-trk
#   2. Run: bash scripts/sync-clerk-env-to-vercel.sh
#      Optional: bash scripts/sync-clerk-env-to-vercel.sh /path/to/env/file
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
if [[ -n "${1:-}" ]]; then
  ENV_FILE="$1"
elif [[ -f "$ROOT/.env.local" ]] && grep -qE '^NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="?pk_' "$ROOT/.env.local" 2>/dev/null \
  && grep -qE '^CLERK_SECRET_KEY="?sk_' "$ROOT/.env.local" 2>/dev/null; then
  ENV_FILE="$ROOT/.env.local"
else
  ENV_FILE="$ROOT/.env.clerk.fin-trk"
fi
if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing env file: $ENV_FILE"
  echo "Add Clerk keys to .env.local or create .env.clerk.fin-trk (see .env.clerk.fin-trk.example)."
  exit 1
fi
# shellcheck disable=SC1090
set -a
# shellcheck source=/dev/null
source "$ENV_FILE"
set +a
if [[ -z "${NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:-}" || -z "${CLERK_SECRET_KEY:-}" ]]; then
  echo "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY must be set in $ENV_FILE"
  exit 1
fi
PK="$NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"
SK="$CLERK_SECRET_KEY"

npx vercel env add NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY production --value "$PK" --yes --force
npx vercel env add CLERK_SECRET_KEY production --value "$SK" --yes --sensitive --force

# Preview: CLI 50+ needs "" as “all preview branches” in non-interactive mode (see vercel/vercel#15415).
npx vercel env add NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY preview --value "$PK" --yes --force --non-interactive ""
npx vercel env add CLERK_SECRET_KEY preview --value "$SK" --yes --sensitive --force --non-interactive ""

# Development: only publishable — Vercel API rejects sensitive vars on Development; use .env.local for CLERK_SECRET_KEY with `vercel dev`.
npx vercel env add NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY development --value "$PK" --yes --force

echo "Clerk env vars updated on Vercel (secret → Production + Preview only; Development gets publishable only)."
echo "Redeploy production: npx vercel deploy --prod --yes"
