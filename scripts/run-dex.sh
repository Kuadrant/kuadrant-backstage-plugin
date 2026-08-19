#!/usr/bin/env bash
# Start Dex for yarn-dev. Pulls the image first on a cold machine, then runs —
# `docker run IMAGE` can finish the pull and exit without serving :5556.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEX_IMAGE="${DEX_IMAGE:-ghcr.io/dexidp/dex:v2.45.1}"
DEX_NAME="${DEX_NAME:-kuadrant-dex}"

if ! command -v docker >/dev/null 2>&1; then
  echo "error: docker is required to run Dex" >&2
  exit 1
fi

if ! docker image inspect "${DEX_IMAGE}" >/dev/null 2>&1; then
  echo "==> pulling ${DEX_IMAGE} (first start)..."
  docker pull "${DEX_IMAGE}"
fi

# leftover name from a crashed run blocks the next start
docker rm -f "${DEX_NAME}" >/dev/null 2>&1 || true

# --pull=never: do not race a second pull inside `docker run`
exec docker run --rm --name "${DEX_NAME}" --pull=never \
  -p 5556:5556 \
  -v "${REPO_DIR}/kuadrant-dev-setup/dex/config.yaml:/etc/dex/config.yaml:ro" \
  -v "${REPO_DIR}/kuadrant-dev-setup/dex/web:/srv/dex/web:ro" \
  "${DEX_IMAGE}" dex serve /etc/dex/config.yaml
