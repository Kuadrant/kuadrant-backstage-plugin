# Kuadrant Plugin for Backstage/RHDH

Backstage plugin for Kuadrant - enables developer portals for API access management using Kuadrant Gateway API primitives.

## Features

- **API Access Management**: Request API keys for Kuadrant-protected APIs
- **Access Tiers**: Support for multiple access tiers with different rate limits via PlanPolicy
- **User Identity**: Integrates with Backstage identity API for user-specific API keys
- **Policy Visibility**: View AuthPolicies, RateLimitPolicies, and PlanPolicies
- **API Key Management**: View, create, and delete API keys with show/hide toggles
- **Approval Workflow**: Platform engineers can approve/reject API access requests
- **APIProduct Integration**: Sync APIProduct custom resources from Kubernetes

## Prerequisites

- Backstage/RHDH instance (v1.30+)
- Kubernetes cluster with Kuadrant Gateway API and CRDs installed
- Backend plugin (`@internal/plugin-kuadrant-backend`) configured and running

## Installation

### 1. Copy Plugins to Your Instance

Copy both plugins to your Backstage instance:
```bash
# Frontend plugin
cp -r plugins/kuadrant /path/to/your/backstage/plugins/

# Backend plugin
cp -r plugins/kuadrant-backend /path/to/your/backstage/plugins/
```

### 2. Install Dependencies

Add to your root `package.json` workspaces if needed, then install:
```bash
yarn install
```

### 3. Configure Backend

In `packages/backend/src/index.ts`, add the backend plugins:

```typescript
// Kuadrant backend plugins
backend.add(import('@internal/plugin-kuadrant-backend'));
backend.add(import('@internal/plugin-kuadrant-backend/alpha'));
```

The backend plugin provides:
- HTTP API endpoints at `/api/kuadrant/*`
- APIProduct entity provider for catalog integration

### 4. Configure Frontend

#### 4.1. Add Plugin Dependency

In `packages/app/package.json`:
```json
{
  "dependencies": {
    "@internal/plugin-kuadrant": "0.1.0"
  }
}
```

#### 4.2. Add Route

In `packages/app/src/components/AppBase/AppBase.tsx`:

```typescript
import { KuadrantPage } from '@internal/plugin-kuadrant';

// Inside FlatRoutes:
<Route path="/kuadrant" element={<KuadrantPage />} />
```

#### 4.3. Add Menu Item

In `packages/app/src/consts.ts`:

```typescript
export const DefaultMainMenuItems = {
  menuItems: {
    // ... existing items
    'default.kuadrant': {
      title: 'Kuadrant',
      icon: 'extension',
      to: 'kuadrant',
      priority: 55,
    },
  },
};
```

#### 4.4. Add Entity Page Components

In `packages/app/src/components/catalog/EntityPage/defaultTabs.tsx`:

```typescript
// Add imports
import {
  EntityKuadrantApiKeysContent,
  EntityKuadrantApiProductInfoContent,
} from '@internal/plugin-kuadrant';

// Add to defaultTabs object:
export const defaultTabs = {
  // ... existing tabs
  '/api-keys': {
    title: 'API Keys',
    mountPoint: 'entity.page.api-keys',
  },
  '/api-product-info': {
    title: 'API Product Info',
    mountPoint: 'entity.page.api-product-info',
  },
};

// Add to tabRules object:
export const tabRules = {
  // ... existing rules
  '/api-keys': {
    if: isKind('api'),
  },
  '/api-product-info': {
    if: (entity: Entity) => entity.kind === 'APIProduct',
  },
};

// Add to tabChildren object:
export const tabChildren = {
  // ... existing children
  '/api-keys': {
    children: <EntityKuadrantApiKeysContent />,
  },
  '/api-product-info': {
    children: <EntityKuadrantApiProductInfoContent />,
  },
};
```

#### 4.5. Add API Access Card to Overview (Optional)

In `packages/app/src/components/catalog/EntityPage/OverviewTabContent.tsx`:

```typescript
import { EntityKuadrantApiAccessCard } from '@internal/plugin-kuadrant';

// In the EntitySwitch.Case for isKind('api'), add:
<Grid
  item
  sx={{
    gridColumn: {
      lg: '5 / -1',
      md: '7 / -1',
      xs: '1 / -1',
    },
  }}
>
  <EntityKuadrantApiAccessCard />
</Grid>
```

### 5. Configure Catalog

Update `app-config.yaml` to allow APIProduct entities:

```yaml
catalog:
  rules:
    - allow: [Component, System, Group, Resource, Location, Template, API, APIProduct]
```

### 6. Configure Kubernetes Access

The backend plugin uses `@kubernetes/client-node` which supports multiple authentication methods:

#### Production (Explicit Cluster Configuration)

For production deployments, configure explicit cluster access in `app-config.yaml`:

```yaml
kubernetes:
  clusterLocatorMethods:
    - type: config
      clusters:
        - name: production
          url: https://your-k8s-cluster-url
          authProvider: serviceAccount
          serviceAccountToken: ${K8S_CLUSTER_TOKEN}
          skipTLSVerify: false  # set to true only for development
```

Environment variables:
- `K8S_CLUSTER_TOKEN` - Service account token for cluster access

**Required RBAC permissions:**

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
  # APIProduct and APIKey CRDs
  - apiGroups: ["devportal.kuadrant.io"]
    resources: ["apiproducts", "apikeys"]
    verbs: ["get", "list", "watch", "create", "update", "patch", "delete"]
  # PlanPolicy CRDs
  - apiGroups: ["kuadrant.io"]
    resources: ["planpolicies"]
    verbs: ["get", "list", "watch"]
  # Secrets for API keys
  - apiGroups: [""]
    resources: ["secrets"]
    verbs: ["get", "list", "create", "delete"]
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

To get the service account token:
```bash
kubectl create token rhdh-kuadrant -n rhdh --duration=8760h
```

#### In-Cluster (Automatic)

When RHDH runs inside Kubernetes without explicit configuration, it automatically uses the service account mounted at `/var/run/secrets/kubernetes.io/serviceaccount/`. Ensure the pod's service account has the RBAC permissions listed above.

#### Local Development

For local development, the plugin automatically uses your kubeconfig file (`~/.kube/config`). No configuration needed in `app-config.local.yaml`.

Verify access:
```bash
kubectl config current-context  # verify cluster
kubectl get apiproducts -A      # test access
```

## Dynamic Plugin Installation (RHDH)

For Red Hat Developer Hub deployments, the Kuadrant plugins can be installed as dynamic plugins without modifying source code.

### Package Names

| Plugin | Package Name | Type |
|--------|--------------|------|
| Frontend | `@kuadrant/kuadrant-backstage-plugin-frontend` | Frontend |
| Backend | `@kuadrant/kuadrant-backstage-plugin-backend` | Backend |

### 1. Install Dynamic Plugins

Add the plugins to your RHDH dynamic plugins configuration. The plugins can be loaded from a local path or npm registry.

**Option A: From npm registry**

```yaml
# dynamic-plugins.yaml
plugins:
  - package: '@kuadrant/kuadrant-backstage-plugin-frontend'
    disabled: false
  - package: '@kuadrant/kuadrant-backstage-plugin-backend'
    disabled: false
```

**Option B: From local path (development)**

```yaml
# dynamic-plugins.yaml
plugins:
  - package: './local-plugins/kuadrant-frontend'
    disabled: false
  - package: './local-plugins/kuadrant-backend'
    disabled: false
```

### 2. Configure Frontend Dynamic Plugin

Add the frontend plugin configuration to `app-config.yaml`:

```yaml
dynamicPlugins:
  frontend:
    internal.plugin-kuadrant:
      # App icons
      appIcons:
        - name: kuadrant
          importName: ExtensionIcon

      # Main route with menu item
      dynamicRoutes:
        - path: /kuadrant
          importName: KuadrantPage
          menuItem:
            icon: kuadrant
            text: Kuadrant

      # Entity page mount points
      mountPoints:
        # API Keys tab for API entities
        - mountPoint: entity.page.api-keys/cards
          importName: EntityKuadrantApiKeysContent
          config:
            layout:
              gridColumn: "1 / -1"
            if:
              allOf:
                - isKind: api

        # API Access card on API entity overview
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
                - hasAnnotation: kuadrant.io/httproute

        # API Product Info tab for APIProduct entities
        - mountPoint: entity.page.api-product-info/cards
          importName: EntityKuadrantApiProductInfoContent
          config:
            layout:
              gridColumn: "1 / -1"
            if:
              allOf:
                - isKind: API
                - hasLabel: kuadrant.io/synced
```

### 3. Configure Backend Dynamic Plugin

The backend plugin is automatically registered when loaded. Ensure Kubernetes access is configured:

```yaml
# app-config.yaml
kubernetes:
  clusterLocatorMethods:
    - type: config
      clusters:
        - name: production
          url: ${K8S_URL}
          authProvider: serviceAccount
          serviceAccountToken: ${K8S_CLUSTER_TOKEN}
          skipTLSVerify: false
```

### 4. Configure Catalog Rules

Allow APIProduct entities in the catalog:

```yaml
catalog:
  rules:
    - allow: [Component, System, Group, Resource, Location, Template, API, APIProduct]
```

### 5. Configure RBAC (Optional)

Enable RBAC with the Kuadrant permissions:

```yaml
permission:
  enabled: true
  rbac:
    policies-csv-file: ./rbac-policy.csv
    policyFileReload: true
```

Example `rbac-policy.csv`:

```csv
# API Consumer role
p, role:default/api-consumer, kuadrant.apiproduct.read.all, read, allow
p, role:default/api-consumer, kuadrant.apiproduct.list, read, allow
p, role:default/api-consumer, kuadrant.apikeyrequest.create, create, allow
p, role:default/api-consumer, kuadrant.apikeyrequest.read.own, read, allow
p, role:default/api-consumer, kuadrant.apikey.read.own, read, allow

# API Owner role
p, role:default/api-owner, kuadrant.apiproduct.create, create, allow
p, role:default/api-owner, kuadrant.apiproduct.read.all, read, allow
p, role:default/api-owner, kuadrant.apiproduct.update.own, update, allow
p, role:default/api-owner, kuadrant.apiproduct.delete.own, delete, allow
p, role:default/api-owner, kuadrant.apikeyrequest.update.own, update, allow
p, role:default/api-owner, kuadrant.planpolicy.read, read, allow

# API Admin role (full access)
p, role:default/api-admin, kuadrant.apiproduct.*, *, allow
p, role:default/api-admin, kuadrant.apikeyrequest.*, *, allow
p, role:default/api-admin, kuadrant.apikey.*, *, allow
p, role:default/api-admin, kuadrant.planpolicy.read, read, allow

# Assign groups to roles
g, group:default/api-consumers, role:default/api-consumer
g, group:default/api-owners, role:default/api-owner
g, group:default/api-admins, role:default/api-admin
```

### Exposed Modules Reference

The frontend plugin exposes these modules for dynamic loading:

| Import Name | Description |
|-------------|-------------|
| `KuadrantPage` | Main Kuadrant page with API products and approval queue |
| `EntityKuadrantApiAccessCard` | Quick API key request card for entity overview |
| `EntityKuadrantApiKeyManagementTab` | Full API keys management tab |
| `EntityKuadrantApiKeysContent` | API keys content component |
| `EntityKuadrantApiProductInfoContent` | APIProduct details tab |
| `KuadrantApprovalQueueCard` | Standalone approval queue card |

The backend plugin exposes:

| Export Path | Description |
|-------------|-------------|
| Default | Main backend plugin with HTTP router |
| `/alpha` | Catalog entity provider for APIProduct sync |
| `/rbac` | RBAC module for permission integration |

### Full Example Configuration

Complete `app-config.yaml` for RHDH with Kuadrant:

