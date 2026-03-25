#!/usr/bin/env bash
# installs and configures RHDH on an existing MINC cluster.
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
check_command npm "Install from https://nodejs.org/"

# verify cluster is reachable and kuadrant is installed
kubectl get crd kuadrants.kuadrant.io &>/dev/null || {
  log "error: kuadrant CRDs not found. Run setup-cluster.sh first."
  exit 1
}

# --- RHDH SA + RBAC ---

log "applying RHDH service account and RBAC..."
kubectl apply -f "${SCRIPT_DIR}/manifests/rhdh-sa.yaml"

# --- generate SA token ---

SA_TOKEN=$(kubectl create token rhdh-kuadrant -n rhdh --duration=8760h)
CLUSTER_URL="https://kubernetes.default.svc"

# --- fetch plugin integrity hashes ---

log "fetching plugin integrity hashes..."
FRONTEND_HASH=$(npm view "${FRONTEND_PKG}" dist.integrity)
BACKEND_HASH=$(npm view "${BACKEND_PKG}" dist.integrity)
log "frontend: ${FRONTEND_HASH}"
log "backend:  ${BACKEND_HASH}"

# --- RHDH configuration ---

log "creating RHDH configuration..."

# app-config
kubectl apply -n rhdh -f - <<EOF
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config-rhdh
  namespace: rhdh
data:
  app-config-kuadrant.yaml: |
    app:
      baseUrl: http://localhost:7007
    backend:
      baseUrl: http://localhost:7007
      cors:
        origin: http://localhost:7007

    auth:
      environment: development
      providers:
        guest:
          dangerouslyAllowOutsideDevelopment: true
          userEntityRef: user:default/guest

    kubernetes:
      serviceLocatorMethod:
        type: multiTenant
      clusterLocatorMethods:
        - type: config
          clusters:
            - name: minc
              url: \${K8S_CLUSTER_URL}
              authProvider: serviceAccount
              serviceAccountToken: \${K8S_CLUSTER_TOKEN}
              skipTLSVerify: true

    catalog:
      rules:
        - allow: [Component, API, APIProduct, Location, Template, Domain, User, Group, System, Resource, Plugin, Package]

    permission:
      enabled: true
      rbac:
        admin:
          superUsers:
            - name: user:default/guest
        policies-csv-file: /opt/app-root/src/rbac/rbac-policy.csv
        policyFileReload: true

    extensions:
      installation:
        enabled: true
        saveToSingleFile:
          file: /opt/app-root/src/dynamic-plugins-root/dynamic-plugins.yaml
EOF

# rbac policy from repo root, with guest as api-admin for local dev
MINC_RBAC=$(mktemp)
cat "${REPO_DIR}/rbac-policy.csv" > "${MINC_RBAC}"
echo "g, user:default/guest, role:default/api-admin" >> "${MINC_RBAC}"
kubectl create configmap rbac-policy-rhdh \
  --namespace rhdh \
  --from-file=rbac-policy.csv="${MINC_RBAC}" \
  --dry-run=client -o yaml | kubectl apply -f -
rm -f "${MINC_RBAC}"

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

# write values file (heredoc avoids quoting issues in --set)
RHDH_VALUES=$(mktemp)
cat > "${RHDH_VALUES}" <<VALS
global:
  dynamic:
    includes:
      - dynamic-plugins.default.yaml
    plugins:
      # rbac management ui
      - package: ./dynamic-plugins/dist/backstage-community-plugin-rbac
        disabled: false
      - package: "${BACKEND_PKG}"
        disabled: false
        integrity: "${BACKEND_HASH}"
      - package: "${FRONTEND_PKG}"
        disabled: false
        integrity: "${FRONTEND_HASH}"
        pluginConfig:
          dynamicPlugins:
            frontend:
              internal.plugin-kuadrant:
                appIcons:
                  - name: kuadrantIcon
                    importName: KuadrantIcon
                dynamicRoutes:
                  - path: /kuadrant
                    importName: KuadrantPage
                  - path: /kuadrant/api-products
                    importName: ApiProductsPage
                    menuItem:
                      icon: kuadrantIcon
                      text: API Products
                  - path: /kuadrant/my-api-keys
                    importName: MyApiKeysPage
                    menuItem:
                      icon: kuadrantIcon
                      text: My API Keys
                  - path: /kuadrant/api-key-approval
                    importName: ApiKeyApprovalPage
                    menuItem:
                      icon: kuadrantIcon
                      text: API Key Approval
                  - path: /kuadrant/api-products/:namespace/:name
                    importName: ApiProductDetailPage
                  - path: /kuadrant/api-keys/:namespace/:name
                    importName: ApiKeyDetailPage
                menuItems:
                  kuadrant:
                    icon: kuadrantIcon
                    title: Kuadrant
                  kuadrant.api-products:
                    parent: kuadrant
                  kuadrant.my-api-keys:
                    parent: kuadrant
                  kuadrant.api-key-approval:
                    parent: kuadrant
                mountPoints:
                  - mountPoint: entity.page.api/cards
                    importName: EntityKuadrantApiKeyManagementTab
                    config:
                      layout:
                        gridColumn: "1 / -1"
                      if:
                        allOf:
                          - isKind: api
                  - mountPoint: entity.page.api/cards
                    importName: EntityKuadrantApiProductInfoContent
                    config:
                      layout:
                        gridColumn: "1 / -1"
                      if:
                        allOf:
                          - isKind: api

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
    # chart defaults + rbac-policy volume
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
        emptyDir: {}
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
log "RHDH is running"

# --- done ---

RHDH_SVC=$(kubectl -n rhdh get svc -l app.kubernetes.io/component=backstage -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "rhdh-developer-hub")
RHDH_PORT=$(kubectl -n rhdh get svc "${RHDH_SVC}" -o jsonpath='{.spec.ports[0].port}' 2>/dev/null || echo "7007")

echo ""
echo "============================================"
echo " RHDH installed"
echo "============================================"
echo ""
echo " RHDH:"
echo "   kubectl port-forward svc/${RHDH_SVC} 7007:${RHDH_PORT} -n rhdh"
echo "   http://localhost:7007/kuadrant"
echo ""
echo " Verify plugins:"
echo "   curl -H 'Authorization: Bearer <token>' http://localhost:7007/api/dynamic-plugins-info/loaded-plugins"
echo ""
