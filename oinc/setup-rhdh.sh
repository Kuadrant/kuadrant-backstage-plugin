#!/usr/bin/env bash
# installs RHDH on an existing oinc cluster with the kuadrant plugins loaded as
# dynamic plugins. expects setup-cluster.sh to have been run first.
#
# the oinc rhdh addon (v0.3.0+) owns the generic plumbing: the rhdh/backstage
# helm chart, the custom image override, the microshift volume/postgres
# workarounds, guest auth, and route exposure on the mapped http port. this
# script composes the kuadrant-specific bits - the dynamic-plugins list and
# frontend pluginConfig, the k8s cluster locator + sa token, catalog rules and
# rbac - as a helm values overlay and hands off to `oinc addon install rhdh`.
#
# two plugin sources (PLUGIN_SOURCE):
#   npm    (default) - published @kuadrant packages, fetched by the init
#          container with integrity hashes. used by local `yarn oinc:rhdh`.
#   baked  - locally-built dist-dynamic dirs baked into a derived rhdh image
#          (RHDH_IMAGE_REPOSITORY:RHDH_IMAGE_TAG), referenced by local
#          ./dynamic-plugins/dist path. used by the dynamic-plugin e2e job to
#          test this branch's export-dynamic output rather than published npm.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

# shellcheck source=lib.sh
source "${SCRIPT_DIR}/lib.sh"

FRONTEND_PKG="@kuadrant/kuadrant-backstage-plugin-frontend"
BACKEND_PKG="@kuadrant/kuadrant-backstage-plugin-backend-dynamic"

PLUGIN_SOURCE="${PLUGIN_SOURCE:-npm}"
RHDH_IMAGE_REPOSITORY="${RHDH_IMAGE_REPOSITORY:-localhost/kuadrant-rhdh-e2e}"
RHDH_IMAGE_TAG="${RHDH_IMAGE_TAG:-ci}"
# rhdh addon chart pin (rhdh@<version>). empty = addon default (6.2.2, paired
# with the rhdh:1.10 image line). the chart carries no appVersion, so this
# tracks the base image by release; bump both together.
RHDH_CHART_VERSION="${RHDH_CHART_VERSION:-}"
# the addon exposes rhdh via an openshift route on the http port oinc maps
# (default 9080); no port-forward. override if oinc create used a custom
# --http-port.
#
# the hostname has to sit under .localhost. browsers treat *.localhost as a
# potentially-trustworthy origin (whatwg secure contexts), so plain http there is
# still a secure context; a real hostname like *.nip.io is not, and without a
# secure context window.crypto.subtle, crypto.randomUUID and navigator.clipboard
# are all undefined - which breaks requesting a key and every copy button.
# oinc v0.3.1 hardcodes its own route host, so the overlay below overrides it.
RHDH_URL="${RHDH_URL:-http://rhdh.localhost:9080}"
# dex issuer, as setup-dex.sh serves it. one string for the browser and the pod
# both - see oinc/manifests/dex.yaml for how that is arranged.
DEX_URL="${DEX_URL:-http://dex.localhost:9080}"

# the route matches on host alone, so global.host takes the url without scheme
# or port. derived here so RHDH_URL stays the single place the address is set.
RHDH_HOST="${RHDH_URL#*://}"
RHDH_HOST="${RHDH_HOST%%/*}"
RHDH_HOST="${RHDH_HOST%%:*}"

case "${PLUGIN_SOURCE}" in
  npm | baked) ;;
  *)
    log "error: PLUGIN_SOURCE must be 'npm' or 'baked', got '${PLUGIN_SOURCE}'"
    exit 1
    ;;
esac

RHDH_OVERLAY=""
cleanup() {
  [ -n "${RHDH_OVERLAY}" ] && rm -f "${RHDH_OVERLAY}"
  return 0
}
trap cleanup EXIT

# --- prerequisites + kube credentials ---

