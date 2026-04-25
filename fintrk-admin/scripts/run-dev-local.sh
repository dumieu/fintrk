#!/usr/bin/env bash
# Local HTTPS at https://local.admin.fintrk.io:3005 — same Neon DB + Clerk as production.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
bash "$ROOT/scripts/gen-local-certs.sh"

export NEXT_PUBLIC_APP_URL="${NEXT_PUBLIC_APP_URL:-https://local.admin.fintrk.io:3005}"
if command -v mkcert >/dev/null 2>&1; then
  export NODE_EXTRA_CA_CERTS="$(mkcert -CAROOT)/rootCA.pem"
fi

if [[ -f "$ROOT/.env.clerk.fin-trk" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "$ROOT/.env.clerk.fin-trk"
  set +a
fi

exec npx next dev --webpack \
  --experimental-https \
  --experimental-https-key "$ROOT/.certs/fintrk-admin-local-key.pem" \
  --experimental-https-cert "$ROOT/.certs/fintrk-admin-local-cert.pem" \
  -p 3005
