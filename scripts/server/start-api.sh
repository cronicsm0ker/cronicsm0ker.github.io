#!/usr/bin/env bash
# Wrapper invoked by PM2 to launch the API with the production env file sourced.
# Installed to /usr/local/bin/roofops-api by bootstrap.sh.

set -euo pipefail

ROOFOPS_APP_DIR="${ROOFOPS_APP_DIR:-/home/roofops/app}"
ROOFOPS_ENV_FILE="${ROOFOPS_ENV_FILE:-/etc/roofops/api.env}"

if [[ ! -r "${ROOFOPS_ENV_FILE}" ]]; then
  echo "ERROR: env file ${ROOFOPS_ENV_FILE} is not readable" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
. "${ROOFOPS_ENV_FILE}"
set +a

exec node "${ROOFOPS_APP_DIR}/apps/api/dist/server.js"