check_command oinc "Install from https://github.com/jasonmadigan/oinc"
check_command kubectl "Install from https://kubernetes.io/docs/tasks/tools/"
check_command helm "Install from https://helm.sh/docs/intro/install/"
[ "${PLUGIN_SOURCE}" = "npm" ] && check_command npm "Install from https://nodejs.org/"

kubectl get crd kuadrants.kuadrant.io &>/dev/null || {
  log "error: kuadrant CRDs not found. Run setup-cluster.sh first."
  exit 1
}

# RHDH always uses the same Dex-backed personas, regardless of plugin source or
# whether this script was reached through `yarn oinc` or `yarn oinc:rhdh`.
"${SCRIPT_DIR}/setup-dex.sh"

log "applying RHDH service account and RBAC..."
kubectl apply \
  -f "${REPO_DIR}/kuadrant-dev-setup/rbac/rhdh-cluster-role.yaml" \
  -f "${SCRIPT_DIR}/manifests/rhdh-sa.yaml"

SA_TOKEN=$(kubectl create token rhdh-kuadrant -n rhdh --duration=8760h)
CLUSTER_URL="https://kubernetes.default.svc"

# --- plugin integrity hashes (npm source only) ---

if [ "${PLUGIN_SOURCE}" = "npm" ]; then
  log "fetching plugin integrity hashes..."
  FRONTEND_HASH=$(npm view "${FRONTEND_PKG}" dist.integrity)
  BACKEND_HASH=$(npm view "${BACKEND_PKG}" dist.integrity)
  log "frontend: ${FRONTEND_HASH}"
  log "backend:  ${BACKEND_HASH}"
fi

# --- helm values overlay ---

# frontend dynamic plugin config (routes, menu items, mount points). identical
# across plugin sources, so defined once and injected into the frontend entry.
FRONTEND_PLUGIN_CONFIG=$(
  cat <<'PCFG'
        pluginConfig:
          dynamicPlugins:
            frontend:
              kuadrant.kuadrant-backstage-plugin-frontend:
                apiFactories:
                  - importName: kuadrantApiFactory
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
                entityTabs:
                  - mountPoint: entity.page.api-keys
                    path: /api-keys
                    title: API Keys
                  - mountPoint: entity.page.api-product-info
                    path: /api-product-info
                    title: API Product Info
                mountPoints:
                  # overview card, only for api-key products. hasAnnotation tests
                  # presence, and the entity provider emits kuadrant.io/auth-apikey
                  # only when an api-key scheme is discovered (oidc-only omits it).
                  - mountPoint: entity.page.overview/cards
                    importName: EntityKuadrantApiAccessCard
                    config:
                      layout:
                        gridColumnEnd:
                          lg: "span 6"
                          md: "span 6"
                          xs: "span 12"
                      if:
                        allOf:
                          - isKind: api
                          - hasAnnotation: kuadrant.io/auth-apikey
                  # the api keys tab has no static content, so it is shown only when
                  # this card is mounted; gating the card on the annotation hides the
                  # tab for oidc-only apis.
                  - mountPoint: entity.page.api-keys/cards
                    importName: EntityKuadrantApiKeyManagementTab
                    config:
                      layout:
                        gridColumn: "1 / -1"
                      if:
                        allOf:
                          - isKind: api
                          - hasAnnotation: kuadrant.io/auth-apikey
                  - mountPoint: entity.page.api-product-info/cards
                    importName: EntityKuadrantApiProductInfoContent
                    config:
                      layout:
                        gridColumn: "1 / -1"
                      if:
                        allOf:
                          - isKind: api
PCFG
)

# Only the package references differ between published and baked plugins.
if [ "${PLUGIN_SOURCE}" = "npm" ]; then
  KUADRANT_PLUGINS=$(cat <<EOF
      - package: "${BACKEND_PKG}"
        disabled: false
        integrity: "${BACKEND_HASH}"
      - package: "${FRONTEND_PKG}"
        disabled: false
        integrity: "${FRONTEND_HASH}"
EOF
  )
