#!/usr/bin/env bash
# sets up a MINC cluster with kuadrant, gateway api, istio, metallb, and demo resources.
# this is the base cluster that installation.md assumes as a prerequisite.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

# shellcheck source=lib.sh
source "${SCRIPT_DIR}/lib.sh"

# --- version pins ---

GATEWAY_API_VERSION="${GATEWAY_API_VERSION:-v1.2.1}"
CERTMANAGER_VERSION="${CERTMANAGER_VERSION:-v1.15.3}"
METALLB_VERSION="${METALLB_VERSION:-v0.13.7}"
SAIL_OPERATOR_VERSION="${SAIL_OPERATOR_VERSION:-1.27.1}"
CONSOLE_IMAGE="${CONSOLE_IMAGE:-quay.io/openshift/origin-console:latest}"
MINC_CONTAINER="${MINC_CONTAINER:-microshift}"

# --- prerequisites ---

check_command minc "Install from https://github.com/minc-org/minc"
check_command kubectl "Install from https://kubernetes.io/docs/tasks/tools/"
check_command helm "Install from https://helm.sh/docs/intro/install/"

RUNTIME=$(detect_runtime)
log "using container runtime: ${RUNTIME}"

# --- cluster ---

log "creating MINC cluster..."
if [ "$RUNTIME" = "docker" ]; then
  minc create --provider docker
else
  minc create --provider podman
fi

wait_for_api

# --- fix CRI-O storage for OrbStack ---
# OrbStack mounts /host-container as read-only which breaks CRI-O's
# additionalimagestores. Must fix before node can become Ready.

if ${RUNTIME} exec "${MINC_CONTAINER}" grep -q 'additionalimagestores.*host-container' /etc/containers/storage.conf 2>/dev/null; then
  log "fixing CRI-O storage config (removing read-only host-container store)..."
  ${RUNTIME} exec "${MINC_CONTAINER}" sed -i 's|"/host-container"||' /etc/containers/storage.conf
  ${RUNTIME} exec "${MINC_CONTAINER}" systemctl restart crio
  sleep 5
fi

wait_for_node

# --- Gateway API ---

log "installing Gateway API CRDs (${GATEWAY_API_VERSION})..."
kubectl apply -f "https://github.com/kubernetes-sigs/gateway-api/releases/download/${GATEWAY_API_VERSION}/standard-install.yaml"

# --- cert-manager ---

log "installing cert-manager ${CERTMANAGER_VERSION}..."
helm repo add jetstack https://charts.jetstack.io --force-update
helm install cert-manager jetstack/cert-manager \
  --namespace cert-manager \
  --create-namespace \
  --version "${CERTMANAGER_VERSION}" \
  --set crds.enabled=true \
  --wait --timeout 120s

# --- MetalLB ---

log "installing MetalLB ${METALLB_VERSION}..."
kubectl apply -f "https://raw.githubusercontent.com/metallb/metallb/${METALLB_VERSION}/config/manifests/metallb-native.yaml"

# SCC patches for MicroShift
kubectl patch scc privileged --type=json \
  -p '[{"op":"add","path":"/users/-","value":"system:serviceaccount:metallb-system:controller"},{"op":"add","path":"/users/-","value":"system:serviceaccount:metallb-system:speaker"}]' 2>/dev/null || true

kubectl -n metallb-system wait --for=condition=Available deployment/controller --timeout=120s

# auto-detect subnet for IP pool
DOCKER_SUBNET=$(${RUNTIME} network inspect bridge -f '{{range .IPAM.Config}}{{.Subnet}}{{end}}' 2>/dev/null || echo "172.18.0.0/16")
POOL_START=$(echo "${DOCKER_SUBNET}" | sed 's|\.[0-9]*/.*|.200|')
POOL_END=$(echo "${DOCKER_SUBNET}" | sed 's|\.[0-9]*/.*|.220|')

log "MetalLB pool: ${POOL_START}-${POOL_END}"
kubectl apply -f - <<EOF
apiVersion: metallb.io/v1beta1
kind: IPAddressPool
metadata:
  name: minc-pool
  namespace: metallb-system
spec:
  addresses:
  - ${POOL_START}-${POOL_END}
---
apiVersion: metallb.io/v1beta1
kind: L2Advertisement
metadata:
  name: minc-l2
  namespace: metallb-system
EOF

# --- Istio (via Sail Operator) ---

log "installing Sail operator (Istio ${SAIL_OPERATOR_VERSION})..."
helm install sail-operator \
  --create-namespace \
  --namespace istio-system \
  --wait --timeout=300s \
  "https://github.com/istio-ecosystem/sail-operator/releases/download/${SAIL_OPERATOR_VERSION}/sail-operator-${SAIL_OPERATOR_VERSION}.tgz"

log "creating Istio instance..."
kubectl apply -f - <<EOF
apiVersion: sailoperator.io/v1
kind: Istio
metadata:
  name: default
spec:
  version: v${SAIL_OPERATOR_VERSION}
  namespace: istio-system
  values:
    pilot:
      autoscaleEnabled: false
EOF

