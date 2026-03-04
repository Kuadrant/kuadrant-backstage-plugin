#!/usr/bin/env bash
set -euo pipefail

# create an oinc cluster with kuadrant, istio, metallb, and a gateway.
# applies demo resources for local development.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

# shellcheck source=lib.sh
source "${SCRIPT_DIR}/lib.sh"

check_command oinc "Install from https://github.com/jasonmadigan/oinc"
check_command kubectl "Install from https://kubernetes.io/docs/tasks/tools/"

RUNTIME=$(detect_runtime)

# --- cluster + addons ---

log "creating oinc cluster with addons..."
oinc create --addons kuadrant

log "merging kubeconfig..."
oinc kubeconfig

# --- MetalLB IP pool ---

log "configuring MetalLB IP pool..."
DOCKER_SUBNET=$(${RUNTIME} network inspect bridge -f '{{range .IPAM.Config}}{{.Subnet}}{{end}}' 2>/dev/null || echo "172.18.0.0/16")
POOL_START=$(echo "${DOCKER_SUBNET}" | sed 's|\.[0-9]*/.*|.200|')
POOL_END=$(echo "${DOCKER_SUBNET}" | sed 's|\.[0-9]*/.*|.220|')

log "MetalLB pool: ${POOL_START}-${POOL_END}"
kubectl apply -f - <<EOF
apiVersion: metallb.io/v1beta1
kind: IPAddressPool
metadata:
  name: dev-pool
  namespace: metallb-system
spec:
  addresses:
  - ${POOL_START}-${POOL_END}
---
apiVersion: metallb.io/v1beta1
kind: L2Advertisement
metadata:
  name: dev-l2
  namespace: metallb-system
EOF

# --- Gateway ---

log "creating gateway..."
kubectl create namespace gateway-system 2>/dev/null || true
kubectl apply -f - <<EOF
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: kuadrant-ingressgateway
  namespace: gateway-system
spec:
  gatewayClassName: istio
  listeners:
  - name: http
    port: 80
    protocol: HTTP
    allowedRoutes:
      namespaces:
        from: All
EOF

# --- demo resources ---

log "applying demo resources..."
for f in toystore-demo.yaml gamestore-demo.yaml additional-demos.yaml; do
  kubectl apply -f "${REPO_DIR}/kuadrant-dev-setup/demo/${f}" || log "warning: failed to apply ${f}"
done

# --- done ---

echo ""
echo "============================================"
echo " oinc cluster ready"
echo "============================================"
echo ""
echo " Cluster has: Gateway API, cert-manager, MetalLB, Istio, Kuadrant, demo resources"
echo ""
echo " OpenShift Console:"
echo "   http://localhost:9000"
echo ""
echo " To install RHDH on this cluster:"
echo "   ./oinc/setup-rhdh.sh"
echo ""