else
  KUADRANT_PLUGINS=$(cat <<'EOF'
      - package: ./dynamic-plugins/dist/kuadrant-kuadrant-backstage-plugin-backend-dynamic
        disabled: false
      - package: ./dynamic-plugins/dist/kuadrant-kuadrant-backstage-plugin-frontend
        disabled: false
EOF
  )
fi

PLUGINS_BLOCK=$(cat <<EOF
    plugins:
      - package: ./dynamic-plugins/dist/backstage-community-plugin-rbac
        disabled: false
      - package: ./dynamic-plugins/dist/red-hat-developer-hub-backstage-plugin-quickstart
        disabled: true
      - package: ./dynamic-plugins/dist/red-hat-developer-hub-backstage-plugin-analytics-module-adoption-insights-dynamic
        disabled: true
      - package: ./dynamic-plugins/dist/backstage-community-plugin-analytics-provider-segment
        disabled: true
${KUADRANT_PLUGINS}
${FRONTEND_PLUGIN_CONFIG}
EOF
)

RHDH_OVERLAY=$(mktemp)
cat >"${RHDH_OVERLAY}" <<VALS
global:
  # oinc v0.3.1 pins its route host to <name>.127.0.0.1.nip.io and derives the
  # baseUrls from it. --rhdh-values is layered user-wins, so restating the four
  # of them here moves rhdh onto the secure-context origin; they are one map
  # merge over the addon's, not a replacement, so guest auth below is untouched.
  host: ${RHDH_HOST}
  dynamic:
${PLUGINS_BLOCK}

upstream:
  backstage:
    appConfig:
      app:
        baseUrl: ${RHDH_URL}
      backend:
        baseUrl: ${RHDH_URL}
        cors:
          origin: ${RHDH_URL}
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
      - name: catalog-entities
        mountPath: /opt/app-root/src/catalog-entities
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
      - name: catalog-entities
        configMap:
          name: catalog-entities-rhdh
VALS

# --- rhdh configuration ---

# the addon owns app/backend baseUrl (the route url) and cors; this configmap
# adds the kuadrant-specific app-config: dex oidc sign-in, the user/group
# entities the resolver and rbac need, the k8s cluster locator (sa token),
# catalog rules and rbac. backstage merges it after the addon's config.
#
# the addon also configures guest auth. signInPage below moves the sign-in page
# onto oidc so nothing arrives as guest, which is what makes the multi-user
# specs meaningful here: personas come from dex and their roles from group
# membership, exactly as under `yarn dev`.
log "creating RHDH configuration..."

# the user and group entities the emailMatchingUserEntityProfileEmail resolver
# resolves dex logins against, and that rbac-policy.csv maps to roles. mounted
# from the repo file rather than restated, so the personas have one definition
# across `yarn dev` and here.
kubectl create configmap catalog-entities-rhdh \
  --namespace rhdh \
  --from-file=kuadrant-users.yaml="${REPO_DIR}/catalog-entities/kuadrant-users.yaml" \
  --dry-run=client -o yaml | kubectl apply -f -

kubectl apply -n rhdh -f - <<EOF
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config-rhdh
  namespace: rhdh