```yaml
app:
  title: Red Hat Developer Hub
  baseUrl: https://rhdh.example.com

backend:
  baseUrl: https://rhdh.example.com
  cors:
    origin: https://rhdh.example.com
    credentials: true

kubernetes:
  clusterLocatorMethods:
    - type: config
      clusters:
        - name: production
          url: ${K8S_URL}
          authProvider: serviceAccount
          serviceAccountToken: ${K8S_CLUSTER_TOKEN}
          skipTLSVerify: false

catalog:
  rules:
    - allow: [Component, System, API, APIProduct, Group, User, Resource, Location, Template]

permission:
  enabled: true
  rbac:
    policies-csv-file: ./rbac-policy.csv
    policyFileReload: true

dynamicPlugins:
  frontend:
    internal.plugin-kuadrant:
      appIcons:
        - name: kuadrant
          importName: ExtensionIcon
      dynamicRoutes:
        - path: /kuadrant
          importName: KuadrantPage
          menuItem:
            icon: kuadrant
            text: Kuadrant
      mountPoints:
        - mountPoint: entity.page.api-keys/cards
          importName: EntityKuadrantApiKeysContent
          config:
            layout:
              gridColumn: "1 / -1"
            if:
              allOf:
                - isKind: api
        - mountPoint: entity.page.overview/cards
          importName: EntityKuadrantApiAccessCard
          config:
            layout:
              gridColumnEnd: "span 6"
            if:
              allOf:
                - isKind: api
                - hasAnnotation: kuadrant.io/httproute
```

## Configuring API Entities

To enable Kuadrant features for an API entity, add annotations:

```yaml
apiVersion: backstage.io/v1alpha1
kind: API
metadata:
  name: toystore-api
  annotations:
    # required: name of the gateway api httproute resource
    kuadrant.io/httproute: toystore

    # required: kubernetes namespace where the httproute exists
    kuadrant.io/namespace: toystore

    # optional: gateway name for reference
    kuadrant.io/gateway: external
spec:
  type: openapi
  lifecycle: production
  owner: team-a
```

### Annotation Reference

| Annotation | Required | Description | Example |
|-----------|----------|-------------|---------|
| `kuadrant.io/httproute` | yes | Name of the Gateway API HTTPRoute resource | `toystore` |
| `kuadrant.io/namespace` | yes | Kubernetes namespace containing the HTTPRoute | `toystore` |
| `kuadrant.io/gateway` | no | Gateway name for reference/display | `external` |

## Usage

### For API Consumers

1. Navigate to an API entity in the catalog
2. Click the "API Keys" tab
3. Click "Request API Access"
4. Select a tier (bronze, silver, gold) and provide use case
5. Wait for approval from platform engineers
6. Once approved, your API key will appear in the API Keys tab

### For Platform Engineers

1. Navigate to the Kuadrant page from the sidebar menu
2. View "Pending API Key Requests" card
3. Review each request with details:
   - Requester information
   - API name and namespace
   - Requested tier
   - Use case justification
4. Approve or reject with optional comments
5. API keys are automatically created in Kubernetes upon approval

### For API Owners

1. Navigate to the Kuadrant page
2. View all API products synced from Kubernetes
3. Create new API products with:
   - Display name and description
   - Multiple tiers with rate limits
   - Associated PlanPolicy references
   - Contact information and documentation links
4. API products automatically sync to Backstage catalog as APIProduct entities

## Components

### Pages

- **`KuadrantPage`** - Main page showing API products list and approval queue

### Entity Content Components

- **`EntityKuadrantApiKeysContent`** - Full API keys management tab for API entities
- **`EntityKuadrantApiProductInfoContent`** - APIProduct details and plan information tab
- **`EntityKuadrantApiAccessCard`** - Quick API key request card for API entity overview

### Other Components

- **`ApprovalQueueCard`** - Displays pending API key requests for platform engineers
- **`CreateAPIProductDialog`** - Dialog for creating new API products

### Hooks

- **`useUserRole()`** - Determines user role based on Backstage groups:
  - Platform Engineer: member of `platform-engineers` or `platform-admins`
  - API Owner: member of `api-owners` or `app-developers`
  - API Consumer: member of `api-consumers`

