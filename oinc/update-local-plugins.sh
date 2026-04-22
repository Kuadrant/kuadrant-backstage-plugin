#!/usr/bin/env bash
# updates local dynamic plugins in the PVC after code changes
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

# shellcheck source=lib.sh
source "${SCRIPT_DIR}/lib.sh"

# --- check for local dynamic plugins ---

FRONTEND_DIST="${REPO_DIR}/plugins/kuadrant/dist-dynamic"
BACKEND_DIST="${REPO_DIR}/plugins/kuadrant-backend/dist-dynamic"

if [ ! -d "${FRONTEND_DIST}" ] || [ ! -d "${BACKEND_DIST}" ]; then
  log "error: local dynamic plugins not found"
  log "  frontend: ${FRONTEND_DIST}"
  log "  backend:  ${BACKEND_DIST}"
  log ""
  log "build plugins first:"
  log "  yarn build"
  log "  cd plugins/kuadrant && yarn export-dynamic"
  log "  cd ../kuadrant-backend && yarn export-dynamic"
  exit 1
fi

# --- check PVC exists ---

if ! kubectl get pvc rhdh-dynamic-plugins-local -n rhdh &>/dev/null; then
  log "error: PVC rhdh-dynamic-plugins-local not found in namespace rhdh"
  log "run setup-rhdh.sh first to create the PVC"
  exit 1
fi

log "copying updated plugins to PVC..."

# create temporary pod to mount the PVC
kubectl apply -n rhdh -f - <<EOF
apiVersion: v1
kind: Pod
metadata:
  name: rhdh-plugin-copier
  namespace: rhdh
spec:
  containers:
  - name: copier
    image: registry.access.redhat.com/ubi9/ubi-minimal:latest
    command: ["sleep", "300"]
    volumeMounts:
    - name: dynamic-plugins
      mountPath: /dynamic-plugins-root
  volumes:
  - name: dynamic-plugins
    persistentVolumeClaim:
      claimName: rhdh-dynamic-plugins-local
  restartPolicy: Never
EOF

kubectl wait --for=condition=Ready pod/rhdh-plugin-copier -n rhdh --timeout=120s

log "copying frontend plugin..."
kubectl cp "${FRONTEND_DIST}/." rhdh/rhdh-plugin-copier:/dynamic-plugins-root/kuadrant-frontend/

log "copying backend plugin..."
kubectl cp "${BACKEND_DIST}/." rhdh/rhdh-plugin-copier:/dynamic-plugins-root/kuadrant-backend/

log "cleaning up copier pod..."
kubectl delete pod rhdh-plugin-copier -n rhdh --wait=true

echo ""
echo "============================================"
echo " Plugins updated successfully"
echo "============================================"
echo ""
echo " Restart RHDH to load the new plugins:"
echo "   kubectl rollout restart deployment/rhdh-developer-hub -n rhdh"
echo ""