data:
  app-config-kuadrant.yaml: |
    signInPage: oidc

    auth:
      environment: development
      # the oidc provider is session-backed; without this it answers
      # /api/auth/oidc/start with "authentication requires session support".
      # secure: false because this environment is served over plain http (the
      # .localhost origin is a secure context to the browser, but the cookie
      # flag is about the scheme).
      session:
        secret: oinc-dev-session-secret-not-for-production
        absoluteTimeoutSeconds: 604800
        cookie:
          secure: false
          sameSite: lax
          path: /
      providers:
        oidc:
          development:
            metadataUrl: ${DEX_URL}/.well-known/openid-configuration
            clientId: backstage
            clientSecret: backstage-dev-secret
            title: OIDC
            # the provider asks for openid/profile/email only, so dex issues no
            # refresh token and the session dies on the first full page load -
            # every spec navigates, so that is every spec. offline_access is what
            # makes dex mint one. (the option is additionalScopes; the module
            # rejects "scope" outright.)
            additionalScopes:
              - offline_access
            signIn:
              resolvers:
                - resolver: emailMatchingUserEntityProfileEmail

    kubernetes:
      serviceLocatorMethod:
        type: multiTenant
      clusterLocatorMethods:
        - type: config
          clusters:
            - name: oinc
              url: \${K8S_CLUSTER_URL}
              authProvider: serviceAccount
              serviceAccountToken: \${K8S_CLUSTER_TOKEN}
              skipTLSVerify: true

    catalog:
      rules:
        - allow: [Component, API, APIProduct, Location, Template, Domain, User, Group, System, Resource, Plugin, Package]
      locations:
        - type: file
          target: /opt/app-root/src/catalog-entities/kuadrant-users.yaml

    permission:
      enabled: true
      rbac:
        admin:
          superUsers:
            - name: user:default/admin
        policies-csv-file: /opt/app-root/src/rbac/rbac-policy.csv
        policyFileReload: true
EOF

# rbac policy from repo root, verbatim. it already grants the three groups their
# roles, and the dex personas are members of those groups, so nothing is
# appended here - the roles a persona gets are the ones they get under
# `yarn dev`.
kubectl create configmap rbac-policy-rhdh \
  --namespace rhdh \
  --from-file=rbac-policy.csv="${REPO_DIR}/rbac-policy.csv" \
  --dry-run=client -o yaml | kubectl apply -f -

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

# --- rhdh via the oinc addon ---

# the addon installs the rhdh/backstage chart, applies the microshift workarounds
# and exposes rhdh via a route; --rhdh-values layers the kuadrant overlay on top
# (user-wins), --rhdh-image points the deployment at the sideloaded derived image.
log "installing RHDH via oinc rhdh addon (plugin source: ${PLUGIN_SOURCE})..."

# on a fresh cluster the pod starts after the configmaps above and picks them up.
# on a re-run it does not: the configmaps change but the pod spec does not, so
# helm has nothing to roll and rhdh keeps serving the old app-config. noted here
# rather than always restarting, which would cost a second rollout wait on the
# fresh path that ci and `make dynamic-up` take.
RHDH_EXISTED=""
kubectl -n rhdh get deploy rhdh-developer-hub &>/dev/null && RHDH_EXISTED=1

ADDON_SPEC="rhdh"
[ -n "${RHDH_CHART_VERSION}" ] && ADDON_SPEC="rhdh@${RHDH_CHART_VERSION}"

ADDON_ARGS=(addon install "${ADDON_SPEC}" --rhdh-values "${RHDH_OVERLAY}")
if [ "${PLUGIN_SOURCE}" = "baked" ]; then
  ADDON_ARGS+=(--rhdh-image "${RHDH_IMAGE_REPOSITORY}:${RHDH_IMAGE_TAG}")
fi
oinc "${ADDON_ARGS[@]}"

if [ -n "${RHDH_EXISTED}" ]; then
  log "rhdh already existed - restarting so it picks up the app-config changes..."
  kubectl -n rhdh rollout restart deployment/rhdh-developer-hub
  kubectl -n rhdh rollout status deployment/rhdh-developer-hub --timeout=300s
fi

# --- verify ---

log "verifying RHDH deployment..."
kubectl -n rhdh get pods
log "RHDH installed; addon waited on rollout, npm init container may still be pulling"

echo ""
echo "============================================"
echo " RHDH installed"
echo "============================================"
echo ""
echo " RHDH (route, no port-forward):"
echo "   ${RHDH_URL}/kuadrant"
echo ""
echo " Verify plugins:"
echo "   curl -H 'Authorization: Bearer <token>' ${RHDH_URL}/api/dynamic-plugins-info/loaded-plugins"
echo ""