log "waiting for Istio..."
RETRIES=60
while true; do
  ISTIO_READY=$(kubectl get istio default -o jsonpath='{.status.conditions[?(@.type=="Ready")].status}' 2>/dev/null || true)
  if [ "${ISTIO_READY}" = "True" ]; then break; fi
  RETRIES=$((RETRIES - 1))
  if [ "$RETRIES" -le 0 ]; then
    log "warning: Istio not fully ready after 300s, continuing..."
    break
  fi
  sleep 5
done

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

# --- Kuadrant Operator ---

log "installing Kuadrant operator..."
helm repo add kuadrant https://kuadrant.io/helm-charts/ --force-update
helm install kuadrant-operator kuadrant/kuadrant-operator \
  --namespace kuadrant-system \
  --create-namespace \
  --wait --timeout 180s || {
    log "warning: helm install did not fully complete"
    log "checking CRDs are registered..."
    kubectl get crd authpolicies.kuadrant.io || { echo "error: kuadrant CRDs not installed"; exit 1; }
  }

log "creating Kuadrant instance..."
kubectl apply -f "${REPO_DIR}/kuadrant-dev-setup/kuadrant-instance.yaml"

log "waiting for Kuadrant..."
RETRIES=60
while true; do
  READY=$(kubectl get kuadrant kuadrant -n kuadrant-system -o jsonpath='{.status.conditions[?(@.type=="Ready")].status}' 2>/dev/null || true)
  if [ "${READY}" = "True" ]; then break; fi
  RETRIES=$((RETRIES - 1))
  if [ "$RETRIES" -le 0 ]; then
    log "warning: Kuadrant not fully ready after 300s"
    break
  fi
  sleep 5
done
log "Kuadrant ready"

# --- OpenShift Console ---
# runs as a host container (not in-cluster) because the console image is amd64-only
# and CRI-O inside MicroShift can't use Rosetta/qemu emulation.

log "deploying OpenShift Console SA..."
kubectl apply -f "${SCRIPT_DIR}/manifests/console.yaml"

CONSOLE_TOKEN=$(kubectl create token openshift-console -n kube-system --duration=8760h)
API_SERVER=$(kubectl config view --minify -o jsonpath='{.clusters[0].cluster.server}')

if [ "$(uname -s)" = "Linux" ]; then
  CONTAINER_API_SERVER="${API_SERVER}"
  CONSOLE_NET_ARGS="--network=host"
  CONSOLE_PORT_ARGS=""
else
  if [ "${RUNTIME}" = "podman" ]; then
    CONTAINER_HOST="host.containers.internal"
  else
    CONTAINER_HOST="host.docker.internal"
  fi
  CONTAINER_API_SERVER=$(echo "${API_SERVER}" | sed "s|127\.0\.0\.1\.nip\.io|${CONTAINER_HOST}|g" | sed "s|127\.0\.0\.1|${CONTAINER_HOST}|g" | sed "s|localhost|${CONTAINER_HOST}|g")
  CONSOLE_NET_ARGS=""
  CONSOLE_PORT_ARGS="-p 9000:9000"
fi

${RUNTIME} rm -f minc-console 2>/dev/null || true
${RUNTIME} run -d --name minc-console --platform linux/amd64 \
  ${CONSOLE_NET_ARGS} ${CONSOLE_PORT_ARGS} \
  -e BRIDGE_USER_AUTH=disabled \
  -e BRIDGE_K8S_MODE=off-cluster \
  -e BRIDGE_K8S_AUTH=bearer-token \
  -e BRIDGE_K8S_AUTH_BEARER_TOKEN="${CONSOLE_TOKEN}" \
  -e BRIDGE_K8S_MODE_OFF_CLUSTER_ENDPOINT="${CONTAINER_API_SERVER}" \
  -e BRIDGE_K8S_MODE_OFF_CLUSTER_SKIP_VERIFY_TLS=true \
  -e BRIDGE_USER_SETTINGS_LOCATION=localstorage \
  "${CONSOLE_IMAGE}"

log "waiting for console..."
RETRIES=30
while ! curl -sf http://localhost:9000 >/dev/null 2>&1; do
  RETRIES=$((RETRIES - 1))
  if [ "$RETRIES" -le 0 ]; then
    log "warning: console not reachable after 60s, continuing..."
    break
  fi
  sleep 2
done

# --- demo resources ---

log "applying demo resources..."
# order matters: toystore/gamestore create namespaces that additional-demos depends on
for f in toystore-demo.yaml gamestore-demo.yaml additional-demos.yaml; do
  kubectl apply -f "${REPO_DIR}/kuadrant-dev-setup/demo/${f}" || log "warning: failed to apply ${f}"
done

# --- done ---

echo ""
echo "============================================"
echo " MINC cluster ready"
echo "============================================"
echo ""
echo " Cluster has: Gateway API, cert-manager, MetalLB, Istio, Kuadrant, demo resources"
echo ""
echo " OpenShift Console:"
echo "   http://localhost:9000"
echo ""
echo " To install RHDH on this cluster:"
echo "   ./minc/setup-rhdh.sh"
echo ""