## Backend API Reference

The backend plugin exposes REST API endpoints at `/api/kuadrant/*`. All endpoints require authentication and enforce RBAC permissions.

### APIProduct Endpoints

| Method | Endpoint | Description | Permission |
|--------|----------|-------------|------------|
| GET | `/api/kuadrant/apiproducts` | List all API Products (filtered by ownership for non-admins) | `kuadrant.apiproduct.list` |
| GET | `/api/kuadrant/apiproducts/:namespace/:name` | Get specific API Product | `kuadrant.apiproduct.read.own` or `.read.all` |
| POST | `/api/kuadrant/apiproducts` | Create new API Product | `kuadrant.apiproduct.create` |
| PATCH | `/api/kuadrant/apiproducts/:namespace/:name` | Update API Product | `kuadrant.apiproduct.update.own` or `.update.all` |
| DELETE | `/api/kuadrant/apiproducts/:namespace/:name` | Delete API Product (cascades to APIKeys) | `kuadrant.apiproduct.delete.own` or `.delete.all` |

### HTTPRoute Endpoints

| Method | Endpoint | Description | Permission |
|--------|----------|-------------|------------|
| GET | `/api/kuadrant/httproutes` | List all HTTPRoutes | `kuadrant.apiproduct.list` |

### PlanPolicy Endpoints

| Method | Endpoint | Description | Permission |
|--------|----------|-------------|------------|
| GET | `/api/kuadrant/planpolicies` | List all Plan Policies | `kuadrant.planpolicy.list` |
| GET | `/api/kuadrant/planpolicies/:namespace/:name` | Get specific Plan Policy | `kuadrant.planpolicy.read` |

### API Key Request Endpoints

| Method | Endpoint | Description | Permission |
|--------|----------|-------------|------------|
| GET | `/api/kuadrant/requests` | List API Key requests (filtered by ownership) | `kuadrant.apikeyrequest.read.own` or `.read.all` |
| GET | `/api/kuadrant/requests/my` | List current user's requests | `kuadrant.apikeyrequest.read.own` |
| POST | `/api/kuadrant/requests` | Create API Key request | `kuadrant.apikeyrequest.create` |
| PATCH | `/api/kuadrant/requests/:namespace/:name` | Edit pending request | `kuadrant.apikeyrequest.update.own` or `.update.all` |
| DELETE | `/api/kuadrant/requests/:namespace/:name` | Delete/cancel request | `kuadrant.apikeyrequest.delete.own` or `.delete.all` |
| POST | `/api/kuadrant/requests/:namespace/:name/approve` | Approve request | `kuadrant.apikeyrequest.update.own` or `.update.all` |
| POST | `/api/kuadrant/requests/:namespace/:name/reject` | Reject request | `kuadrant.apikeyrequest.update.own` or `.update.all` |
| POST | `/api/kuadrant/requests/bulk-approve` | Bulk approve requests | `kuadrant.apikeyrequest.update.all` |
| POST | `/api/kuadrant/requests/bulk-reject` | Bulk reject requests | `kuadrant.apikeyrequest.update.all` |

### API Key Secret Endpoints

| Method | Endpoint | Description | Permission |
|--------|----------|-------------|------------|
| GET | `/api/kuadrant/apikeys/:namespace/:name/secret` | Get API key secret (one-time read) | `kuadrant.apikey.read.own` or `.read.all` |

### Query Parameters

**`GET /api/kuadrant/requests`:**
- `status` - Filter by status: `Pending`, `Approved`, `Rejected`
- `namespace` - Filter by Kubernetes namespace

**`GET /api/kuadrant/requests/my`:**
- `namespace` - Filter by Kubernetes namespace

### Request/Response Examples

**Create API Key Request:**

```bash
POST /api/kuadrant/requests
Content-Type: application/json

{
  "apiProductName": "toystore-api",
  "namespace": "toystore",
  "planTier": "silver",
  "useCase": "Integration testing",
  "userEmail": "user@example.com"
}
```

