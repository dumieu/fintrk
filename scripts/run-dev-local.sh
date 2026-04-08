#!/usr/bin/env bash
# Local HTTPS at https://local.fintrk.io:3004 — same Neon DB + Clerk as production.
# Clerk: set NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY + CLERK_SECRET_KEY in .env.local (gitignored), or .env.clerk.fin-trk.
# Next.js loads .env.local automatically. Optional .env.clerk.fin-trk is sourced below for shell overrides.
# Clerk Dashboard → FinTRK → add https://local.fintrk.io:3004 to allowed origins / redirect URLs.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
bash "$ROOT/scripts/gen-local-certs.sh"

export NEXT_PUBLIC_APP_URL="${NEXT_PUBLIC_APP_URL:-https://local.fintrk.io:3004}"
export NODE_EXTRA_CA_CERTS="$(mkcert -CAROOT)/rootCA.pem"

if [[ -f "$ROOT/.env.clerk.fin-trk" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "$ROOT/.env.clerk.fin-trk"
  set +a
fi

exec npx next dev --webpack \
  --experimental-https \
  --experimental-https-key "$ROOT/.certs/fintrk-local-key.pem" \
  --experimental-https-cert "$ROOT/.certs/fintrk-local-cert.pem" \
  -p 3004
