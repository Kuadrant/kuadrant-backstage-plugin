#!/usr/bin/env bash
set -euo pipefail

# create an oinc cluster with the same Kuadrant/GWAPI stack as
# kuadrant-console-plugin/scripts/cluster-setup.sh (console-plugin CI pins
# oinc v0.4.3). then add this repo's demos and host-side SA for yarn-dev.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

# shellcheck source=lib.sh
source "${SCRIPT_DIR}/lib.sh"

check_command oinc "Install from https://github.com/jasonmadigan/oinc"
check_command kubectl "Install from https://kubernetes.io/docs/tasks/tools/"

RUNTIME=$(detect_runtime)

# default matches kuadrant-console-plugin (mcp-gateway is exercised there on 4.22).
OCP_VERSION="${OCP_VERSION:-4.22}"
# console-plugin defaults to latest; override (e.g. KUADRANT_VERSION=1.4.4) to pin.
KUADRANT_VERSION="${KUADRANT_VERSION:-latest}"

# same addon list as kuadrant-console-plugin/scripts/cluster-setup.sh, including
# mcp-gateway (console-plugin#720). kuadrant already depends on gateway-api,
# cert-manager, metallb, and istio; listing them keeps the stack explicit.
ADDONS="gateway-api,cert-manager,metallb,istio,kuadrant@${KUADRANT_VERSION},mcp-gateway"

# console-plugin: oinc create --addons ... --metallb-address-pool auto
# then kubectl-patch developerPortal and apply a class-less Gateway.
# do not pass --gateway-api-gateway: that stamps loadBalancerClass
# oinc.io/metallb, which unscoped metallb (pool mode) ignores, so the
# Gateway never gets an IP. do not pass --kuadrant-devportal: console-plugin
# enables the portal with the same merge-patch after create.
create_args=(create --version "${OCP_VERSION}" --addons "${ADDONS}")
use_oinc_metallb=0
if oinc create --help 2>&1 | grep -q -- --metallb-address-pool; then
  create_args+=(--metallb-address-pool auto)
  use_oinc_metallb=1
else
  log "warning: oinc CLI missing --metallb-address-pool (need >= v0.4.2; kuadrant-console-plugin CI pins v0.4.3). falling back to kubectl MetalLB pool."
fi

dump_kuadrant_diagnostics() {
  log "oinc create failed - dumping kuadrant addon diagnostics..."
  kubectl get kuadrant kuadrant -n kuadrant-system -o yaml 2>&1 || true
  kubectl get pods -n kuadrant-system -o wide 2>&1 || true
  kubectl get events -n kuadrant-system --sort-by='.lastTimestamp' 2>&1 || true
  kubectl logs deployment/kuadrant-operator-controller-manager -n kuadrant-system --tail=200 --all-containers 2>&1 || true
}

# bash suspends `set -e` for a command used as an `if` condition, so a failed
# `oinc create` falls through to the diagnostics dump (same as console-plugin).
log "creating oinc cluster (ocp ${OCP_VERSION}) with addons (${ADDONS})..."
if ! oinc "${create_args[@]}"; then
  dump_kuadrant_diagnostics
  exit 1
fi

log "merging kubeconfig..."
oinc kubeconfig

# never apply demos/SA to a remote OpenShift (or kind) context
ctx="$(kubectl config current-context 2>/dev/null || true)"
if [[ "${ctx}" != "oinc" ]]; then
  echo "error: kubectl context is '${ctx:-<none>}', not oinc." >&2
  echo "       oinc kubeconfig should have selected it; switch with: kubectl config use-context oinc" >&2
  exit 1
fi

# --- MetalLB IP pool (only if this oinc CLI cannot --metallb-address-pool) ---
# console-plugin dropped the hand-rolled .200-.220 pool once oinc grew the
# flag; oinc names the pool oinc-pool / L2Advertisement oinc-l2.

if [[ "${use_oinc_metallb}" -eq 0 ]]; then
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
fi

# --- developer portal (same merge-patch as console-plugin) ---

log "patch kuadrant to enable developer portal controller..."
kubectl patch kuadrant kuadrant -n kuadrant-system --type merge --patch '{"spec": {"components": {"developerPortal": {"enabled": true}}}}'

# --- Gateway (same class-less spec as console-plugin) ---
# a class-less Gateway lets unscoped metallb assign an IP from oinc-pool.

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

log "applying MCP demo resources..."
kubectl create namespace toystore 2>/dev/null || true
kubectl apply -f "${SCRIPT_DIR}/manifests/mcp-demo.yaml"

# --- host-side SA for local yarn dev ---
# same ServiceAccount and ClusterRoleBinding as kind-create, so kube-env-setup.sh
# can write K8S_URL / K8S_CLUSTER_TOKEN into .env. distinct from the in-cluster
# RHDH SA in oinc/manifests/rhdh-sa.yaml, which setup-rhdh.sh applies later.

log "creating host-side rhdh service account and rbac..."
kubectl apply -f "${REPO_DIR}/kuadrant-dev-setup/rbac/rhdh-rbac.yaml"

log "writing K8S_URL and K8S_CLUSTER_TOKEN to .env for yarn dev..."
"${REPO_DIR}/kuadrant-dev-setup/scripts/kube-env-setup.sh"

# --- done ---

echo ""
echo "============================================"
echo " oinc cluster ready"
echo "============================================"
echo ""
echo " Cluster has: Gateway API, cert-manager, MetalLB, Istio, Kuadrant (developer portal), MCP Gateway, demo resources"
echo ""
echo " OpenShift Console:"
echo "   http://localhost:9000"
echo ""
echo " Next (hot reload, Dex at http://localhost:3000):"
echo "   yarn dev:oinc"
echo ""
echo " Or install RHDH on this cluster (dynamic plugins, no hot reload):"
echo "   yarn oinc:rhdh"
echo ""
