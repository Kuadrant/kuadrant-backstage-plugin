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
  # APIProduct and APIKeyRequest CRDs
  - apiGroups: ["extensions.kuadrant.io"]
    resources: ["apiproducts", "apikeyrequests"]
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

## Kubernetes Resources

The plugin creates and manages Kubernetes custom resources:

### APIKeyRequest

Created when users request API access:

```yaml
apiVersion: extensions.kuadrant.io/v1alpha1
kind: APIKeyRequest
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
apiVersion: extensions.kuadrant.io/v1alpha1
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
