# Kuadrant Plugin Installation Guide

This guide covers installing the Kuadrant plugins:

1. **[Red Hat Developer Hub (RHDH)](#red-hat-developer-hub-rhdh)** - Dynamic plugin installation
2. **[Standard Backstage](#standard-backstage)** - Static plugin installation

**For plugin development**, see the [main README](../README.md).

## Prerequisites

### Kubernetes Cluster

You need a Kubernetes cluster with:

- [Kuadrant operator](https://docs.kuadrant.io/latest/getting-started/) installed
- Gateway API CRDs
- APIProduct and APIKey CRDs (from this repo's `kuadrant-dev-setup/crds/`)

### Service Account

Create a service account with the required permissions:

```yaml
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
  - apiGroups: ["devportal.kuadrant.io"]
    resources: ["apiproducts/status", "apikeys/status"]
    verbs: ["patch", "update"]
  - apiGroups: ["extensions.kuadrant.io"]
    resources: ["planpolicies"]
    verbs: ["get", "list", "watch"]
  - apiGroups: ["gateway.networking.k8s.io"]
    resources: ["httproutes"]
    verbs: ["get", "list", "watch"]
  - apiGroups: [""]
    resources: ["secrets", "configmaps"]
    verbs: ["get", "list", "watch", "create", "update", "patch", "delete"]
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

### App Configuration

Add to your `app-config.yaml`:

```yaml
kubernetes:
  serviceLocatorMethod:
    type: multiTenant
  clusterLocatorMethods:
    - type: config
      clusters:
        - name: production
          url: https://<cluster-url>:<port>
          authProvider: serviceAccount
          serviceAccountToken: <your-token>
          skipTLSVerify: true  # For local kind clusters

catalog:
  rules:
    - allow: [Component, API, APIProduct, Location, Template, Domain, User, Group, System, Resource]
```

**Cluster URL:**
- **RHDH (runs in Docker):** `https://host.docker.internal:<port>`
- **Standard Backstage (runs on host):** `https://127.0.0.1:<port>` or your cluster URL

---

## Packages

The Kuadrant plugin is split into four npm packages:

| Package | Description |
|---------|-------------|
| `@kuadrant/kuadrant-backstage-plugin-frontend` | UI components, pages, and entity cards |
| `@kuadrant/kuadrant-backstage-plugin-backend` | HTTP router serving `/api/kuadrant` endpoints |
| `@kuadrant/kuadrant-backstage-plugin-backend-module-catalog` | Catalog entity provider for APIProduct sync |
| `@kuadrant/kuadrant-backstage-plugin-backend-module-rbac` | RBAC integration (optional) |

**Note on RBAC:** The RBAC module requires `@backstage-community/plugin-rbac-backend`. RHDH includes this by default. Standard Backstage uses `allow-all-policy` instead, so you must either skip the RBAC module or install the RBAC backend first.

---

## RHDH vs Standard Backstage

| Feature | RHDH | Standard Backstage |
|---------|------|-------------------|
| Plugin loading | Dynamic via YAML config | Static via `backend.add()` in code |
| Sidebar menu | Auto-configured via `dynamicRoutes` | Manual edit of `Root.tsx` |
| Route registration | Declarative in YAML | Explicit in `App.tsx` |
| RBAC backend | Built-in | Must install separately |

---

## Red Hat Developer Hub (RHDH)

RHDH supports dynamic plugin loading without modifying source code. This example uses [RHDH-Local](https://github.com/redhat-developer/rhdh-local).

### 1. Configure Dynamic Plugins

Add to `configs/dynamic-plugins/dynamic-plugins.override.yaml`:

```yaml
plugins:
  - package: "@kuadrant/kuadrant-backstage-plugin-backend-dynamic"
    disabled: false

  - package: "@kuadrant/kuadrant-backstage-plugin-backend-module-catalog-dynamic"
    disabled: false

  - package: "@kuadrant/kuadrant-backstage-plugin-backend-module-rbac-dynamic"
    disabled: false

  - package: "@kuadrant/kuadrant-backstage-plugin-frontend"
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

**Important:** The `pluginConfig` block must be on the **frontend** plugin entry. The key `internal.plugin-kuadrant` must match `scalprum.name` in the plugin's `package.json`.

### 2. Configure App

Add to `configs/app-config/app-config.local.yaml` the Kubernetes and catalog configuration from [App Configuration](#app-configuration) above.

### 3. Configure RBAC (Optional)

See [RBAC Permissions](rbac-permissions.md) for the complete policy configuration.

```yaml
permission:
  enabled: true
  rbac:
    policies-csv-file: /opt/app-root/src/configs/rbac-policy.csv
    policyFileReload: true
```

### 4. Start RHDH

```bash
docker compose up
```

---

## Standard Backstage

For standard Backstage, plugins are installed statically by adding them to your code.

### 1. Install Dependencies

```bash
# Backend
cd packages/backend
yarn add @kuadrant/kuadrant-backstage-plugin-backend
yarn add @kuadrant/kuadrant-backstage-plugin-backend-module-catalog

# Frontend
cd ../app
yarn add @kuadrant/kuadrant-backstage-plugin-frontend
```

### 2. Register Backend Plugins

Edit `packages/backend/src/index.ts`:

```typescript
backend.add(import('@kuadrant/kuadrant-backstage-plugin-backend'));
backend.add(import('@kuadrant/kuadrant-backstage-plugin-backend-module-catalog'));
```

### 3. Add Frontend Route and Sidebar

Edit `packages/app/src/App.tsx`:

```typescript
import { KuadrantPage } from '@kuadrant/kuadrant-backstage-plugin-frontend';

// In FlatRoutes:
<Route path="/kuadrant" element={<KuadrantPage />} />
```

Edit `packages/app/src/components/Root/Root.tsx`:

```typescript
import SecurityIcon from '@material-ui/icons/Security';

// In SidebarGroup:
<SidebarItem icon={SecurityIcon} to="kuadrant" text="Kuadrant" />
```

### 4. Entity Page Integration (Optional)

Edit `packages/app/src/components/catalog/EntityPage.tsx`:

```typescript
import { EntityKuadrantApiKeyManagementTab } from '@kuadrant/kuadrant-backstage-plugin-frontend';

// Add to apiPage:
<EntityLayout.Route path="/kuadrant" title="Kuadrant">
  <EntityKuadrantApiKeyManagementTab />
</EntityLayout.Route>
```

### 5. Configure App

Add the Kubernetes and catalog configuration from [App Configuration](#app-configuration) to your `app-config.yaml`.

### Adding RBAC Support (Optional)

To enable RBAC in standard Backstage, first install the RBAC backend:

```bash
cd packages/backend
yarn add @backstage-community/plugin-rbac-backend
yarn add @kuadrant/kuadrant-backstage-plugin-backend-module-rbac
```

Edit `packages/backend/src/index.ts`:

```typescript
// Remove: backend.add(import('@backstage/plugin-permission-backend-module-allow-all-policy'));

// Add RBAC backend first:
backend.add(import('@backstage-community/plugin-rbac-backend'));

// Then Kuadrant plugins:
backend.add(import('@kuadrant/kuadrant-backstage-plugin-backend'));
backend.add(import('@kuadrant/kuadrant-backstage-plugin-backend-module-catalog'));
backend.add(import('@kuadrant/kuadrant-backstage-plugin-backend-module-rbac'));
```

---

## Verification

After installation:

1. Navigate to `/kuadrant` - the main Kuadrant page should load
2. Check the catalog for APIProduct entities synced from Kubernetes
3. Navigate to an API entity and verify the Kuadrant tabs appear

---

## Related Documentation

- [RBAC Permissions](rbac-permissions.md) - Role definitions and policy configuration
- [Kuadrant Resources](kuadrant-resources.md) - CRDs and namespace organisation
- [Kuadrant Docs](https://docs.kuadrant.io/) - Kuadrant documentation
- [RHDH-Local](https://github.com/redhat-developer/rhdh-local) - Local RHDH development environment
