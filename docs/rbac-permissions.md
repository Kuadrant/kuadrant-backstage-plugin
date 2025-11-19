# RBAC and Permissions

This document describes the complete permission model for the Kuadrant Backstage plugin.

## Overview

The Kuadrant plugin uses Backstage's RBAC system for access control across API Products, API Key Requests, and Plan Policies. Permissions follow a consistent `.own` / `.all` pattern for resource-level access control.

## Permission Structure

### Naming Convention

Permissions follow the pattern: `kuadrant.<resource>.<action>[.scope]`

- **resource**: `planpolicy`, `apiproduct`, `apikeyrequest`, `apikey`
- **action**: `create`, `read`, `update`, `delete`, `list`
- **scope**: `own` (user's resources) or `all` (any resource) - omitted for non-scoped permissions

### Permission Types

**Basic Permissions**: No ownership scope, apply globally
- `kuadrant.planpolicy.create`
- `kuadrant.planpolicy.read`
- `kuadrant.planpolicy.list`

**Scoped Permissions**: Ownership-aware access control
- `kuadrant.apiproduct.read.own` - read your own API Products
- `kuadrant.apiproduct.read.all` - read any API Product

**Resource Permissions**: Include resource references for fine-grained control
- `kuadrant.apikeyrequest.create` with resource ref `apiproduct:namespace/name`

## Complete Permission List

### PlanPolicy Permissions

| Permission | Description | Notes |
|------------|-------------|-------|
| `kuadrant.planpolicy.create` | Create plan policies | Not exposed via plugin - managed on cluster |
| `kuadrant.planpolicy.read` | Read plan policy details | |
| `kuadrant.planpolicy.update` | Update plan policies | Not exposed via plugin |
| `kuadrant.planpolicy.delete` | Delete plan policies | Not exposed via plugin |
| `kuadrant.planpolicy.list` | List plan policies | |

### APIProduct Permissions

| Permission | Description | Scope |
|------------|-------------|-------|
| `kuadrant.apiproduct.create` | Create API Products | - |
| `kuadrant.apiproduct.read.own` | Read your own API Products | Own |
| `kuadrant.apiproduct.read.all` | Read any API Product | All |
| `kuadrant.apiproduct.update.own` | Update your own API Products | Own |
| `kuadrant.apiproduct.update.all` | Update any API Product | All |
| `kuadrant.apiproduct.delete.own` | Delete your own API Products | Own |
| `kuadrant.apiproduct.delete.all` | Delete any API Product | All |
| `kuadrant.apiproduct.list` | List API Products (filtered by read permissions) | - |

### APIKeyRequest Permissions

| Permission | Description | Scope |
|------------|-------------|-------|
| `kuadrant.apikeyrequest.create` | Request API access | Resource (APIProduct) |
| `kuadrant.apikeyrequest.read.own` | Read requests you created | Own |
| `kuadrant.apikeyrequest.read.all` | Read any request | All |
| `kuadrant.apikeyrequest.update.own` | Edit your own pending requests | Own |
| `kuadrant.apikeyrequest.update.all` | Approve/reject any request | All |
| `kuadrant.apikeyrequest.delete.own` | Delete your own requests | Own |
| `kuadrant.apikeyrequest.delete.all` | Delete any request | All |
| `kuadrant.apikeyrequest.list` | List requests (filtered by read permissions) | - |

### API Key Permissions

| Permission | Description | Scope |
|------------|-------------|-------|
| `kuadrant.apikey.read.own` | View your own API keys | Own |
| `kuadrant.apikey.read.all` | View any API key | All |
| `kuadrant.apikey.delete.own` | Delete your own API keys | Own |
| `kuadrant.apikey.delete.all` | Delete any API key | All |

## Role Definitions

### API Consumer

**Purpose**: End users who consume APIs

**Permissions**:
- `kuadrant.apiproduct.read.all` - browse API catalog
- `kuadrant.apiproduct.list`
- `kuadrant.apikeyrequest.create` - request API access
- `kuadrant.apikeyrequest.read.own` - view own requests
- `kuadrant.apikeyrequest.update.own` - edit own pending requests
- `kuadrant.apikeyrequest.delete.own` - cancel own requests
- `kuadrant.apikey.read.own` - view own API keys
- `kuadrant.apikey.delete.own` - revoke own API keys

**Cannot**:
- Create or manage API Products
- Approve/reject requests
- View other users' API keys

### API Owner

**Purpose**: Users who publish and manage their own APIs

**Permissions**:
- All API Consumer permissions, plus:
- `kuadrant.planpolicy.read` - view plan policies (to reference when creating products)
- `kuadrant.planpolicy.list`
- `kuadrant.apiproduct.create` - create API Products
- `kuadrant.apiproduct.read.own` - view own API Products only
- `kuadrant.apiproduct.update.own` - update own API Products
- `kuadrant.apiproduct.delete.own` - delete own API Products
- `kuadrant.apikeyrequest.update.own` - approve/reject requests for own APIs (see approval workflow below)

**Cannot**:
- View or modify other owners' API Products
- Create/update/delete PlanPolicies (managed on cluster)
- Approve requests for other owners' APIs

### API Admin

**Purpose**: Platform engineers who manage all API Products

**Permissions**:
- All `.all` scoped permissions
- `kuadrant.apiproduct.read.all` - view all API Products
- `kuadrant.apiproduct.update.all` - update any API Product
- `kuadrant.apiproduct.delete.all` - delete any API Product
- `kuadrant.apikeyrequest.read.all` - view all requests
- `kuadrant.apikeyrequest.update.all` - approve/reject any request
- `kuadrant.apikeyrequest.delete.all` - delete any request
- `kuadrant.apikey.read.all` - view any API key
- `kuadrant.apikey.delete.all` - delete any API key
- RBAC policy management permissions

**Cannot**:
- Create/update/delete PlanPolicies (managed on cluster)

## Ownership Model

### Ownership Tracking

APIProducts track ownership via Kubernetes annotations:

```yaml
metadata:
  annotations:
    backstage.io/created-by-user-id: "jmadigan"
    backstage.io/created-by-user-ref: "user:default/jmadigan"
    backstage.io/created-at: "2025-11-14T10:30:00Z"
```

**Immutability**: Ownership annotations are set on creation and cannot be modified. This prevents ownership hijacking and maintains clear accountability.

### Backend Enforcement Pattern

All sensitive endpoints use tiered permission checks:

```typescript
// 1. try .all permission first (admin access)
const allDecision = await permissions.authorize(
  [{ permission: kuadrantApiProductUpdateAllPermission }],
  { credentials }
);

if (allDecision[0].result !== AuthorizeResult.ALLOW) {
  // 2. fallback to .own permission
  const ownDecision = await permissions.authorize(
    [{ permission: kuadrantApiProductUpdateOwnPermission }],
    { credentials }
  );

  if (ownDecision[0].result !== AuthorizeResult.ALLOW) {
    throw new NotAllowedError('unauthorised');
  }

  // 3. verify ownership
  const apiProduct = await k8sClient.getCustomResource(...);
  const createdByUserId = apiProduct.metadata?.annotations?.['backstage.io/created-by-user-id'];
  if (createdByUserId !== userId) {
    throw new NotAllowedError('you can only update your own api products');
  }
}

// proceed with operation
```

### List Endpoint Filtering

List endpoints return different results based on permissions:

```typescript
// GET /apiproducts
if (hasReadAllPermission) {
  return allApiProducts;
} else if (hasReadOwnPermission) {
  return allApiProducts.filter(p =>
    p.metadata?.annotations?.['backstage.io/created-by-user-id'] === userId
  );
} else {
  throw new NotAllowedError('unauthorised');
}
```

## Approval Workflow

### APIKeyRequest Permissions

API Owners can approve/reject requests for their own APIs using the `.update.own` permission. The backend verifies:

1. User has `kuadrant.apikeyrequest.update.own` or `kuadrant.apikeyrequest.update.all`
2. If using `.update.own`, user must own the associated APIProduct

```typescript
// approval endpoint logic
const updateAllDecision = await permissions.authorize(
  [{ permission: kuadrantApiKeyRequestUpdateAllPermission }],
  { credentials }
);

if (updateAllDecision[0].result !== AuthorizeResult.ALLOW) {
  const updateOwnDecision = await permissions.authorize(
    [{ permission: kuadrantApiKeyRequestUpdateOwnPermission }],
    { credentials }
  );

  if (updateOwnDecision[0].result !== AuthorizeResult.ALLOW) {
    throw new NotAllowedError('unauthorised');
  }

  // fetch apiproduct and verify ownership
  const apiProduct = await k8sClient.getCustomResource(...);
  if (apiProduct.metadata.annotations['backstage.io/created-by-user-id'] !== userId) {
    throw new NotAllowedError('you can only approve requests for your own api products');
  }
}
```

### Approval Queue Visibility

- **API Consumers**: No approval queue card visible
- **API Owners**: See only requests for their own API Products
- **API Admins**: See all pending requests

## Per-APIProduct Access Control

The `kuadrant.apikeyrequest.create` permission supports resource references for fine-grained control:

```csv
# allow all consumers to request any API
p, role:default/api-consumer, kuadrant.apikeyrequest.create, create, allow, apiproduct:*/*

# restrict specific APIs to specific roles
p, role:default/partner, kuadrant.apikeyrequest.create, create, allow, apiproduct:toystore/toystore-api
p, role:default/internal, kuadrant.apikeyrequest.create, create, allow, apiproduct:internal/*
```

Backend checks include the resource reference:

```typescript
const resourceRef = `apiproduct:${apiNamespace}/${apiName}`;
const decision = await permissions.authorize([{
  permission: kuadrantApiKeyRequestCreatePermission,
  resourceRef,
}], { credentials });
```

## Catalog Integration

The APIProduct entity provider only syncs products with ownership annotations to the Backstage catalog:

```typescript
const owner = product.metadata.annotations?.['backstage.io/created-by-user-ref'];
if (!owner) {
  console.warn(`skipping apiproduct ${namespace}/${name} - no ownership annotation`);
  return null;
}

const entity: ApiEntity = {
  spec: {
    owner,  // "user:default/jmadigan"
    // ...
  }
};
```

This ensures clean separation between Backstage-managed and kubectl-managed resources.

## RBAC Configuration

### Policy File Location

`rbac-policy.csv` at repository root

### Configuration Reference

See `app-config.local.yaml`:

```yaml
permission:
  enabled: true
  rbac:
    policies-csv-file: ./rbac-policy.csv
    policyFileReload: true
```

### Testing Different Roles

Use the included helper scripts:

```bash
yarn user:consumer  # switch to API Consumer role
yarn user:owner     # switch to API Owner role
yarn user:default   # restore default permissions
```

After switching roles, restart with `yarn dev`.

## Security Considerations

### Input Validation

All mutating endpoints use Zod schemas to validate request bodies with explicit whitelists:

```typescript
const patchSchema = z.object({
  spec: z.object({
    displayName: z.string().optional(),
    description: z.string().optional(),
    // only allowed fields - targetRef, namespace, etc. excluded
  }).partial(),
});
```

### Ownership Immutability

PATCH endpoints explicitly prevent modification of ownership annotations:

```typescript
// prevent ownership hijacking
if (req.body.metadata?.annotations) {
  delete req.body.metadata.annotations['backstage.io/created-by-user-id'];
  delete req.body.metadata.annotations['backstage.io/created-by-user-ref'];
  delete req.body.metadata.annotations['backstage.io/created-at'];
}
```

### Authentication Required

All endpoints require valid authentication with no guest fallbacks:

```typescript
const credentials = await httpAuth.credentials(req);

if (!credentials || !credentials.principal) {
  throw new NotAllowedError('authentication required');
}
```

## Frontend Permission Checks

Use the custom `useKuadrantPermission` hook for permission-aware UI:

```typescript
import { useKuadrantPermission } from '../../utils/permissions';

const { allowed, loading, error } = useKuadrantPermission(
  kuadrantApiProductCreatePermission
);

if (loading) return <Progress />;
if (!allowed) return null; // hide button
```

For ownership-aware actions:

```typescript
import { canDeleteResource } from '../../utils/permissions';

const canDelete = canDeleteResource(
  resource.spec.requestedBy.userId,  // owner
  currentUserId,                      // current user
  canDeleteOwnPermission,             // permission to delete own
  canDeleteAllPermission              // permission to delete all
);
```

## Two-Layer RBAC Model

The Kuadrant plugin uses separate RBAC layers with clear separation:

**Layer 1: Backstage RBAC (Portal Access Control)**
- Catalog visibility: who can see API entities
- Request creation: who can request API keys
- Approval: who can approve/reject requests
- Management: who can create/delete APIProducts

**Layer 2: Kuadrant/Gateway RBAC (Runtime Access Control)**
- API key validation: is this key valid? (AuthPolicy)
- Rate limiting: what limits apply? (PlanPolicy predicate checks)
- Authentication: does request have valid auth? (AuthPolicy)

**No overlap**: Backstage controls who gets API keys, Kuadrant/Gateway enforces runtime limits.
