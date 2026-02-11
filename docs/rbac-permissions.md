# RBAC and Permissions

This document describes the complete permission model for the Kuadrant Backstage plugin.

## Overview

The Kuadrant plugin uses Backstage's RBAC system for access control across API Products, API Keys, and Plan Policies. Permissions follow a consistent `.own` / `.all` pattern for resource-level access control.

## Design Principles

When adding or modifying permissions, follow these principles:

### 1. Pure RBAC Only

All authorisation decisions must use Backstage RBAC permissions. Never bypass RBAC with:
- Group membership checks (e.g., `if (user.groups.includes('api-owners'))`)
- Data-based ownership checks for UI visibility (e.g., `if (user owns any API products)`)
- Role flags derived from user identity

If you need to control access to a feature, create a permission for it.

### 2. One Permission Per Distinct Capability

Each permission should represent a single, well-defined capability. Don't overload permissions with multiple meanings.

**Example:** `kuadrant.apikey.update.own` was overloaded:
- Consumers used it to edit their pending requests
- API Owners used it to imply approval queue access

**Solution:** Added `kuadrant.apikey.approve` as a separate permission for approval queue access.

### 3. UI Visibility = Permission Check

If a UI element should be hidden from certain users, gate it with a permission check. Don't use data queries to determine visibility.

```typescript
// correct - pure RBAC
const { allowed } = useKuadrantPermission(kuadrantApiKeyApprovePermission);
if (allowed) {
  return <ApprovalQueueCard />;
}

// incorrect - data-based check
const userOwnsProducts = apiProducts.some(p => p.owner === userId);
if (userOwnsProducts) {
  return <ApprovalQueueCard />;
}
```

### 4. Backend Enforces, Frontend Hints

Permissions in the frontend are for UX (hiding buttons, showing appropriate UI). The backend must always enforce permissions independently - never trust the frontend.

### 5. Scope Permissions Appropriately

- `.own` - user can act on resources they created/own
- `.all` - user can act on any resource regardless of ownership
- No scope - permission applies globally (e.g., `list`, `create`)

For actions that don't fit the ownership model (like viewing an approval queue), use an unscoped permission.

## Permission Structure

### Naming Convention

Permissions follow the pattern: `kuadrant.<resource>.<action>[.scope]`

- **resource**: `planpolicy`, `apiproduct`, `apikey`
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
- `kuadrant.apikey.create` with resource ref `apiproduct:namespace/name`

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

### APIKey Permissions

| Permission | Description | Scope |
|------------|-------------|-------|
| `kuadrant.apikey.create` | Request API access | Resource (APIProduct) |
| `kuadrant.apikey.read.own` | Read requests you created | Own |
| `kuadrant.apikey.read.all` | Read any request | All |
| `kuadrant.apikey.update.own` | Edit your own pending requests | Own |
| `kuadrant.apikey.update.all` | Update any request | All |
| `kuadrant.apikey.delete.own` | Delete your own requests | Own |
| `kuadrant.apikey.delete.all` | Delete any request | All |
| `kuadrant.apikey.approve` | Access approval queue, approve/reject requests | - |
| `kuadrant.apikey.list` | List requests (filtered by read permissions) | - |

### AuthPolicy Permissions

| Permission | Description | Notes |
|------------|-------------|-------|
| `kuadrant.authpolicy.list` | List authpolicies | Read-only access for API Admins and Owners |

### RateLimitPolicy Permissions

| Permission | Description | Notes |
|------------|-------------|-------|
| `kuadrant.ratelimitpolicy.list` | List ratelimitpolicies | Read-only access for API Admins and Owners |

## Role Definitions

The Kuadrant plugin defines four personas with distinct responsibilities and permissions:

### API Consumer

**Purpose**: End users who consume APIs

**Permissions**:
- `kuadrant.apiproduct.read.all` - browse API catalog
- `kuadrant.apiproduct.list`
- `kuadrant.apikey.create` - request API access
- `kuadrant.apikey.read.own` - view own requests
- `kuadrant.apikey.update.own` - edit own pending requests
- `kuadrant.apikey.delete.own` - cancel own requests
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
- `kuadrant.planpolicy.read` - view plan policies (for reference)
- `kuadrant.planpolicy.list`
- `kuadrant.apiproduct.create` - create API Products
- `kuadrant.apiproduct.read.own` - view own API Products
- `kuadrant.apiproduct.update.own` - update own API Products
- `kuadrant.apiproduct.delete.own` - delete own API Products
- `kuadrant.apikey.approve` - access approval queue, approve/reject requests for own APIs
- `kuadrant.apikey.read.own` - view API keys for own APIs
- `kuadrant.apikey.delete.own` - delete API keys for own APIs

