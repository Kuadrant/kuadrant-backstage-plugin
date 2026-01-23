# Repository Guide

This document describes the repository organization, build system, configuration, and development setup for the Kuadrant Backstage plugin repository.

## Repository Organization

### packages/

Core application packages (customized for Kuadrant integration):
- `app` - Frontend application that wires Kuadrant components into entity pages and navigation
- `backend` - Backend application that registers the Kuadrant backend plugin and handles authentication

### plugins/

Custom Kuadrant plugins:
- `kuadrant` - Frontend plugin for Kuadrant API key management UI
- `kuadrant-backend` - Backend plugin for Kuadrant Kubernetes integration

#### Kuadrant Frontend Plugin Structure

```
plugins/kuadrant/
├── src/
│   ├── plugin.ts                    # Plugin definition, route bindings
│   ├── permissions.ts               # Permission definitions
│   ├── api/
│   │   └── types.ts                 # TypeScript types for API responses
│   ├── components/
│   │   ├── ApiAccessCard/           # Shows approved API keys
│   │   ├── ApiKeyManagementTab/     # Full API key lifecycle UI
│   │   ├── ApiKeyDetailPage/        # Individual API key details
│   │   ├── ApiKeyApprovalPage/      # Approval page for platform engineers
│   │   ├── ApprovalQueueTable/      # Approval queue table component
│   │   ├── CreateAPIProductDialog/  # API product creation form
│   │   ├── EditAPIProductDialog/    # API product edit form
│   │   ├── EditAPIKeyDialog/        # API key edit dialog
│   │   ├── ApiProductDetailPage/    # API product detail page
│   │   ├── ApiProductInfoCard/      # API product information card
│   │   ├── PlanPolicyDetailsCard/   # Plan policy details card
│   │   ├── MyApiKeysPage/           # Consumer's API keys page
│   │   ├── MyApiKeysTable/          # Consumer's API keys table
│   │   ├── RequestAccessDialog/     # API access request dialog
│   │   ├── EntityApiApprovalTab/    # Entity page approval tab
│   │   ├── ConfirmDeleteDialog/     # Delete confirmation dialog
│   │   ├── PermissionGate/          # RBAC permission gate component
│   │   └── FilterPanel/             # Filter panel component
│   └── utils/
│       └── permissions.ts           # useKuadrantPermission hook
```

#### Kuadrant Backend Plugin Structure

```
plugins/kuadrant-backend/
├── src/
│   ├── module.ts                    # Backstage module registration
│   ├── router.ts                    # REST API endpoints
│   ├── k8s-client.ts                # Kubernetes client abstraction
│   ├── permissions.ts               # Permission checks and definitions
│   ├── providers/
│   │   └── APIProductEntityProvider.ts  # Syncs APIProducts to catalog
│   └── types.ts                     # TypeScript types
```
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

RHDH supports dynamic plugins that can be installed without rebuilding the application. Plugins are loaded from `dynamic-plugins/dist/` based on configuration in `dynamic-plugins.default.yaml`.

**Key concepts:**
- Dynamic plugins are exported packages from plugin source that can be loaded at runtime
- Frontend plugins require wiring configuration (mount points, routes) in `dynamicPlugins.frontend` config
- Backend plugins are loaded from paths specified in the configuration file
- Configuration via `dynamic-plugins.default.yaml`, `app-config.dynamic-plugins.yaml`, or Helm values

**For Kuadrant development:** The Kuadrant plugins are developed as static plugins (not dynamic) for easier development with hot reload. They can be exported as dynamic plugins using `yarn export-dynamic` when needed.

## Configuration Files

### Local development

- [app-config.yaml](../app-config.yaml) - Base configuration
- [app-config.local.yaml](../app-config.local.yaml) - Local overrides with RBAC enabled (checked in for team convenience)
- [app-config.dynamic-plugins.yaml](../app-config.dynamic-plugins.yaml) - Dynamic plugin configuration

## Build System

Uses Turborepo for monorepo orchestration and Yarn 3 workspaces for package management.

**Configuration:** [turbo.json](../turbo.json)

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

**Reference implementation:** See [plugins/kuadrant-backend/src/k8s-client.ts](../plugins/kuadrant-backend/src/k8s-client.ts)

**Note:** The entity provider that syncs APIProducts to the Backstage catalog is located at [plugins/kuadrant-backend/src/providers/APIProductEntityProvider.ts](../plugins/kuadrant-backend/src/providers/APIProductEntityProvider.ts)

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
