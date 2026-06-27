#!/usr/bin/env bash
#
# One command to start everything needed for local development:
#   1. Bring up Postgres + Garage (docker-compose) and wait until both are healthy.
#   2. Assign the Garage cluster layout (idempotent) so object writes succeed.
#   3. Run the Next dev server on the host (`pnpm dev`), which migrates the DB first.
#
# Invoked via `pnpm app:dev`.

set -euo pipefail

cd "$(dirname "$0")/.."

if ! docker info >/dev/null 2>&1; then
  echo "✗ Docker isn't running. Start Docker Desktop (or your engine) and retry." >&2
  exit 1
fi

# --- .env bootstrap -----------------------------------------------------------
# Only create one if it's missing; never clobber an existing secrets file.
if [ ! -f .env ]; then
  cp .env.example .env
  if command -v openssl >/dev/null 2>&1; then
    secret=$(openssl rand -base64 32)
    # Portable in-place sed (works on both BSD/macOS and GNU).
    sed -i.bak "s|^BETTER_AUTH_SECRET=.*|BETTER_AUTH_SECRET=${secret}|" .env && rm -f .env.bak
  fi
  echo "▸ Created .env from .env.example (generated a BETTER_AUTH_SECRET)."
fi

# --- backing services ---------------------------------------------------------
echo "▸ Starting Postgres + Garage…"
docker compose up -d --wait

# --- garage bootstrap ---------------------------------------------------------
# The image is distroless, so each step is a direct /garage binary call. A fresh
# node has no layout, bucket or key, so we provision all three here (idempotent).
# These dev access keys must match the S3_* values in .env.example.
GARAGE_BUCKET=ledger
GARAGE_ACCESS_KEY=GK1234567890abcdef1234567890abcdef
GARAGE_SECRET_KEY=9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2d1e0f9a8b

gx() { docker compose exec -T garage /garage "$@"; }

if gx layout show 2>/dev/null | grep -q 'dc1'; then
  echo "▸ Garage layout already configured."
else
  echo "▸ Assigning Garage cluster layout…"
  node_id=$(gx status | awk '$1 ~ /^[0-9a-f]{12,}$/ { print $1; exit }')
  if [ -z "${node_id}" ]; then
    echo "✗ Could not determine the Garage node id from \`garage status\`." >&2
    exit 1
  fi
  gx layout assign -z dc1 -c 1G "${node_id}"
  gx layout apply --version 1
fi

if gx bucket info "${GARAGE_BUCKET}" >/dev/null 2>&1; then
  echo "▸ Garage bucket '${GARAGE_BUCKET}' already provisioned."
else
  echo "▸ Provisioning Garage bucket + access key…"
  gx bucket create "${GARAGE_BUCKET}"
  gx key import "${GARAGE_ACCESS_KEY}" "${GARAGE_SECRET_KEY}" -n ledger-dev --yes
  gx bucket allow --read --write --owner "${GARAGE_BUCKET}" --key "${GARAGE_ACCESS_KEY}"
  echo "▸ Garage bucket '${GARAGE_BUCKET}' ready."
fi

# --- app ----------------------------------------------------------------------
echo "▸ Starting Next dev server…"
exec pnpm dev
