#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PROXY_DIR="${ROOT_DIR}/infra/staff-proxy"
CONTAINER_NAME="${STAFF_PROXY_CONTAINER:-nenos-it-repair-staff-proxy}"
IMAGE_NAME="${STAFF_PROXY_IMAGE:-nenos-it-repair-staff-proxy:latest}"
LAN_NETWORK="${STAFF_LAN_NETWORK:-br0}"
EDGE_NETWORK="${DOCKER_EDGE_NETWORK:-nenosensei-edge}"
STAFF_IP="${STAFF_PROXY_IP:-10.0.0.195}"
TOKEN_ENV="${STAFF_PROXY_ENV_FILE:-/mnt/user/appdata/nenos-it-repair-staff-proxy/cloudflare.env}"
DATA_DIR="${STAFF_PROXY_DATA_DIR:-/mnt/user/appdata/nenos-it-repair-staff-proxy/data}"
CONFIG_DIR="${STAFF_PROXY_CONFIG_DIR:-/mnt/user/appdata/nenos-it-repair-staff-proxy/config}"

if [[ ! "${STAFF_IP}" =~ ^10\.0\.0\.[0-9]{1,3}$ ]]; then echo "Refusing unexpected staff proxy address: ${STAFF_IP}" >&2; exit 1; fi
if [[ ! -f "${TOKEN_ENV}" ]]; then echo "Missing scoped Cloudflare token file: ${TOKEN_ENV}" >&2; exit 1; fi
if ! grep -Eq '^CLOUDFLARE_API_TOKEN=.{20,}$' "${TOKEN_ENV}"; then echo "CLOUDFLARE_API_TOKEN is missing from ${TOKEN_ENV}" >&2; exit 1; fi
chmod 0600 "${TOKEN_ENV}"
install -d -m 0700 "${DATA_DIR}" "${CONFIG_DIR}"

if ! docker container inspect "${CONTAINER_NAME}" >/dev/null 2>&1; then
  if arping -D -I "${LAN_NETWORK}" -c 3 "${STAFF_IP}" 2>&1 | grep -q 'Received [1-9]'; then echo "${STAFF_IP} answered ARP; choose a verified-unused address." >&2; exit 1; fi
fi

docker network inspect "${LAN_NETWORK}" >/dev/null
docker network inspect "${EDGE_NETWORK}" >/dev/null
docker build -t "${IMAGE_NAME}" "${PROXY_DIR}"
docker rm -f "${CONTAINER_NAME}" >/dev/null 2>&1 || true
docker run -d --name "${CONTAINER_NAME}" --restart unless-stopped --security-opt no-new-privileges:true --network "${LAN_NETWORK}" --ip "${STAFF_IP}" --env-file "${TOKEN_ENV}" -v "${PROXY_DIR}/Caddyfile:/etc/caddy/Caddyfile:ro" -v "${DATA_DIR}:/data" -v "${CONFIG_DIR}:/config" "${IMAGE_NAME}" >/dev/null
docker network connect "${EDGE_NETWORK}" "${CONTAINER_NAME}"

docker exec "${CONTAINER_NAME}" caddy validate --config /etc/caddy/Caddyfile
tailscale set --advertise-routes="${STAFF_IP}/32"
echo "Staff proxy started at ${STAFF_IP}. Approve the exact /32 in the Tailscale admin console if route approval is required."
