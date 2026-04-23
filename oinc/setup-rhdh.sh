#!/usr/bin/env bash
# installs and configures RHDH on an existing oinc cluster.
# expects setup-cluster.sh to have been run first.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

# shellcheck source=lib.sh
source "${SCRIPT_DIR}/lib.sh"

FRONTEND_PKG="@kuadrant/kuadrant-backstage-plugin-frontend"
BACKEND_PKG="@kuadrant/kuadrant-backstage-plugin-backend-dynamic"

# --- prerequisites ---

check_command kubectl "Install from https://kubernetes.io/docs/tasks/tools/"

kubectl get crd kuadrants.kuadrant.io &>/dev/null || {
  log "error: kuadrant CRDs not found. Run setup-cluster.sh first."
  exit 1
}

# --- RHDH via Operator ---

log "installing RHDH operator via OLM..."

# Check for OLM
kubectl get crd subscriptions.operators.coreos.com &>/dev/null || {
  log "error: OLM not found. Ensure your cluster has OLM installed."
  exit 1
}

# Check for registry credentials
ENV_FILE="${SCRIPT_DIR}/.env"
if [ ! -f "${ENV_FILE}" ]; then
  log "error: Red Hat registry credentials not found"
  log "  create ${ENV_FILE} with your credentials:"
  log "  cp ${SCRIPT_DIR}/.env.example ${ENV_FILE}"
  log ""
  log "  Get credentials from: https://access.redhat.com/terms-based-registry/"
  exit 1
fi

# Source credentials
# shellcheck disable=SC1090
source "${ENV_FILE}"

if [ -z "${REDHAT_REGISTRY_USERNAME}" ] || [ -z "${REDHAT_REGISTRY_PASSWORD}" ]; then
  log "error: REDHAT_REGISTRY_USERNAME or REDHAT_REGISTRY_PASSWORD not set in ${ENV_FILE}"
  exit 1
fi

# Detect cluster version
CLUSTER_VERSION=$(kubectl get configmap -n kube-public microshift-version -o jsonpath='{.data.version}' 2>/dev/null | grep -oE '[0-9]+\.[0-9]+' | head -1)
if [ -z "${CLUSTER_VERSION}" ]; then
  log "warning: could not detect cluster version, defaulting to 4.21"
  CLUSTER_VERSION="4.21"
fi
log "detected cluster version: ${CLUSTER_VERSION}"

# Create catalog source for Red Hat operators (this creates the service account)
log "creating Red Hat operator catalog source..."
kubectl apply -f - <<EOF
apiVersion: operators.coreos.com/v1alpha1
kind: CatalogSource
metadata:
  name: redhat-operators
  namespace: openshift-marketplace
spec:
  sourceType: grpc
  image: registry.redhat.io/redhat/redhat-operator-index:v${CLUSTER_VERSION}
  displayName: Red Hat Operators
  publisher: Red Hat
  updateStrategy:
    registryPoll:
      interval: 10m
EOF

# Wait for OLM to create the service account for this catalog
log "waiting for catalog service account to be created..."
for i in {1..30}; do
  if kubectl get serviceaccount redhat-operators -n openshift-marketplace &>/dev/null; then
    break
  fi
  sleep 2
done

# Create pull secret for Red Hat registry in openshift-marketplace
log "creating registry pull secret in openshift-marketplace..."
kubectl create secret docker-registry redhat-pull-secret \
  --namespace=openshift-marketplace \
  --docker-server=registry.redhat.io \
  --docker-username="${REDHAT_REGISTRY_USERNAME}" \
  --docker-password="${REDHAT_REGISTRY_PASSWORD}" \
  --dry-run=client -o yaml | kubectl apply -f -

kubectl patch serviceaccount default -n openshift-marketplace -p \
  '{"imagePullSecrets": [{"name": "redhat-pull-secret"}]}'

# Link pull secret to the OLM-created service account for this catalog
log "linking pull secret to catalog service account..."
kubectl patch serviceaccount redhat-operators -n openshift-marketplace -p \
  '{"imagePullSecrets": [{"name": "redhat-pull-secret"}]}'

# Create pull secret for Red Hat registry in openshift-operators (for operator images)
log "creating registry pull secret in openshift-operators..."
kubectl create secret docker-registry redhat-pull-secret \
  --namespace=openshift-operators \
  --docker-server=registry.redhat.io \
  --docker-username="${REDHAT_REGISTRY_USERNAME}" \
  --docker-password="${REDHAT_REGISTRY_PASSWORD}" \
  --dry-run=client -o yaml | kubectl apply -f -

