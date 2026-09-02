#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_NAME="${APP_NAME:-nenos-it-repair}"
IMAGE_NAME="${IMAGE_NAME:-nenos-it-repair:latest}"
EDGE_NETWORK="${DOCKER_EDGE_NETWORK:-nenosensei-edge}"
HOST_PORT="${HOST_PORT:-8095}"
CONTAINER_PORT="${CONTAINER_PORT:-8080}"
DATA_VOLUME="${DATA_VOLUME:-/mnt/user/appdata/nenos-it-repair/data}"
APP_UID="${APP_UID:-1000}"
APP_GID="${APP_GID:-1000}"

cd "${ROOT_DIR}"

ENV_PATH="${ENV_FILE:-.env.production}"
if [[ ! -f "${ENV_PATH}" ]]; then
  echo "Missing production environment file: ${ENV_PATH}" >&2
  exit 1
fi
if ! grep -Eq '^MFA_ENCRYPTION_KEY=.{32,}$' "${ENV_PATH}"; then
  echo "MFA_ENCRYPTION_KEY must be configured before deployment." >&2
  exit 1
fi
if ! grep -Eq '^BACKUP_HEARTBEAT_KEY=.{32,}$' "${ENV_PATH}"; then
  echo "BACKUP_HEARTBEAT_KEY must be configured before deployment." >&2
  exit 1
fi

install -d -m 0700 -o "${APP_UID}" -g "${APP_GID}" "${DATA_VOLUME}"
find "${DATA_VOLUME}" -maxdepth 1 -type f \
  \( -name 'tickets.sqlite' -o -name 'tickets.sqlite.before-*.bak' \) \
  -exec chmod 0600 {} +

DEPLOY_TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
if [[ -f "${DATA_VOLUME}/tickets.sqlite" ]]; then
  cp -p "${DATA_VOLUME}/tickets.sqlite" "${DATA_VOLUME}/tickets.sqlite.before-${DEPLOY_TIMESTAMP}.bak"
  chmod 0600 "${DATA_VOLUME}/tickets.sqlite.before-${DEPLOY_TIMESTAMP}.bak"
fi
if docker image inspect "${IMAGE_NAME}" >/dev/null 2>&1; then
  docker tag "${IMAGE_NAME}" "nenos-it-repair:rollback-${DEPLOY_TIMESTAMP}"
fi

docker network inspect "${EDGE_NETWORK}" >/dev/null 2>&1 || docker network create "${EDGE_NETWORK}" >/dev/null

docker build -t "${IMAGE_NAME}" "${ROOT_DIR}"

docker rm -f "${APP_NAME}" >/dev/null 2>&1 || true
docker run -d \
  --name "${APP_NAME}" \
  --restart unless-stopped \
  --security-opt no-new-privileges:true \
  --network "${EDGE_NETWORK}" \
  --read-only \
  --tmpfs /tmp:rw,noexec,nosuid,size=16m \
  --tmpfs /run:rw,noexec,nosuid,size=8m \
  --env-file "${ENV_PATH}" \
  -v "${DATA_VOLUME}:/data" \
  -p "127.0.0.1:${HOST_PORT}:${CONTAINER_PORT}" \
  "${IMAGE_NAME}" >/dev/null

echo "Neno’s IT Repair started on container ${APP_NAME}."
echo "Health: http://127.0.0.1:${HOST_PORT}/health"
