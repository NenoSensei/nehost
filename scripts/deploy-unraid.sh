#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_NAME="${APP_NAME:-nehost-site}"
IMAGE_NAME="${IMAGE_NAME:-nehost-site:latest}"
EDGE_NETWORK="${DOCKER_EDGE_NETWORK:-nenosensei-edge}"
HOST_PORT="${HOST_PORT:-8095}"
CONTAINER_PORT="${CONTAINER_PORT:-8080}"

cd "${ROOT_DIR}"

docker network inspect "${EDGE_NETWORK}" >/dev/null 2>&1 || docker network create "${EDGE_NETWORK}" >/dev/null

docker build -t "${IMAGE_NAME}" "${ROOT_DIR}"

docker rm -f "${APP_NAME}" >/dev/null 2>&1 || true
docker run -d \
  --name "${APP_NAME}" \
  --restart unless-stopped \
  --security-opt no-new-privileges:true \
  --cap-drop ALL \
  --network "${EDGE_NETWORK}" \
  -p "127.0.0.1:${HOST_PORT}:${CONTAINER_PORT}" \
  "${IMAGE_NAME}" >/dev/null

echo "NeHost started on container ${APP_NAME}."
echo "Health: http://127.0.0.1:${HOST_PORT}/health"