# Delete existing catalog pod to force recreation with pull secret
log "restarting catalog pod with authentication..."
kubectl delete pod -n openshift-marketplace -l olm.catalogSource=redhat-operators --ignore-not-found=true

log "waiting for catalog to be ready..."
kubectl wait --for=jsonpath='{.status.connectionState.lastObservedState}'=READY \
  catalogsource/redhat-operators -n openshift-marketplace --timeout=300s

# Create Subscription for RHDH operator v1.8.6
log "creating RHDH operator subscription..."
kubectl apply -n openshift-operators -f - <<EOF
apiVersion: operators.coreos.com/v1alpha1
kind: Subscription
metadata:
  name: rhdh
  namespace: openshift-operators
spec:
  channel: fast-1.8
  name: rhdh
  source: redhat-operators
  sourceNamespace: openshift-marketplace
  installPlanApproval: Automatic
  startingCSV: rhdh-operator.v1.8.6
EOF

log "waiting for RHDH operator subscription to be ready..."
kubectl wait --for=condition=CatalogSourcesUnhealthy=False subscription/rhdh -n openshift-operators --timeout=300s || true
kubectl wait --for=jsonpath='{.status.state}'=AtLatestKnown subscription/rhdh -n openshift-operators --timeout=300s

log "waiting for RHDH operator service account to be created..."
for i in {1..60}; do
  if kubectl get serviceaccount rhdh-controller-manager -n openshift-operators &>/dev/null; then
    log "RHDH operator service account found"
    break
  fi
  sleep 5
done

log "linking pull secret to RHDH operator service account..."
kubectl patch serviceaccount rhdh-controller-manager -n openshift-operators -p \
  '{"imagePullSecrets": [{"name": "redhat-pull-secret"}]}'

log "waiting for RHDH operator deployment to be created..."
for i in {1..60}; do
  if kubectl get deployment rhdh-operator -n openshift-operators &>/dev/null; then
    log "RHDH operator deployment found"
    break
  fi
  sleep 5
done

# Delete operator pod to force recreation with pull secret
log "restarting RHDH operator pod with authentication..."
kubectl delete pod -n openshift-operators -l app=rhdh-operator --ignore-not-found=true

log "waiting for RHDH operator deployment to be ready..."
kubectl wait --for=condition=Available deployment/rhdh-operator -n openshift-operators --timeout=300s

# --- check for local dynamic plugins ---

FRONTEND_DIST="${REPO_DIR}/plugins/kuadrant/dist-scalprum"
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

log "found local dynamic plugins:"
log "  frontend: ${FRONTEND_DIST}"
log "  backend:  ${BACKEND_DIST}"

# --- create PVC and copy local plugins ---

log "creating PVC for local plugins..."
kubectl apply -n rhdh -f - <<EOF
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: rhdh-dynamic-plugins-local
  namespace: rhdh
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 1Gi
EOF

log "waiting for PVC to be bound..."
kubectl wait --for=jsonpath='{.status.phase}'=Bound pvc/rhdh-dynamic-plugins-local -n rhdh --timeout=60s

log "copying local plugins to PVC..."
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
    command: ["sleep", "3600"]
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
kubectl exec -n rhdh rhdh-plugin-copier -- mkdir -p /dynamic-plugins-root/kuadrant-frontend
kubectl cp "${FRONTEND_DIST}/." rhdh/rhdh-plugin-copier:/dynamic-plugins-root/kuadrant-frontend/

log "copying backend plugin..."
kubectl exec -n rhdh rhdh-plugin-copier -- mkdir -p /dynamic-plugins-root/kuadrant-backend
kubectl cp "${BACKEND_DIST}/." rhdh/rhdh-plugin-copier:/dynamic-plugins-root/kuadrant-backend/

log "cleaning up copier pod..."
kubectl delete pod rhdh-plugin-copier -n rhdh --wait=true

# --- RHDH SA + RBAC ---

log "applying RHDH service account and RBAC..."
kubectl apply -f "${SCRIPT_DIR}/manifests/rhdh-sa.yaml"

# --- RHDH configuration ---

log "creating RHDH configuration..."
kubectl apply -f "${SCRIPT_DIR}/manifests/app-config-rhdh.yaml"

# rbac policy from repo root, with guest as api-admin for local dev
OINC_RBAC=$(mktemp)
cat "${REPO_DIR}/rbac-policy.csv" >"${OINC_RBAC}"
echo "g, user:default/guest, role:default/api-admin" >>"${OINC_RBAC}"
kubectl create configmap rbac-policy-rhdh \
  --namespace rhdh \
  --from-file=rbac-policy.csv="${OINC_RBAC}" \
  --dry-run=client -o yaml | kubectl apply -f -
