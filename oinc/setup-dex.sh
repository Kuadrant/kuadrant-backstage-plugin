#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

# shellcheck source=lib.sh
source "${SCRIPT_DIR}/lib.sh"

DEX_CONFIG="${REPO_DIR}/kuadrant-dev-setup/dex/config.yaml"
DEX_PASSWORD_TEMPLATE="${REPO_DIR}/kuadrant-dev-setup/dex/web/templates/password.html"
DEX_URL="${DEX_URL:-http://dex.localhost:9080}"

check_command kubectl "Install from https://kubernetes.io/docs/tasks/tools/"

for file in "${DEX_CONFIG}" "${DEX_PASSWORD_TEMPLATE}"; do
  [ -f "${file}" ] || {
    log "error: ${file} not found"
    exit 1
  }
done

rendered_config=$(mktemp)
trap 'rm -f "${rendered_config}"' EXIT
sed -E "s|^issuer:[[:space:]].*|issuer: ${DEX_URL}|" \
  "${DEX_CONFIG}" >"${rendered_config}"

kubectl apply -f - <<'EOF'
apiVersion: v1
kind: Namespace
metadata:
  name: localhost
EOF

existed=false
kubectl -n localhost get deployment/dex &>/dev/null && existed=true

kubectl create configmap dex-config -n localhost \
  --from-file=config.yaml="${rendered_config}" \
  --dry-run=client -o yaml | kubectl apply -f -
kubectl create configmap dex-web -n localhost \
  --from-file=password.html="${DEX_PASSWORD_TEMPLATE}" \
  --dry-run=client -o yaml | kubectl apply -f -
kubectl apply -f "${SCRIPT_DIR}/manifests/dex.yaml"

if [ "${existed}" = true ]; then
  kubectl -n localhost rollout restart deployment/dex
fi
kubectl -n localhost rollout status deployment/dex --timeout=180s
log "dex ready at ${DEX_URL}"
