# Architecture

This document describes the monorepo structure, dynamic plugin system, and build configuration.

## Monorepo Structure

### packages/

Core application packages:
- `app` - Frontend application (React, using Backstage framework)
- `app-next` - Next-generation frontend (experimental)
- `backend` - Backend application (Node.js, Backstage backend)
- `plugin-utils` - Shared utilities for plugins
- `theme-wrapper` - Theme customisation

### plugins/

Custom plugins:
- `kuadrant` - Frontend plugin for Kuadrant API key management UI
- `kuadrant-backend` - Backend plugin for Kuadrant Kubernetes integration
- `dynamic-plugins-info-backend` - Provides information about loaded dynamic plugins
- `licensed-users-info-backend` - Tracks licensed user information
- `scalprum-backend` - Frontend federation support for dynamic plugins

### dynamic-plugins/wrappers/

Third-party plugins wrapped for dynamic loading:
- Contains 80+ wrapped Backstage community plugins
- Each wrapper adds dynamic plugin support to upstream plugins

### e2e-tests/

End-to-end testing (Playwright + TypeScript):
- Tests organised by feature area (plugins, auth, configuration, etc.)
- Multiple test projects for different deployment scenarios (showcase, showcase-rbac, showcase-k8s, etc.)

### catalog-entities/marketplace/

RHDH Extensions Catalog:
- `packages/` - Package metadata (OCI URLs, versions)
- `plugins/` - Plugin metadata (descriptions, categories, support levels)

## Dynamic Plugin System

RHDH supports dynamic plugins that can be installed without rebuilding the application. The system uses Backstage's backend plugin manager to scan `dynamic-plugins-root/` for plugin packages and load them at runtime.

**Key concepts:**
- Derived packages: Special JavaScript packages exported from original plugin source
- Frontend plugins require wiring configuration (mount points, routes) in app-config
- Backend plugins are auto-discovered and loaded
- Configuration via `dynamic-plugins.default.yaml` or Helm values

## Configuration Files

### Local development

- [`app-config.yaml`](../app-config.yaml) - Base configuration
- [`app-config.local.yaml`](../app-config.local.yaml) - Local overrides with RBAC enabled (checked in for team convenience)
- [`app-config.dynamic-plugins.yaml`](../app-config.dynamic-plugins.yaml) - Dynamic plugin configuration

## Build System

Uses Turborepo for monorepo orchestration and Yarn 3 workspaces for package management.

**Configuration:** [`turbo.json`](../turbo.json)

## Kubernetes Configuration Pattern

Backend plugins that need Kubernetes access should follow the standard RHDH pattern.

**Configuration structure in app-config.yaml:**
```yaml
kubernetes:
  clusterLocatorMethods:
    - type: config
      clusters:
        - name: production
          url: https://your-k8s-cluster
          authProvider: serviceAccount
          serviceAccountToken: ${K8S_CLUSTER_TOKEN}
          skipTLSVerify: true  # optional
```

**Implementation pattern:**
1. Use `@kubernetes/client-node` library
2. Accept `RootConfigService` in constructor
3. Parse `kubernetes.clusterLocatorMethods[].clusters` config
4. Support multiple auth providers:
   - `serviceAccount` - explicit token from config
   - Default fallback - `loadFromDefault()` for in-cluster or local kubeconfig
5. Create API clients: `CustomObjectsApi`, `CoreV1Api`, etc.

**Reference implementation:** See [`plugins/kuadrant-backend/src/KubernetesClient.ts`](../plugins/kuadrant-backend/src/KubernetesClient.ts)

This allows plugins to work in:
- Production (explicit cluster config with service account token)
- In-cluster (service account mounted at `/var/run/secrets/kubernetes.io/serviceaccount/`)
- Local development (kubeconfig at `~/.kube/config`)

## Extensions Catalog Workflow

When adding plugins to marketplace:
1. Generate package metadata: `npx @red-hat-developer-hub/marketplace-cli generate`
2. Create plugin YAML in `catalog-entities/marketplace/plugins/`
3. Add entries to `all.yaml` files in **alphabetical order**
4. Validate with `yq` (Go version) and `ajv-cli`

## Telemetry

Telemetry is enabled by default via `analytics-provider-segment` plugin. Disable in local dev by setting `SEGMENT_TEST_MODE=true` or disabling the plugin in dynamic plugins config.
