#!/usr/bin/env bash
# Guarded host-app starter: checks kubectl context (and :7007) then runs `yarn dev`.
# Usage: scripts/dev-with-cluster.sh oinc|kind
# package.json `dev` lists concurrently targets by name. Do not switch that
# to a yarn:dev:* glob: it would also match `yarn dev:kind` and `yarn dev:oinc` and recurse.
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
    echo "       (or use yarn dev:kind if this is a kind cluster)" >&2
    exit 1
  fi
else
  if [[ "${ctx}" != kind-* ]]; then
    echo "error: kubectl context is '${ctx}', not a kind cluster (expected kind-*)." >&2
    echo "       make -C kuadrant-dev-setup kind-create" >&2
    echo "       (or use yarn dev:oinc if this is oinc)" >&2
    exit 1
  fi
fi

# yarn-dev backend binds 7007; in-cluster RHDH is often forwarded there (Guest).
if command -v lsof >/dev/null 2>&1; then
  pids="$(lsof -nP -tiTCP:7007 -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -n "${pids}" ]]; then
    kubectl_hold=0
    for pid in ${pids}; do
      args="$(ps -p "${pid}" -o args= 2>/dev/null || true)"
      case "${args}" in
        *kubectl*port-forward*)
          kubectl_hold=1
          ;;
      esac
    done
    if [[ "${kubectl_hold}" -eq 1 ]]; then
      echo "error: localhost:7007 is a kubectl port-forward (in-cluster RHDH / Guest)." >&2
      echo "       stop it, then yarn dev:${want} and open http://localhost:3000 (Dex/OIDC), not :7007." >&2
      exit 1
    fi
    echo "error: localhost:7007 is already in use (pid ${pids}). yarn-dev's backend needs that port." >&2
    exit 1
  fi
fi

echo "==> kubectl context '${ctx}' (${want}); starting yarn dev (Dex at http://localhost:3000)"
exec yarn dev
