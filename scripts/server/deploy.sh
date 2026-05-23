#!/usr/bin/env bash
# RoofOps API deploy — run as the roofops user on the server.
#
#   sudo -iu roofops
#   cd /home/roofops/app
#   bash scripts/server/deploy.sh
#
# Idempotent: pulls the configured branch, builds the API and its workspace
# deps, applies pending Prisma migrations, and reloads PM2.

set -euo pipefail

ROOFOPS_APP_DIR="${ROOFOPS_APP_DIR:-$(pwd)}"
ROOFOPS_BRANCH="${ROOFOPS_BRANCH:-main}"
ROOFOPS_ENV_FILE="${ROOFOPS_ENV_FILE:-/etc/roofops/api.env}"
ROOFOPS_ECOSYSTEM="${ROOFOPS_ECOSYSTEM:-${ROOFOPS_APP_DIR}/scripts/server/ecosystem.config.cjs}"

log() { printf '\n\033[1;32m==>\033[0m %s\n' "$*"; }
err() { printf '\n\033[1;31mERROR:\033[0m %s\n' "$*" >&2; exit 1; }

[[ -d "${ROOFOPS_APP_DIR}/.git" ]] || err "Not a git checkout: ${ROOFOPS_APP_DIR}"
[[ -r "${ROOFOPS_ENV_FILE}" ]] || err "Env file unreadable: ${ROOFOPS_ENV_FILE} — re-run bootstrap.sh"

cd "${ROOFOPS_APP_DIR}"

log "Fetching latest ${ROOFOPS_BRANCH}"
git fetch origin "${ROOFOPS_BRANCH}"
git checkout "${ROOFOPS_BRANCH}"
git reset --hard "origin/${ROOFOPS_BRANCH}"

log "Installing workspace dependencies"
pnpm install --frozen-lockfile

log "Generating Prisma client"
pnpm --filter @roofops/db generate

log "Building API and its workspace dependencies"
pnpm --filter @roofops/api... build

log "Applying database migrations"
set -a
# shellcheck disable=SC1090
. "${ROOFOPS_ENV_FILE}"
set +a
pnpm --filter @roofops/db exec prisma migrate deploy

log "Reloading PM2"
if pm2 describe roofops-api >/dev/null 2>&1; then
  pm2 reload "${ROOFOPS_ECOSYSTEM}" --update-env
else
  pm2 start "${ROOFOPS_ECOSYSTEM}"
  pm2 save
  # Ensure PM2 resurrects roofops-api on boot. Safe to run repeatedly.
  if [[ -z "${ROOFOPS_PM2_STARTUP_DONE:-}" ]]; then
    log "Run the following once as root to enable PM2 on boot:"
    echo "  sudo env PATH=\$PATH:$(dirname "$(command -v node)") $(command -v pm2) startup systemd -u $(id -un) --hp $HOME"
  fi
fi

log "Deploy finished. Health check:"
curl -fsS "http://127.0.0.1:${PORT:-3000}/health" || err "Health check failed"
echo