**Cannot**:
- View or modify other owners' API Products
- Create/update/delete PlanPolicies (managed on cluster)
- Approve requests for other owners' APIs

### API Admin

**Purpose**: Platform engineers who manage all API Products

**Responsibilities**:
- Manages all API Products across the platform
- Approves/rejects any API key request (cross-team)
- Troubleshoots issues on behalf of API Owners
- Provides second-level support for API management

**Permissions**:
- All `.all` scoped permissions
- `kuadrant.apiproduct.create` - create any API Product
- `kuadrant.apiproduct.read.all` - view all API Products
- `kuadrant.apiproduct.update.all` - update any API Product
- `kuadrant.apiproduct.delete.all` - delete any API Product
- `kuadrant.apikey.read.all` - view all requests
- `kuadrant.apikey.update.all` - update any request
- `kuadrant.apikey.approve` - access approval queue, approve/reject any request
- `kuadrant.apikey.delete.all` - delete any request/API key
- RBAC policy management permissions

**Cannot**:
- Create/update/delete PlanPolicies (managed on cluster)
- Create/update/delete AuthPolicies (managed on cluster)
- Create/update/delete RateLimitPolicies (managed on cluster)
- Modify platform infrastructure (HTTPRoutes, Gateways)

### Platform Engineer

**Purpose**: Infrastructure engineers who manage Kuadrant platform

**Responsibilities**:
- Manages cluster infrastructure (Gateways, HTTPRoutes, PlanPolicies)
- Creates PlanPolicy resources with rate limit tiers
- Coordinates with API Admins and API Owners when changing rate limits
- Does not typically manage individual API Products (delegated to API Admins/Owners)

**Permissions**:
- Full cluster admin access (Kubernetes RBAC)
- Create/read/update/delete PlanPolicy resources
- Create/read/update/delete HTTPRoute resources
- Create/read/update/delete Gateway resources
- Manage RBAC policies

**Cannot**:
- Typically does not manage day-to-day API Products (delegates to API Admin)

## RBAC Permissions Matrix

Comprehensive view of what each persona can and cannot do:

| Persona | Can Do | Cannot Do |
|---------|--------|-----------|
| **Platform Engineer** | • Manage Kuadrant infrastructure (Gateways, HTTPRoutes)<br/>• Create/update/delete PlanPolicy resources<br/>• Manage RBAC policies and permissions<br/>• Configure platform-wide settings<br/>• Full cluster admin access for platform management | • Typically does not manage day-to-day API Products (delegates to API Admin/Owner)<br/>• Should coordinate with API Admins and API Owners before changing rate limits |
| **API Admin** | • Read all APIProducts<br/>• Create/update/delete any APIProduct<br/>• Approve/reject any API key requests<br/>• Manage all API keys (read/delete)<br/>• View all APIKeys<br/>• Troubleshoot on behalf of API Owners<br/>• All `.all` scoped permissions | • Cannot create/update/delete PlanPolicy<br/>• Cannot modify platform infrastructure (HTTPRoutes, Gateways) |
| **API Owner** | • Read/list HTTPRoutes (to publish APIs)<br/>• Create/update/delete own APIProducts<br/>• Read all APIProducts<br/>• Approve/reject API key requests for own APIs<br/>• Delete API key requests for own APIs<br/>• Manage own API documentation<br/>• View/manage API keys for own APIs | • Cannot create/update PlanPolicy<br/>• Cannot modify platform infrastructure<br/>• Cannot approve requests for other owners' APIs<br/>• Cannot update/delete other owners' APIProducts |
| **API Consumer** | • Read/list APIProduct<br/>• Create APIKey<br/>• Read/update/delete own APIKeys<br/>• View own request status<br/>• Manage own API keys<br/>• Use APIs within rate limit quotas | • Cannot approve requests<br/>• Cannot view others' requests<br/>• Cannot create or publish APIs<br/>• Cannot modify rate limits |

### Permission Breakdown by Resource

**PlanPolicy (rate limit tiers):**
- Platform Engineer: create, read, update, delete
- API Admin: read, list (for reference)
- API Owner: read, list (for reference)
- API Consumer: none

**HTTPRoute:**
- Platform Engineer: create, read, update, delete, annotate
- API Admin: read, list (for reference)
- API Owner: read, list (to select for publishing)
- API Consumer: none (indirect read through APIProduct)

**APIProduct (catalog entries):**
- Platform Engineer: typically none (delegated to API Admin/Owner)
- API Admin: create, read, update, delete (all)
- API Owner: create, read (all), update (own), delete (own)
- API Consumer: read, list

