#!/bin/bash
# TLS for https://local.fintrk.io — prefers mkcert (browser-trusted).
set -euo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:${PATH:-}"
if command -v brew >/dev/null 2>&1; then
  _bp="$(brew --prefix 2>/dev/null || true)"
  [[ -n "${_bp:-}" && -d "${_bp}/bin" ]] && PATH="${_bp}/bin:${PATH}"
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$ROOT/.certs"

mkcert_run() {
  if [[ "$(id -u)" -eq 0 && -n "${SUDO_USER:-}" ]]; then
    sudo -u "$SUDO_USER" -H env PATH="$PATH" mkcert "$@"
  else
    mkcert "$@"
  fi
}

gen_openssl() {
  openssl req -x509 -newkey rsa:2048 -sha256 -days 825 -nodes \
    -keyout "$ROOT/.certs/fintrk-local-key.pem" -out "$ROOT/.certs/fintrk-local-cert.pem" \
    -subj "/CN=local.fintrk.io" \
    -addext "subjectAltName=DNS:local.fintrk.io,DNS:localhost,IP:127.0.0.1"
}

if command -v mkcert >/dev/null 2>&1; then
  mkcert_run -install || true
  mkcert_run -key-file "$ROOT/.certs/fintrk-local-key.pem" -cert-file "$ROOT/.certs/fintrk-local-cert.pem" \
    local.fintrk.io localhost 127.0.0.1
  echo "OK: mkcert TLS → $ROOT/.certs/fintrk-local-*.pem"
  exit 0
fi

if [[ -f "$ROOT/.certs/fintrk-local-key.pem" && -f "$ROOT/.certs/fintrk-local-cert.pem" ]]; then
  echo "Using existing certs in $ROOT/.certs (install mkcert for trusted HTTPS: brew install mkcert && mkcert -install)" >&2
  exit 0
fi

echo "mkcert not found; generating openssl self-signed certs (browser may warn)." >&2
gen_openssl
echo "OK: openssl TLS → $ROOT/.certs/fintrk-local-*.pem"
