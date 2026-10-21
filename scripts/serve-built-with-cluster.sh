#!/usr/bin/env bash
# Guarded single-port host-app starter: checks kubectl context, builds the app,
# then serves the pre-built frontend from the backend on :7007 (Dex on :5556).
# No webpack dev server - that is the whole point, it frees CPU for parallel
# Playwright workers. Sign in through Dex/OIDC at http://localhost:7007.
#
# Usage: scripts/serve-built-with-cluster.sh oinc|kind
#
# Contrast with dev-with-cluster.sh, which runs `yarn dev` (dex + backend +
# frontend webpack dev server) on the split :3000/:7007 ports.
set -euo pipefail

want="${1:-}"
if [[ "${want}" != "oinc" && "${want}" != "kind" ]]; then
  echo "error: usage: $0 oinc|kind" >&2
  exit 1
fi

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${REPO_DIR}"

if ! command -v kubectl >/dev/null 2>&1; then
  echo "error: kubectl not found" >&2
  exit 1
fi

ctx="$(kubectl config current-context 2>/dev/null || true)"
if [[ -z "${ctx}" ]]; then
  echo "error: no kubectl current-context" >&2
  if [[ "${want}" == "oinc" ]]; then
    echo "       create one with: yarn oinc:cluster" >&2
  else
    echo "       create one with: make -C kuadrant-dev-setup kind-create" >&2
  fi
  exit 1
fi

if [[ "${want}" == "oinc" ]]; then
  if [[ "${ctx}" != "oinc" ]]; then
    echo "error: kubectl context is '${ctx}', not oinc." >&2
    echo "       yarn oinc:cluster, then: kubectl config use-context oinc" >&2
    exit 1
  fi
else
  if [[ "${ctx}" != kind-* ]]; then
    echo "error: kubectl context is '${ctx}', not a kind cluster (expected kind-*)." >&2
    echo "       make -C kuadrant-dev-setup kind-create" >&2
    exit 1
  fi
fi

# The backend binds 7007; refuse to start on top of an in-cluster RHDH forward.
if command -v lsof >/dev/null 2>&1; then
  pids="$(lsof -nP -tiTCP:7007 -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -n "${pids}" ]]; then
    echo "error: localhost:7007 is already in use (pid ${pids}). The backend needs that port." >&2
    exit 1
  fi
fi

echo "==> kubectl context '${ctx}' (${want}); building app + backend (yarn build)"
yarn build

echo "==> starting Dex + backend serving the built app at http://localhost:7007"
# Dex first (needed for OIDC), then the backend serving the static bundle with
# the single-port override layered on. concurrently keeps both in one process
# group so Ctrl-C / CI teardown stops them together.
exec yarn concurrently -k -n dex,backend -c blue,green \
  "yarn dev:setup-dex && yarn dev:dex" \
  "yarn dev:backend:built"
