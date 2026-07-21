#!/usr/bin/env bash
set -euo pipefail

# create an oinc cluster with kuadrant, istio, metallb, cert-manager and gateway
# api, then apply the demo resources the catalog e2e and local dev depend on.
#
# oinc v0.3.1 addon options do the generic instance creation this script used to
# hand-roll:
#   --kuadrant-devportal        enable developerPortal on the Kuadrant CR
#                               (persist-verified) and wait for its controller
#   --metallb-address-pool auto create an IPAddressPool + L2Advertisement, range
#                               derived from the container network
#   --gateway-api-gateway       create the default kuadrant-ingressgateway and
#                               wait until it is programmed (needs the metallb
#                               pool for its address, so the two go together)
# only the kuadrant demo manifests stay consumer-side; oinc ships none.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

# shellcheck source=lib.sh
source "${SCRIPT_DIR}/lib.sh"

check_command oinc "Install from https://github.com/jasonmadigan/oinc (v0.3.1+)"
check_command kubectl "Install from https://kubernetes.io/docs/tasks/tools/"

# pin to a soaked ocp release; oinc defaults to the newest, which lags in ci.
OCP_VERSION="${OCP_VERSION:-4.21}"
# Pin the version exercised by this path; callers can override it explicitly.
KUADRANT_VERSION="${KUADRANT_VERSION:-1.5.1}"

# --- cluster + addons ---

# dump kuadrant state on a failed create so ci logs are diagnosable, not opaque.
# create now also enables the portal and creates the pool + gateway, so a wedge
# in any of those surfaces here too.
dump_kuadrant_diagnostics() {
  log "oinc create failed - dumping kuadrant diagnostics..."
  kubectl get kuadrant kuadrant -n kuadrant-system -o yaml 2>&1 || true
  kubectl get pods -n kuadrant-system -o wide 2>&1 || true
  kubectl logs deployment/kuadrant-operator-controller-manager -n kuadrant-system \
    --tail=200 --all-containers 2>&1 || true
}

# errexit is suspended for an `if` condition, so a failed create falls through to
# the diagnostics dump and an explicit exit instead of dying silently.
log "creating oinc cluster (ocp ${OCP_VERSION}, kuadrant@${KUADRANT_VERSION}) with developer portal, metallb pool and default gateway..."
if ! oinc create --version "${OCP_VERSION}" --addons "kuadrant@${KUADRANT_VERSION}" \
  --kuadrant-devportal \
  --metallb-address-pool auto \
  --gateway-api-gateway; then
  dump_kuadrant_diagnostics
  exit 1
fi

# --- demo resources ---

log "applying demo resources..."
# retry per file: the demo manifests include apikey/planpolicy kinds whose crds
# can lag apiproducts on a fresh cluster, so a first apply may race crd
# establishment. bounded retry rides that out, then fails loud with the kubectl
# error visible - the e2e depends on these apiproducts, and a silent skip only
# resurfaces later as an opaque catalog-gate timeout.
apply_demo() {
  local file="$1" attempt=1 max=5
  while true; do
    if kubectl apply -f "${file}"; then
      return 0
    fi
    if [ "${attempt}" -ge "${max}" ]; then
      log "error: failed to apply ${file} after ${max} attempts"
      return 1
    fi
    log "apply ${file##*/} failed (try ${attempt}/${max}), retrying in 6s..."
    attempt=$((attempt + 1))
    sleep 6
  done
}

for f in toystore-demo.yaml gamestore-demo.yaml additional-demos.yaml; do
  apply_demo "${REPO_DIR}/kuadrant-dev-setup/demo/${f}" || exit 1
done

# --- done ---

echo ""
echo "============================================"
echo " oinc cluster ready"
echo "============================================"
echo ""
echo " Cluster has: Gateway API, cert-manager, MetalLB, Istio, Kuadrant"
echo " (developer portal, address pool, default gateway), demo resources"
echo ""
echo " OpenShift Console:"
echo "   http://localhost:9000"
echo ""
echo " To install RHDH on this cluster:"
echo "   ./oinc/setup-rhdh.sh"
echo ""
