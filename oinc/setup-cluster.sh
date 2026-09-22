#!/usr/bin/env bash
set -euo pipefail

# Create an oinc v0.5.3+ cluster, then add demos and the host-side SA.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

# shellcheck source=lib.sh
source "${SCRIPT_DIR}/lib.sh"

check_command oinc "Install from https://github.com/jasonmadigan/oinc"
check_command kubectl "Install from https://kubernetes.io/docs/tasks/tools/"

# default matches kuadrant-console-plugin (mcp-gateway is exercised there on 4.22).
OCP_VERSION="${OCP_VERSION:-4.22}"
# console-plugin defaults to latest; override (e.g. KUADRANT_VERSION=1.4.4) to pin.
KUADRANT_VERSION="${KUADRANT_VERSION:-latest}"

# same addon list as kuadrant-console-plugin/scripts/cluster-setup.sh, including
# mcp-gateway (console-plugin#720). kuadrant already depends on gateway-api,
# cert-manager, metallb, and istio; listing them keeps the stack explicit.
ADDONS="gateway-api,cert-manager,metallb,istio,kuadrant@${KUADRANT_VERSION},mcp-gateway"

# oinc configures the default Gateway for its scoped MetalLB controller.
create_args=(create --version "${OCP_VERSION}" --addons "${ADDONS}"
  --metallb-address-pool auto --gateway-api-gateway)

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

# --- developer portal (same merge-patch as console-plugin) ---

log "patch kuadrant to enable developer portal controller..."
kubectl patch kuadrant kuadrant -n kuadrant-system --type merge --patch '{"spec": {"components": {"developerPortal": {"enabled": true}}}}'

# --- demo resources ---

log "applying demo resources..."
# The overlay adds the Service class before Istio creates demo Gateway Services.
kubectl kustomize --load-restrictor=LoadRestrictionsNone "${SCRIPT_DIR}/manifests/demos" | kubectl apply -f -

log "applying MCP demo resources..."
kubectl create namespace toystore 2>/dev/null || true
kubectl apply -f "${SCRIPT_DIR}/manifests/mcp-demo.yaml"

# The MCP Gateway addon creates its Gateway independently of the demo
# resources, so it does not inherit the local MetalLB service parameters used
# by the demo Gateways above. Apply those parameters explicitly; without them
# the generated LoadBalancer Service remains pending and host-run Backstage
# falls back to the MCP publicHost (127.0.0.1:80).
log "configuring the MCP Gateway LoadBalancer..."
kubectl apply -f "${SCRIPT_DIR}/manifests/mcp-gateway-parameters.yaml"
kubectl patch gateway mcp-gateway -n gateway-system --type merge \
  --patch '{"spec":{"infrastructure":{"parametersRef":{"group":"","kind":"ConfigMap","name":"mcp-gateway-parameters"}}}}'
# loadBalancerClass is immutable on a Service. The Gateway controller owns this
# generated Service, so recreate it once for the new parameters to take effect.
kubectl delete service mcp-gateway-istio -n gateway-system --ignore-not-found
kubectl wait --for=condition=Programmed gateway/mcp-gateway \
  -n gateway-system --timeout=120s

# --- host-side SA for local yarn dev ---
# same ServiceAccount and ClusterRoleBinding as kind-create, so kube-env-setup.sh
# can write K8S_URL / K8S_CLUSTER_TOKEN into .env. distinct from the in-cluster
# RHDH SA in oinc/manifests/rhdh-sa.yaml, which setup-rhdh.sh applies later.

log "creating host-side rhdh service account and rbac..."
kubectl apply -f "${REPO_DIR}/kuadrant-dev-setup/rbac/rhdh-cluster-role.yaml" \
  -f "${REPO_DIR}/kuadrant-dev-setup/rbac/rhdh-rbac.yaml"

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
