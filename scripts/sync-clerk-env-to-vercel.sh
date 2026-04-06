#!/usr/bin/env bash
# Push FinTRK Clerk API keys (from your existing Clerk application) to Vercel.
# Do NOT use the Vercel Marketplace "Clerk" integration — it provisions a new Clerk app
# and will not see users in your FinTRK application.
#
# Usage:
#   1. Clerk Dashboard → Applications → FinTRK → Configure → API keys
#   2. Copy Production (or Development) publishable + secret keys
#   3. Create .env.clerk.fin-trk next to this file (see .env.clerk.fin-trk.example)
#   4. Run: bash scripts/sync-clerk-env-to-vercel.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
ENV_FILE="${1:-$ROOT/.env.clerk.fin-trk}"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing: $ENV_FILE"
  echo "Copy .env.clerk.fin-trk.example and fill keys from Clerk → FinTRK → API keys."
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
for E in production preview development; do
  npx vercel env add NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY "$E" \
    --value "$NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY" --yes --force
  npx vercel env add CLERK_SECRET_KEY "$E" \
    --value "$CLERK_SECRET_KEY" --yes --sensitive --force
done
echo "Clerk env vars updated on Vercel. Deploy: npx vercel deploy --prod --yes"
