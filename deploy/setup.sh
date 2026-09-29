#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
command -v docker >/dev/null || { echo 'Install Docker Engine first: https://docs.docker.com/engine/install/ubuntu/'; exit 1; }
docker compose version >/dev/null
if [[ ! -f deploy/.env ]]; then
  read -r -p 'Domain pointing to this server (e.g. field.yourcompany.com): ' domain
  [[ "$domain" =~ ^[a-zA-Z0-9]([a-zA-Z0-9.-]*[a-zA-Z0-9])?\.[a-zA-Z]{2,}$ ]] || { echo 'Enter a domain without https:// or a path.'; exit 1; }
  read -r -s -p 'New workspace password (at least 14 characters): ' password
  printf '\n'
  read -r -s -p 'Confirm workspace password: ' confirm
  printf '\n'
  [[ "$password" == "$confirm" ]] || { echo 'Passwords do not match.'; exit 1; }
  hash=$(printf '%s' "$password" | docker run --rm -i -v "$PWD/backend/password.mjs:/password.mjs:ro" node:24-bookworm-slim node /password.mjs)
  unset password confirm
  umask 077
  printf 'DOMAIN=%s\nPUBLIC_ORIGIN=https://%s\nADMIN_PASSWORD_HASH=%s\nWORKSPACE_ID=grosuite\nLOCATION_RETENTION_DAYS=30\n' "$domain" "$domain" "$hash" > deploy/.env
  unset hash
fi
docker compose -p grosuite -f deploy/compose.yml up -d --build
docker compose -p grosuite -f deploy/compose.yml ps
printf '\nGroSuite is starting. Check HTTPS and health before pairing phones.\n'