rm -f "${OINC_RBAC}"

# k8s credentials secret
kubectl apply -n rhdh -f - <<EOF
apiVersion: v1
kind: Secret
metadata:
  name: rhdh-k8s-credentials
  namespace: rhdh
type: Opaque
stringData:
  K8S_CLUSTER_URL: "${CLUSTER_URL}"
  K8S_CLUSTER_TOKEN: "${SA_TOKEN}"
EOF

log "creating Backstage CR..."
kubectl apply -n rhdh -f - <<EOF
apiVersion: rhdh.redhat.com/v1alpha1
kind: Backstage
metadata:
  name: rhdh
  namespace: rhdh
spec:
  application:
    appConfig:
      configMaps:
        - name: app-config-rhdh
    extraEnvs:
      secrets:
        - name: rhdh-k8s-credentials
    extraFiles:
      configMaps:
        - name: rbac-policy-rhdh
          key: rbac-policy.csv
          mountPath: rbac
    replicas: 1
    dynamicPluginsConfigMapName: rhdh-dynamic-plugins
    route:
      enabled: false
    extraVolumes:
      - name: dynamic-plugins-root-local
        persistentVolumeClaim:
          claimName: rhdh-dynamic-plugins-local
      - name: npmcacache
        emptyDir: {}
    extraVolumeMounts:
      - name: dynamic-plugins-root-local
        mountPath: /opt/app-root/src/dynamic-plugins-root
    initContainers:
      - name: install-dynamic-plugins
        image: quay.io/rhdh/rhdh-hub-rhel9:1.8
        command:
          - /bin/bash
          - -c
        args:
          - ./install-dynamic-plugins.sh /dynamic-plugins-root && cp /opt/app-root/src/dynamic-plugins.yaml /dynamic-plugins-root/dynamic-plugins.yaml
        env:
          - name: NPM_CONFIG_USERCONFIG
            value: /opt/app-root/src/.npmrc.dynamic-plugins
          - name: MAX_ENTRY_SIZE
            value: "30000000"
        workingDir: /opt/app-root/src
        volumeMounts:
          - mountPath: /dynamic-plugins-root
            name: dynamic-plugins-root
          - mountPath: /opt/app-root/src/dynamic-plugins.yaml
            name: dynamic-plugins
            readOnly: true
            subPath: dynamic-plugins.yaml
          - mountPath: /opt/app-root/src/.npmrc.dynamic-plugins
            name: dynamic-plugins-npmrc
            readOnly: true
            subPath: .npmrc
          - mountPath: /opt/app-root/src/.npm/_cacache
            name: npmcacache
        resources:
          requests:
            cpu: 250m
            memory: 256Mi
          limits:
            cpu: 1000m
            memory: 2.5Gi
            ephemeral-storage: 5Gi
    podSecurityContext:
      fsGroup: 1001
    containerSecurityContext:
      runAsNonRoot: true
      allowPrivilegeEscalation: false
      seccompProfile:
        type: RuntimeDefault
      capabilities:
        drop:
          - ALL
  database:
    enableLocalDb: true
EOF

log "waiting for RHDH deployment to be ready..."
kubectl wait --for=condition=Available deployment/backstage-rhdh -n rhdh --timeout=600s

# --- verify ---

log "verifying RHDH deployment..."
kubectl -n rhdh get pods
log "RHDH is running with LOCAL plugins"

# --- done ---

RHDH_SVC=$(kubectl -n rhdh get svc -l rhdh.redhat.com/app=backstage -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "backstage-rhdh")
RHDH_PORT=$(kubectl -n rhdh get svc "${RHDH_SVC}" -o jsonpath='{.spec.ports[0].port}' 2>/dev/null || echo "7007")

echo ""
echo "============================================"
echo " RHDH installed (with LOCAL plugins)"
echo "============================================"
echo ""
echo " RHDH:"
echo "   kubectl port-forward svc/${RHDH_SVC} 7007:${RHDH_PORT} -n rhdh"
echo "   http://localhost:7007/kuadrant"
echo ""
echo " Verify plugins:"
echo "   curl -H 'Authorization: Bearer <token>' http://localhost:7007/api/dynamic-plugins-info/loaded-plugins"
echo ""
echo " Update plugins after code changes:"
echo "   1. Rebuild:"
echo "      yarn build"
echo "      cd plugins/kuadrant && yarn export-dynamic"
echo "      cd ../kuadrant-backend && yarn export-dynamic"
echo "   2. Update PVC:"
echo "      ./oinc/update-local-plugins.sh"
echo "   3. Restart RHDH:"
echo "      kubectl rollout restart deployment/backstage-rhdh -n rhdh"
echo ""