**APIKey (access requests):**
- Platform Engineer: typically none (delegated to API Admin)
- API Admin: create, read (all), update (all), delete (all), approve
- API Owner: create, read (own), update (own), delete (own), approve (for own APIs)
- API Consumer: create, read (own), update (own - edit pending), delete (own)

**AuthPolicy (authentication rules):**
- Platform Engineer: create, read, update, delete
- API Admin: list (for reference)
- API Owner: list (for reference)
- API Consumer: none

**RateLimitPolicy (rate limiting rules):**
- Platform Engineer: create, read, update, delete
- API Admin: list (for reference)
- API Owner: list (for reference)
- API Consumer: none

### Role Hierarchy

The four personas form a clear hierarchy:

1. **Platform Engineer** - infrastructure layer (cluster, gateways, rate limits)
2. **API Admin** - management layer (all API Products, all requests)
3. **API Owner** - ownership layer (own API Products, own API requests)
4. **API Consumer** - consumption layer (browse, request, use)

Each layer builds on the capabilities below it, with clear boundaries of responsibility.

## Ownership Model

### Ownership Tracking

APIProducts track ownership via the standard Backstage annotation:

```yaml
metadata:
  annotations:
    backstage.io/owner: "user:default/jmadigan"
```

The owner reference uses Backstage's entity reference format: `kind:namespace/name`

**Immutability**: The ownership annotation is set on creation and cannot be modified. This prevents ownership hijacking and maintains clear accountability.

**Timestamp**: Kubernetes automatically sets `metadata.creationTimestamp` for audit purposes.

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
  const owner = apiProduct.metadata?.annotations?.['backstage.io/owner'];
  const ownerUserId = extractUserIdFromOwner(owner); // extracts "jmadigan" from "user:default/jmadigan"

  if (ownerUserId !== userId) {
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
  return allApiProducts.filter(p => {
    const owner = p.metadata?.annotations?.['backstage.io/owner'];
    const ownerUserId = extractUserIdFromOwner(owner);
    return ownerUserId === userId;
  });
} else {
  throw new NotAllowedError('unauthorised');
}
```

## Approval Workflow

### Approval Queue Visibility

The approval queue card is gated by `kuadrant.apikey.approve`:

```typescript
const { allowed } = useKuadrantPermission(kuadrantApiKeyApprovePermission);
if (allowed) {
  return <ApprovalQueueCard />;
}
```

- **API Consumers**: No approval queue (no `approve` permission)
- **API Owners**: See approval queue, can approve requests for their own APIs
- **API Admins**: See approval queue, can approve any request

### Backend Approval Enforcement

The backend uses tiered permission checks for the actual approve/reject action:

1. Check `kuadrant.apikey.update.all` (admin access)
2. Fallback to ownership verification (API owner must own the APIProduct)

```typescript
// approval endpoint logic
const updateAllDecision = await permissions.authorize(
  [{ permission: kuadrantAPIKeyUpdateAllPermission }],
  { credentials }
);

if (updateAllDecision[0].result !== AuthorizeResult.ALLOW) {
  // not an admin - verify ownership of the APIProduct
  const apiProduct = await k8sClient.getCustomResource(...);
  const owner = apiProduct.metadata?.annotations?.['backstage.io/owner'];
  const ownerUserId = extractUserIdFromOwner(owner);

  if (ownerUserId !== userId) {
    throw new NotAllowedError('you can only approve requests for your own api products');
  }
}
```

Note: `kuadrant.apikey.approve` controls UI visibility of the approval queue. The backend enforces ownership separately to ensure API Owners can only approve requests for their own APIs.

## Per-APIProduct Access Control

The `kuadrant.apikey.create` permission supports resource references for fine-grained control:

```csv
# allow all consumers to request any API
p, role:default/api-consumer, kuadrant.apikey.create, create, allow, apiproduct:*/*

# restrict specific APIs to specific roles
p, role:default/partner, kuadrant.apikey.create, create, allow, apiproduct:toystore/toystore-api
p, role:default/internal, kuadrant.apikey.create, create, allow, apiproduct:internal/*
```

Backend checks include the resource reference:

```typescript
const resourceRef = `apiproduct:${apiNamespace}/${apiName}`;
const decision = await permissions.authorize([{
  permission: kuadrantAPIKeyCreatePermission,
  resourceRef,
}], { credentials });
```

## Catalog Integration

The APIProduct entity provider only syncs products with ownership annotations to the Backstage catalog:

```typescript
const owner = product.metadata.annotations?.['backstage.io/owner'];
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

PATCH endpoints explicitly prevent modification of ownership annotation:

```typescript
// prevent ownership hijacking
if (req.body.metadata?.annotations) {
  delete req.body.metadata.annotations['backstage.io/owner'];
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
