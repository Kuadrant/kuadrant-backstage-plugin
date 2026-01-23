# Kuadrant Resources

This document describes the Kuadrant CRDs, namespace organisation, and resource relationships.

## Resource Namespace Organisation

Kuadrant follows a strict namespace organisation pattern where all resources for an API must live in the same namespace:

```
namespace: toystore
├── httproute (toystore) - gateway api route definition
├── authpolicy (toystore) - authentication policy targeting httproute
├── planpolicy (toystore-plans) - rate limiting policy targeting httproute
├── service (toystore) - backend service
└── secrets (api keys) - created by backstage with plan-id annotations
```

### Why This Matters

1. **AuthPolicy references Secrets**: AuthPolicy needs to access Secrets in the same namespace for authentication
2. **Policies target HTTPRoute**: Both AuthPolicy and PlanPolicy use `targetRef` to reference the HTTPRoute by name (same namespace lookup)
3. **Secrets placement**: API keys (Secrets) must be in the API's namespace so AuthPolicy can reference them

### Implementation in Backstage

**Frontend validation:** PlanPolicy dropdown filtered to only show policies in the same namespace as the APIProduct being created.

See [`plugins/kuadrant/src/components/CreateAPIProductDialog/CreateAPIProductDialog.tsx`](../plugins/kuadrant/src/components/CreateAPIProductDialog/CreateAPIProductDialog.tsx)

**Backend Secret creation:** Secrets always created in `apiNamespace` (not request namespace).

See [`plugins/kuadrant-backend/src/router.ts`](../plugins/kuadrant-backend/src/router.ts) - search for `apiNamespace` usage in request creation endpoints.

## HTTPRoute-First APIProduct Model

**Current implementation:**
- Platform Engineers set up infrastructure on-cluster **first**:
  1. Create PlanPolicy with rate limit tiers
  2. Apply PlanPolicy to HTTPRoute via `targetRef`
- API Owner workflow in Backstage:
  1. Browse list of available HTTPRoutes
  2. Select existing HTTPRoute to publish
  3. Add catalog metadata (display name, description, docs, tags)
  4. APIProduct is created with `spec.targetRef` pointing to HTTPRoute
- APIProduct is a catalog/metadata layer, not defining infrastructure relationships

**Benefits:**
- Backstage remains read-only for infrastructure resources (HTTPRoute, PlanPolicy)
- PlanPolicy configuration happens on-cluster where it belongs (via kubectl/GitOps)
- Clear separation: Platform Engineers configure infrastructure, API Owners publish to catalog
- Multiple APIProducts can reference the same HTTPRoute

## APIKey Scoping to APIProduct

APIKey `spec.apiName` references the **APIProduct name** (not HTTPRoute name):
- Each APIProduct has its own isolated set of API key requests
- Multiple APIProducts can safely reference the same HTTPRoute with separate keys/requests

See [`plugins/kuadrant/src/components/ApiKeyManagementTab/ApiKeyManagementTab.tsx`](../plugins/kuadrant/src/components/ApiKeyManagementTab/ApiKeyManagementTab.tsx) for frontend implementation.

## API Key Management Model

APIKeys are the source of truth for API keys, not Kubernetes Secrets.

### Resource Relationship

```
APIKey (CRD)                    Secret (Kubernetes)
├── metadata.name               Created by controller when approved
├── spec.planTier               Name: {apikey-name}-apikey-secret
├── spec.apiProductRef.name     annotations:
├── spec.requestedBy.userId       - secret.kuadrant.io/plan-id
└── status.secretRef              - secret.kuadrant.io/user-id
    ├── name                    labels:
    └── key                       - app: <apiProductName>
                                  - authorino.kuadrant.io/managed-by: authorino
```

**Key points:**
- Controller creates Secret when APIKey phase is Approved
- Controller sets OwnerReference on Secret (garbage collected when APIKey deleted)
- `status.secretRef` points to the Secret (name + key)
- Frontend fetches actual key via GET /requests/:namespace/:name/secret

### UI Behaviour

**What users see:**
- Pending Requests - awaiting approval
- Rejected Requests - denied access
- Approved API Keys - click eye icon to reveal key (fetched on demand from Secret)

**API key display pattern:**
- Key hidden by default (shows `••••••••••••`)
- Click eye icon to fetch from Secret
- Fresh fetch every time to avoid caching sensitive data

### Deletion Flow

When user deletes an approved API key:
1. Backend deletes APIKey resource
2. Controller's OwnerReference causes Secret to be garbage collected
3. Both disappear from Kubernetes

## Approval Modes

APIProducts support two approval modes for API key requests:

### Manual (default)

Requests require explicit approval by API owner:
1. User requests API access → status: Pending
2. API Owner reviews → clicks approve → status: Approved
3. Controller creates Secret → user sees API key

### Automatic

Requests immediately approved by controller:
1. User requests API access
2. Controller auto-approves and creates Secret
3. User sees API key

**CRD field:** `spec.approvalMode` with enum values: `automatic`, `manual`

See CRD definition at [`kuadrant-dev-setup/crds/devportal.kuadrant.io_apiproduct.yaml`](../kuadrant-dev-setup/crds/devportal.kuadrant.io_apiproduct.yaml)

## Plan Discovery via Controller

APIProduct controller automatically discovers plans from PlanPolicy:
- Plans are written to `status.discoveredPlans` by the controller
- Controller watches for changes to APIProduct, HTTPRoute, and PlanPolicy resources

**Controller behaviour:**
- Finds PlanPolicy targeting the HTTPRoute (or its Gateway parent)
- Copies plan tiers and limits to `status.discoveredPlans`
- Sets status conditions:
  - `Ready`: True when HTTPRoute exists and is accepted by gateway
  - `PlanPolicyDiscovered`: True when PlanPolicy is found

**Frontend integration:** See [`plugins/kuadrant/src/components/ApiKeyManagementTab/ApiKeyManagementTab.tsx`](../plugins/kuadrant/src/components/ApiKeyManagementTab/ApiKeyManagementTab.tsx) - reads from `apiProduct.status.discoveredPlans`.

## PublishStatus for APIProducts

APIProducts have a Draft/Published workflow:
- `spec.publishStatus` field with enum values: `Draft`, `Published`
- Default value is `Draft` (hidden from catalog)
- Entity provider filters APIProducts, only syncing those with `publishStatus: Published`

See [`plugins/kuadrant-backend/src/provider/APIProductEntityProvider.ts`](../plugins/kuadrant-backend/src/provider/APIProductEntityProvider.ts) for filtering logic.

## Immediate Catalog Sync

After successful APIProduct create/delete operations, the router immediately calls `provider.refresh()` for instant catalog updates.

See:
- Provider: [`plugins/kuadrant-backend/src/provider/APIProductEntityProvider.ts`](../plugins/kuadrant-backend/src/provider/APIProductEntityProvider.ts)
- Router refresh calls: [`plugins/kuadrant-backend/src/router.ts`](../plugins/kuadrant-backend/src/router.ts) - search for `getAPIProductEntityProvider`
