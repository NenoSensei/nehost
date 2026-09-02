#!/usr/bin/env bash
set -euo pipefail

LAN_INTERFACE="${STAFF_LAN_INTERFACE:-br0}"
SHIM_NAME="${STAFF_ROUTE_SHIM:-staff-shim}"
STAFF_IP="${STAFF_PROXY_IP:-10.0.0.195}"
SHIM_IP="${STAFF_ROUTE_SHIM_IP:-10.0.0.196}"

if [[ ! "${STAFF_IP}" =~ ^10\.0\.0\.[0-9]{1,3}$ ]]; then
  echo "Refusing unexpected staff proxy address: ${STAFF_IP}" >&2
  exit 1
fi
if [[ ! "${SHIM_IP}" =~ ^10\.0\.0\.[0-9]{1,3}$ ]]; then
  echo "Refusing unexpected staff shim address: ${SHIM_IP}" >&2
  exit 1
fi

ip link show "${LAN_INTERFACE}" >/dev/null

if ! ip link show "${SHIM_NAME}" >/dev/null 2>&1; then
  if arping -D -I "${LAN_INTERFACE}" -c 3 "${SHIM_IP}" 2>&1 | grep -q 'Received [1-9]'; then
    echo "${SHIM_IP} answered ARP; refusing to create the staff route shim." >&2
    exit 1
  fi
  ip link add "${SHIM_NAME}" link "${LAN_INTERFACE}" type macvlan mode bridge
fi

ip addr replace "${SHIM_IP}/32" dev "${SHIM_NAME}"
ip link set "${SHIM_NAME}" up
ip route replace "${STAFF_IP}/32" dev "${SHIM_NAME}"

echo "Staff route ready: ${STAFF_IP}/32 via ${SHIM_NAME} (${SHIM_IP})."