**Approve Request:**

```bash
POST /api/kuadrant/requests/toystore/guest-toystore-abc123/approve
Content-Type: application/json

{
  "comment": "Approved for testing purposes"
}
```

**Create API Product:**

```bash
POST /api/kuadrant/apiproducts
Content-Type: application/json

{
  "apiVersion": "devportal.kuadrant.io/v1alpha1",
  "kind": "APIProduct",
  "metadata": {
    "name": "my-api"
  },
  "spec": {
    "displayName": "My API",
    "description": "API description",
    "targetRef": {
      "group": "gateway.networking.k8s.io",
      "kind": "HTTPRoute",
      "name": "my-route",
      "namespace": "my-namespace"
    },
    "approvalMode": "manual",
    "publishStatus": "Draft"
  }
}
```

### Error Responses

| Status | Description |
|--------|-------------|
| 400 | Invalid request body (validation error) |
| 403 | Unauthorized (missing permission or ownership check failed) |
| 404 | Resource not found |
| 500 | Internal server error |

## Kubernetes Resources

The plugin creates and manages Kubernetes custom resources:

### APIKey

Created when users request API access:

```yaml
apiVersion: devportal.kuadrant.io/v1alpha1
kind: APIKey
metadata:
  name: guest-toystore-abc123
  namespace: toystore
spec:
  apiName: toystore
  apiNamespace: toystore
  planTier: silver
  requestedAt: "2025-10-29T08:14:49.412Z"
  requestedBy:
    userId: guest
    email: user@example.com
  useCase: "Testing API integration"
```

### API Key Secrets

Created upon approval:

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: user-toystore-1234567890
  namespace: toystore
  labels:
    app: toystore  # Matches AuthPolicy selector
  annotations:
    secret.kuadrant.io/user-id: john
    secret.kuadrant.io/plan-id: silver
type: Opaque
data:
  api_key: <base64-encoded-key>
```

### APIProduct

Synced from Kubernetes to Backstage catalog:

```yaml
apiVersion: devportal.kuadrant.io/v1alpha1
kind: APIProduct
metadata:
  name: toystore-api
  namespace: toystore
spec:
  displayName: Toystore API
  description: Simple toy store API for demonstration
  version: v1
  plans:
    - tier: gold
      description: Premium access
      limits:
        daily: 100
    - tier: silver
      description: Standard access
      limits:
        daily: 50
  planPolicyRef:
    name: toystore-plans
    namespace: toystore
  contact:
    team: platform-team
    email: platform@example.com
```

## Development

### Running Locally

```bash
# Frontend plugin
cd plugins/kuadrant
yarn start

# Backend plugin
cd plugins/kuadrant-backend
yarn start
```

### Building

```bash
yarn build
```

### Testing

```bash
yarn test
```

### Linting

```bash
yarn lint:check
yarn lint:fix
```

## Permissions

The plugin integrates with Backstage permissions. Different views and actions are available based on user roles:

- **Platform Engineers**: Full access including approval queue
- **API Owners**: Can create and manage API products
- **API Consumers**: Can request API access and manage their keys

Roles are determined by Backstage catalog group membership.

## Troubleshooting

### "No pending requests" shown but requests exist in Kubernetes

Ensure the backend is using the correct backend URL. Check browser console for errors about non-JSON responses, which indicates the frontend is hitting the wrong endpoint.

### APIProduct entities not appearing in catalog

1. Check backend logs for APIProduct entity provider sync messages
2. Verify Kubernetes connectivity from the backend
3. Ensure APIProduct CRDs exist in your cluster
4. Check catalog rules allow APIProduct kind

### API key requests failing

1. Verify Kubernetes write permissions for the backend service account
2. Check backend logs for detailed error messages
3. Ensure the target namespace exists and is accessible

## Related Documentation

- [Backend Plugin README](../kuadrant-backend/README.md)
- [Kuadrant Documentation](https://docs.kuadrant.io/)
- [Backstage Plugin Development](https://backstage.io/docs/plugins/)
