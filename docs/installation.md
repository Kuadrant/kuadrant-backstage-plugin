# Kuadrant Plugin Installation Guide

This guide covers installing the Kuadrant plugins into an existing Red Hat Developer Hub (RHDH) or Backstage instance.

**For plugin development**, see the [main README](../README.md).

## Packages

| Plugin   | Package                                                                                                                                   | Type     |
|----------|-------------------------------------------------------------------------------------------------------------------------------------------|----------|
| Frontend | [@kuadrant/kuadrant-backstage-plugin-frontend](https://www.npmjs.com/package/@kuadrant/kuadrant-backstage-plugin-frontend)               | Frontend |
| Backend  | [@kuadrant/kuadrant-backstage-plugin-backend-dynamic](https://www.npmjs.com/package/@kuadrant/kuadrant-backstage-plugin-backend-dynamic) | Backend  |

### Why Two Packages?

We publish only two packages that work for **both dynamic (RHDH) and static (Backstage) deployments**:

- **Frontend plugin**: Published directly from `plugins/kuadrant`. Frontend plugins are bundled by the app's webpack at build time, so the dynamic plugin system simply needs the source to be available. The `dist-scalprum/` assets for dynamic loading are included alongside the standard build output in the same package.

- **Backend plugin**: Published from `plugins/kuadrant-backend/dist-dynamic` (not the root). Backend plugins run in Node.js and are loaded at runtime, not bundled by webpack. For dynamic loading to work, the backend code must be pre-bundled as a self-contained module with all dependencies embedded. The `@janus-idp/cli export-dynamic` command generates this in `dist-dynamic/` with its own `package.json`. This is a separate package because the dependency structure differs from the source plugin.

In short: frontend plugins are bundled by the consuming app (so source is fine), while backend plugins must be pre-bundled for runtime loading (so we publish the generated `dist-dynamic` output).

## Prerequisites

### Kubernetes Cluster with Kuadrant

The plugins require a Kubernetes cluster with Kuadrant installed. You can either:

1. **Use the development setup** (recommended for testing):
   ```bash
   cd kuadrant-dev-setup
   make kind-create
   ```
   This creates a kind cluster with:
   - Kuadrant operator
   - Gateway API CRDs v1.2.0
   - Istio service mesh
   - APIProduct and APIKey CRDs
   - Demo resources (toystore)
   - RHDH service account with proper RBAC

2. **Use an existing cluster** with:
   - [Kuadrant operator](https://docs.kuadrant.io/latest/getting-started/) installed
   - Gateway API CRDs
   - Developer Portal controller (included in Kuadrant)

### Service Account Setup

Create a service account with permissions to manage Kuadrant resources:

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: rhdh
---
apiVersion: v1
kind: ServiceAccount
metadata:
  name: rhdh-kuadrant
  namespace: rhdh
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: rhdh-kuadrant
rules:
  - apiGroups: ["devportal.kuadrant.io"]
    resources: ["apiproducts", "apikeys"]
    verbs: ["get", "list", "watch", "create", "update", "patch", "delete"]
  - apiGroups: ["kuadrant.io"]
    resources: ["planpolicies"]
    verbs: ["get", "list", "watch"]
  - apiGroups: [""]
    resources: ["secrets"]
    verbs: ["get", "list", "create", "delete"]
  - apiGroups: [""]
    resources: ["namespaces"]
    verbs: ["get", "list"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: rhdh-kuadrant
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: rhdh-kuadrant
subjects:
  - kind: ServiceAccount
    name: rhdh-kuadrant
    namespace: rhdh
```

Generate a long-lived token:

```bash
kubectl create token rhdh-kuadrant -n rhdh --duration=8760h
```

---

## Installation on Red Hat Developer Hub (RHDH)

This section covers installing the plugins using [rhdh-local](https://github.com/redhat-developer/rhdh-local) for local development with Docker Compose. For production RHDH deployments, see [Deploying to Production RHDH](#deploying-to-production-rhdh).

### 1. Configure Dynamic Plugins

Add the plugins to `configs/dynamic-plugins/dynamic-plugins.override.yaml`:

```yaml
includes:
  - dynamic-plugins.default.yaml

plugins:
  # Kuadrant Backend
  - package: "@kuadrant/kuadrant-backstage-plugin-backend-dynamic"
    disabled: false
    integrity: <sha512-integrity-hash>

  # Kuadrant Frontend
  - package: "@kuadrant/kuadrant-backstage-plugin-frontend"
    integrity: <sha512-integrity-hash>
    disabled: false
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
                menuItem:
                  icon: kuadrantIcon
                  text: Kuadrant
              - path: /kuadrant/api-products/:namespace/:name
                importName: ApiProductDetailPage
              - path: /kuadrant/api-keys/:namespace/:name
                importName: ApiKeyDetailPage
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
```

To get the integrity hash:
```bash
npm view @kuadrant/kuadrant-backstage-plugin-frontend dist.integrity
npm view @kuadrant/kuadrant-backstage-plugin-backend-dynamic dist.integrity
```

### 2. Configure Kubernetes Access

Add to `configs/app-config/app-config.yaml`:

```yaml
kubernetes:
  serviceLocatorMethod:
    type: multiTenant
  clusterLocatorMethods:
    - type: config
      clusters:
        - name: production
          url: https://host.docker.internal:<port>
          authProvider: serviceAccount
          serviceAccountToken: <your-token>
          skipTLSVerify: true
```

> **Note**: Use `host.docker.internal` to access the host machine's kind cluster from Docker. Get the port with `kubectl cluster-info`.

### 3. Configure RBAC

Add to `configs/app-config/app-config.yaml`:

```yaml
permission:
  enabled: true
  rbac:
    policies-csv-file: /opt/app-root/src/configs/rbac-policy.csv
    policyFileReload: true
```

Create `configs/rbac-policy.csv` with the [RBAC policy content](#rbac-policy).

### 4. Start RHDH

```bash
docker compose up
```

Visit http://localhost:7007/kuadrant

### Deploying to Production RHDH

For production RHDH deployments (Operator or Helm), the configuration is the same but stored in Kubernetes ConfigMaps instead of local files:

| rhdh-local File | Production RHDH |
|-----------------|-----------------|
| `configs/dynamic-plugins/dynamic-plugins.override.yaml` | ConfigMap referenced by `spec.application.dynamicPluginsConfigMapName` in Backstage CR |
| `configs/app-config/app-config.yaml` | ConfigMap referenced by `spec.application.appConfig` in Backstage CR |
| `configs/rbac-policy.csv` | ConfigMap mounted as a volume |

**Key differences:**

1. **Dynamic Plugins ConfigMap:**
   ```yaml
   kind: ConfigMap
   apiVersion: v1
   metadata:
     name: dynamic-plugins-rhdh
   data:
     dynamic-plugins.yaml: |
       # Same content as dynamic-plugins.override.yaml
   ```

2. **Backstage CR reference:**
   ```yaml
   apiVersion: rhdh.redhat.com/v1alpha3
   kind: Backstage
   metadata:
     name: my-rhdh
   spec:
     application:
       dynamicPluginsConfigMapName: dynamic-plugins-rhdh
   ```

3. **Kubernetes credentials as Secret:**
   ```yaml
   apiVersion: v1
   kind: Secret
   metadata:
     name: rhdh-k8s-credentials
   type: Opaque
   stringData:
     K8S_CLUSTER_URL: "https://<cluster-api-url>"
     K8S_CLUSTER_TOKEN: "<service-account-token>"
   ```

   Reference in Backstage CR:
   ```yaml
   spec:
     application:
       extraEnvs:
         secrets:
           - name: rhdh-k8s-credentials
   ```

4. **Cluster URL**: Use the actual cluster API URL instead of `host.docker.internal`.

5. **TLS**: Set `skipTLSVerify: false` and configure proper TLS certificates.

6. **Verify installation** at `<rhdh-url>/api/dynamic-plugins-info/loaded-plugins`.

---

## Installation on Backstage

This section covers installing the plugins on a standard Backstage instance.

### Important: RBAC Plugin Requirement

The Kuadrant backend plugin includes an RBAC module that integrates with the Backstage permission framework. **Standard Backstage does not include the RBAC plugin** that RHDH provides.

To use the RBAC module on Backstage, you need to install the community RBAC plugin:

```bash
yarn --cwd packages/backend add @backstage-community/plugin-rbac-backend @backstage-community/plugin-rbac-node
```

If you don't need RBAC, you can skip the RBAC module - the core plugin functionality works without it.

### 1. Install Dependencies

**Frontend** (`packages/app`):

```bash
yarn --cwd packages/app add @kuadrant/kuadrant-backstage-plugin-frontend
```

**Backend** (`packages/backend`):

```bash
yarn --cwd packages/backend add @kuadrant/kuadrant-backstage-plugin-backend-dynamic
```

### 2. Register Backend Plugin

Edit `packages/backend/src/index.ts`:

```typescript
import { createBackend } from '@backstage/backend-defaults';
import {
  kuadrantPlugin,
  catalogModuleApiProductEntityProvider,
} from '@kuadrant/kuadrant-backstage-plugin-backend-dynamic';

const backend = createBackend();

// ... other plugins ...

// Kuadrant plugin
backend.add(kuadrantPlugin);
backend.add(catalogModuleApiProductEntityProvider);

backend.start();
```

### 3. Register Frontend Routes

Edit `packages/app/src/App.tsx`:

```tsx
import {
  KuadrantPage,
  ApiProductsPage,
  ApiProductDetailPage,
  ApiKeysPage,
  ApiKeyDetailPage,
} from '@kuadrant/kuadrant-backstage-plugin-frontend';

// In your routes:
const routes = (
  <FlatRoutes>
    {/* ... other routes ... */}
    <Route path="/kuadrant" element={<KuadrantPage />} />
    <Route path="/kuadrant/api-products" element={<ApiProductsPage />} />
    <Route path="/kuadrant/api-products/:namespace/:name" element={<ApiProductDetailPage />} />
    <Route path="/kuadrant/api-keys" element={<ApiKeysPage />} />
    <Route path="/kuadrant/api-keys/:namespace/:name" element={<ApiKeyDetailPage />} />
  </FlatRoutes>
);
```

### 4. Add Sidebar Navigation (Optional)

Edit `packages/app/src/components/Root/Root.tsx`:

```tsx
import ExtensionIcon from '@material-ui/icons/Extension';

// In your sidebar:
<SidebarItem icon={ExtensionIcon} to="kuadrant" text="Kuadrant" />
```

### 5. Configure Kubernetes Access

Add to `app-config.yaml`:

```yaml
kubernetes:
  serviceLocatorMethod:
    type: multiTenant
  clusterLocatorMethods:
    - type: config
      clusters:
        - name: production
          url: https://127.0.0.1:<port>
          authProvider: serviceAccount
          serviceAccountToken: <your-token>
          skipTLSVerify: true
```

### 6. Configure Catalog Rules

Add to `app-config.yaml`:

```yaml
catalog:
  rules:
    - allow: [Component, System, API, APIProduct, Resource, Location]
```

### 7. Configure Permissions

Add to `app-config.yaml`:

```yaml
permission:
  enabled: true
```

### 8. Start Backstage

```bash
yarn dev
```

Visit http://localhost:3000/kuadrant

---

## RBAC Policy

Example `rbac-policy.csv` for Kuadrant permissions:

```csv
# api consumer: browses apis, requests access
p, role:default/api-consumer, kuadrant.apiproduct.read.all, read, allow
p, role:default/api-consumer, kuadrant.apiproduct.list, read, allow
p, role:default/api-consumer, kuadrant.apikey.create, create, allow, apiproduct:*/*
p, role:default/api-consumer, kuadrant.apikey.read.own, read, allow
p, role:default/api-consumer, kuadrant.apikey.update.own, update, allow
p, role:default/api-consumer, kuadrant.apikey.delete.own, delete, allow
p, role:default/api-consumer, catalog.entity.read, read, allow

# api owner: publishes apis they own, approves requests for their apis
p, role:default/api-owner, kuadrant.planpolicy.read, read, allow
p, role:default/api-owner, kuadrant.planpolicy.list, read, allow
p, role:default/api-owner, kuadrant.apiproduct.create, create, allow
p, role:default/api-owner, kuadrant.apiproduct.read.all, read, allow
p, role:default/api-owner, kuadrant.apiproduct.update.own, update, allow
p, role:default/api-owner, kuadrant.apiproduct.delete.own, delete, allow
p, role:default/api-owner, kuadrant.apiproduct.list, read, allow
p, role:default/api-owner, kuadrant.apikey.create, create, allow, apiproduct:*/*
p, role:default/api-owner, kuadrant.apikey.read.own, read, allow
p, role:default/api-owner, kuadrant.apikey.update.own, update, allow
p, role:default/api-owner, kuadrant.apikey.delete.own, delete, allow
p, role:default/api-owner, kuadrant.apikey.approve, update, allow
p, role:default/api-owner, catalog.entity.read, read, allow

# api admin: platform engineers who manage all api products
p, role:default/api-admin, kuadrant.planpolicy.read, read, allow
p, role:default/api-admin, kuadrant.planpolicy.list, read, allow
p, role:default/api-admin, kuadrant.apiproduct.create, create, allow
p, role:default/api-admin, kuadrant.apiproduct.read.all, read, allow
p, role:default/api-admin, kuadrant.apiproduct.update.all, update, allow
p, role:default/api-admin, kuadrant.apiproduct.delete.all, delete, allow
p, role:default/api-admin, kuadrant.apiproduct.list, read, allow
p, role:default/api-admin, kuadrant.apikey.create, create, allow, apiproduct:*/*
p, role:default/api-admin, kuadrant.apikey.read.all, read, allow
p, role:default/api-admin, kuadrant.apikey.update.all, update, allow
p, role:default/api-admin, kuadrant.apikey.delete.all, delete, allow
p, role:default/api-admin, kuadrant.apikey.approve, update, allow
p, role:default/api-admin, catalog.entity.read, read, allow

# assign groups to roles
g, group:default/api-consumers, role:default/api-consumer
g, group:default/api-owners, role:default/api-owner
g, group:default/api-admins, role:default/api-admin
```

---

## Exposed Modules

### Frontend

| Import Name                          | Description                                     |
|--------------------------------------|-------------------------------------------------|
| `KuadrantPage`                       | Main page with API products and approval queue  |
| `ApiProductsPage`                    | API products list page                          |
| `ApiProductDetailPage`               | Single API product detail page                  |
| `ApiKeysPage`                        | API keys list page                              |
| `ApiKeyDetailPage`                   | Single API key detail page                      |
| `EntityKuadrantApiAccessCard`        | API key request card for entity overview        |
| `EntityKuadrantApiKeyManagementTab`  | Full API keys management tab                    |
| `EntityKuadrantApiKeysContent`       | API keys content component                      |
| `EntityKuadrantApiProductInfoContent`| APIProduct details tab                          |
| `KuadrantIcon`                       | Kuadrant logo icon for navigation               |

### Backend

| Export                                  | Description                                                   |
|-----------------------------------------|---------------------------------------------------------------|
| `kuadrantPlugin`                        | Main backend plugin with HTTP router                          |
| `catalogModuleApiProductEntityProvider` | Catalog entity provider for APIProduct sync                   |
| `rbacModule`                            | RBAC module for permission integration (requires RBAC plugin) |

---

## Verification

After installation:

1. Navigate to `/kuadrant` - you should see the main Kuadrant page
2. Check the catalog for APIProduct entities synced from Kubernetes
3. Navigate to an API entity and verify Kuadrant components appear

## Troubleshooting

### APIProduct entities not appearing

1. Check backend logs for entity provider sync messages
2. Verify Kubernetes connectivity
3. Ensure APIProduct CRDs exist in your cluster
4. Check catalog rules allow APIProduct kind

### API key requests failing

1. Verify Kubernetes write permissions for the service account
2. Check backend logs for detailed error messages
3. Ensure the target namespace exists and is accessible

## Related Documentation

- [RBAC Permissions](rbac-permissions.md) - Detailed permissions guide
- [Kuadrant Docs](https://docs.kuadrant.io/) - Kuadrant documentation
- [RHDH Local](https://github.com/redhat-developer/rhdh-local) - RHDH local development
