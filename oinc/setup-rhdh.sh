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
check_command helm "Install from https://helm.sh/docs/intro/install/"

kubectl get crd kuadrants.kuadrant.io &>/dev/null || {
  log "error: kuadrant CRDs not found. Run setup-cluster.sh first."
  exit 1
}

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

log "found local dynamic plugins:"
log "  frontend: ${FRONTEND_DIST}"
log "  backend:  ${BACKEND_DIST}"

# --- RHDH SA + RBAC ---

log "applying RHDH service account and RBAC..."
kubectl apply -f "${SCRIPT_DIR}/manifests/rhdh-sa.yaml"

# --- generate SA token ---

SA_TOKEN=$(kubectl create token rhdh-kuadrant -n rhdh --duration=8760h)
CLUSTER_URL="https://kubernetes.default.svc"

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

# --- RHDH via Helm ---

log "installing RHDH via Helm..."
helm repo add rhdh https://redhat-developer.github.io/rhdh-chart/ --force-update

RHDH_VALUES=$(mktemp)
cat >"${RHDH_VALUES}" <<VALS
upstream:
  backstage:
    appConfig:
      app:
        baseUrl: http://localhost:7007
      backend:
        baseUrl: http://localhost:7007
        cors:
          origin: http://localhost:7007
    initContainers:
      - name: install-dynamic-plugins
        image: '{{ include "backstage.image" . }}'
        command:
          - /bin/bash
          - -c
          - |
            ./install-dynamic-plugins.sh /dynamic-plugins-root
            # seed the extensions installation file so the UI can manage plugins
            cp /opt/app-root/src/dynamic-plugins.yaml /dynamic-plugins-root/dynamic-plugins.yaml
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
          - mountPath: /opt/app-root/src/.config/containers
            name: dynamic-plugins-registry-auth
            readOnly: true
          - mountPath: /opt/app-root/src/.npm/_cacache
            name: npmcacache
          - name: temp
            mountPath: /tmp
        resources:
          requests:
            cpu: 250m
            memory: 256Mi
          limits:
            cpu: 1000m
            memory: 2.5Gi
            ephemeral-storage: 5Gi
    extraAppConfig:
      - configMapRef: app-config-rhdh
        filename: app-config-kuadrant.yaml
    extraEnvVarsSecrets:
      - rhdh-k8s-credentials
    extraVolumeMounts:
      - name: dynamic-plugins-root
        mountPath: /opt/app-root/src/dynamic-plugins-root
      - name: extensions-catalog
        mountPath: /extensions
      - name: temp
        mountPath: /tmp
      - name: rbac-policy
        mountPath: /opt/app-root/src/rbac
    extraVolumes:
      - name: dynamic-plugins-root
        persistentVolumeClaim:
          claimName: rhdh-dynamic-plugins-local
      - name: dynamic-plugins
        configMap:
          defaultMode: 420
          name: rhdh-dynamic-plugins
          optional: true
      - name: dynamic-plugins-npmrc
        secret:
          defaultMode: 420
          optional: true
          secretName: rhdh-dynamic-plugins-npmrc
      - name: dynamic-plugins-registry-auth
        secret:
          defaultMode: 416
          optional: true
          secretName: rhdh-dynamic-plugins-registry-auth
      - name: npmcacache
        emptyDir: {}
      - name: extensions-catalog
        emptyDir: {}
      - name: temp
        emptyDir: {}
      - name: rbac-policy
        configMap:
          name: rbac-policy-rhdh
  postgresql:
    primary:
      persistence:
        enabled: false
      resources:
        limits:
          ephemeral-storage: 2Gi
VALS

helm install rhdh rhdh/backstage \
  --namespace rhdh \
  --values "${RHDH_VALUES}" \
  --timeout 900s \
  --wait
rm -f "${RHDH_VALUES}"

# --- verify ---

log "verifying RHDH deployment..."
kubectl -n rhdh get pods
log "RHDH is running with LOCAL plugins"

# --- done ---

RHDH_SVC=$(kubectl -n rhdh get svc -l app.kubernetes.io/component=backstage -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "rhdh-developer-hub")
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
echo "      kubectl rollout restart deployment/rhdh-developer-hub -n rhdh"
echo ""
