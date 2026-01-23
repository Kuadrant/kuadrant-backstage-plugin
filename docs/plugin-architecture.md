# Plugin Architecture

This document describes the architectural decisions, components, and data flows of the Kuadrant Backstage plugin.

## Table of Contents

- [Component Architecture](#component-architecture)
- [Dependencies](#dependencies)
- [Data Flow Diagrams](#data-flow-diagrams)
- [Key Design Decisions](#key-design-decisions)
- [Technology Choices](#technology-choices)
- [Security Architecture](#security-architecture)

## Component Architecture

### High-Level Component Diagram

TODO ADD miro diagram

### Kubernetes Resource Structure

```
Namespace: toystore (example)
├── HTTPRoute: toystore
│   └── Defines API routes, backends
├── APIProduct: toystore-api
│   └── References HTTPRoute, sets approval mode
├── PlanPolicy: toystore-plans
│   └── Defines bronze/silver/gold tiers with rate limits
├── APIKey: alice-toystore-api-a1b2c3d4
│   ├── spec.apiProductRef → toystore-api
│   ├── status.phase: Approved
│   └── status.secretRef → Secret
├── Secret: alice-toystore-api-a1b2c3d4-apikey-secret
│   ├── ownerReferences → APIKey (garbage collection)
│   ├── labels.app: toystore-api (for Authorino)
│   ├── annotations.secret.kuadrant.io/user-id
│   ├── annotations.secret.kuadrant.io/plan-id
│   └── data.api_key: <base64-encoded-key>
└── AuthPolicy: toystore
    └── targetRef → HTTPRoute, selects Secrets by label
```

## Dependencies

### Frontend Dependencies

The Kuadrant frontend plugin depends on the following Backstage and third-party libraries:

**Core Backstage APIs**:
- `@backstage/core-plugin-api` - Plugin framework, routing, API refs
- `@backstage/plugin-catalog-react` - Catalog integration, entity display
- `@backstage/core-components` - Shared UI components (Table, Progress, etc.)
- `@backstage/plugin-permission-react` - Permission checking hooks

**UI and State**:
- `@material-ui/core` - Material Design components
- `@material-ui/icons` - Icon library
- `react-use` - React hooks library (useAsync for API calls)

**Type Safety**:
- `typescript` - Static typing
- Type definitions for API responses

### Backend Dependencies

The Kuadrant backend plugin depends on:

**Core Backstage**:
- `@backstage/backend-plugin-api` - Backend plugin framework
- `@backstage/plugin-permission-node` - Permission authorization
- `@backstage/plugin-auth-node` - Authentication services
- `@backstage/config` - Configuration management
- `@backstage/catalog-client` - Catalog API client
- `@backstage/catalog-model` - Entity models

**HTTP and Routing**:
- `express` - HTTP server framework
- `express-promise-router` - Async route handling

**Validation**:
- `zod` - Runtime schema validation and TypeScript type generation

**Kubernetes Integration**:
- `@kubernetes/client-node` - Official Kubernetes JavaScript client
  - `CustomObjectsApi` - For CRD operations (APIProduct, APIKey, PlanPolicy)
  - `CoreV1Api` - For Secrets and ConfigMaps

### External Service Dependencies

The plugin integrates with these external services:

**Kubernetes Cluster**:
- Kubernetes API Server (v1.27+)
- Custom Resource Definitions:
  - `APIProduct` (devportal.kuadrant.io/v1alpha1)
  - `APIKey` (devportal.kuadrant.io/v1alpha1)
  - `PlanPolicy` (extensions.kuadrant.io/v1alpha1)
  - `HTTPRoute` (gateway.networking.k8s.io/v1)

**Kuadrant Components** (external to Backstage):
- **Kuadrant Controller** - Reconciles CRDs, creates Secrets, discovers plans
- **Authorino** - Runtime API authentication (watches Secrets)
- **Limitador** - Rate limiting service (applies PlanPolicy limits)
- **Istio** - Service mesh and gateway implementation

### Authentication Flow Dependencies

```
Frontend (React)
  ↓ uses
Backstage Identity API
  ↓ provides credentials to
Backend HTTP Client (fetchApi)
  ↓ sends to
Backend Router (Express)
  ↓ validates with
HttpAuthService (Backstage)
  ↓ authorizes with
PermissionsService (Backstage RBAC)
  ↓ calls
KuadrantK8sClient
  ↓ authenticates to
Kubernetes API Server (ServiceAccount token or kubeconfig)
```

### Development Dependencies

**Build Tools**:
- `@backstage/cli` - Build and development tooling
- `webpack` - Module bundling
- `typescript` - Compilation

**Testing**:
- `@playwright/test` - End-to-end testing
- `jest` - Unit testing
- `@testing-library/react` - React component testing

## Data Flow Diagrams

### API Key Request Flow

```
┌─────────────┐
│ API Consumer│
│   (Alice)   │
└──────┬──────┘
       │
       │ 1. Request API Access (select plan, useCase)
       ▼
┌─────────────────────────┐
│ Frontend                │
└──────┬──────────────────┘
       │
       │ 2. POST /api/kuadrant/requests
       ▼
┌─────────────────────────┐
│ Backend                 │
│ - Validate & authorize  │
│ - Create APIKey CRD     │
└──────┬──────────────────┘
       │
       │ 3. APIKey created in K8s
       ▼
┌─────────────────────────┐
│ Kuadrant Controller     │
│ - Check approval mode   │
│ - Auto: Create Secret   │
│ - Manual: Set Pending   │
└──────┬──────────────────┘
       │
       │ 4. Status updated
       ▼
┌─────────────────────────┐
│ Frontend                │
│ - Shows status          │
│ - Reveal key (if ready) │
└─────────────────────────┘
```

### Manual Approval Workflow

```
┌─────────────┐
│ API Owner   │
│  (Bob)      │
└──────┬──────┘
       │
       │ 1. View pending requests
       ▼
┌─────────────────────────┐
│ Frontend                │
│ - Fetch pending APIKeys │
└──────┬──────────────────┘
       │
       │ 2. GET /api/kuadrant/requests?status=Pending
       ▼
┌─────────────────────────┐
│ Backend                 │
│ - Check permissions     │
│ - Filter by ownership   │
└──────┬──────────────────┘
       │
       │ 3. Display requests
       ▼
┌─────────────────────────┐
│ Frontend                │
│ - Show pending list     │
│ - Click [Approve]       │
└──────┬──────────────────┘
       │
       │ 4. POST /requests/{id}/approve
       ▼
┌─────────────────────────┐
│ Backend                 │
│ - Verify ownership      │
│ - Update APIKey status  │
└──────┬──────────────────┘
       │
       │ 5. Status updated
       ▼
┌─────────────────────────┐
│ Kuadrant Controller     │
│ - Detect approval       │
│ - Generate API key      │
│ - Create Secret         │
└──────┬──────────────────┘
       │
       │ 6. Key available
       ▼
┌─────────────────────────┐
│ Frontend                │
│ - Consumer sees key     │
│ - Can reveal once       │
└─────────────────────────┘
```

### Authentication Flow (Authorino)

This diagram shows how API keys are validated at runtime by Authorino.

```
┌─────────────────────┐
│ API Consumer (Alice)│
│ Mobile App          │
└──────┬──────────────┘
       │
       │ 1. HTTP Request to API
       │    GET https://api.example.com/toys
       │    Authorization: APIKEY <generated-key>
       ▼
┌─────────────────────────────────────┐
│ Istio Gateway                       │
│                                     │
│ Receives request, extracts:         │
│ - Authorization header              │
│ - Request metadata                  │
└──────┬──────────────────────────────┘
       │
       │ 2. External Authorization call
       ▼
┌─────────────────────────────────────────────────┐
│ Authorino (External Auth Service)               │
│                                                 │
│ 1. Receives auth check request from Istio      │
│ 2. Looks up AuthPolicy for HTTPRoute            │
│                                                 │
│ AuthPolicy: toystore                            │
│   spec:                                         │
│     targetRef:                                  │
│       kind: HTTPRoute                           │
│       name: toystore                            │
│     rules:                                      │
│       authentication:                           │
│         "api-key-users":                        │
│           apiKey:                               │
│             selector:                           │
│               matchLabels:                      │
│                 app: toystore-api               │
│           credentials:                          │
│             authorizationHeader:                │
│               prefix: APIKEY                    │
└──────┬──────────────────────────────────────────┘
       │
       │ 3. Query Kubernetes for Secrets
       │    with label app=toystore-api
       ▼
┌─────────────────────────────────────────────────┐
│ Kubernetes API Server                           │
│                                                 │
│ List Secrets in namespace=toystore              │
│ Filter by labels: app=toystore-api              │
│                                                 │
│ Returns:                                        │
│  - alice-toystore-api-...-secret                │
│  - charlie-toystore-api-...-secret              │
│  - dave-toystore-api-...-secret                 │
└──────┬──────────────────────────────────────────┘
       │
       │ 4. Validate API key
       ▼
┌─────────────────────────────────────────────────┐
│ Authorino: Validation Logic                     │
│                                                 │
│ 1. Extract key from header:                     │
│    Remove "APIKEY " prefix → <key-value>        │
│ 2. Compare <key-value> with each Secret:        │
│    - Decode Secret.data.api_key (base64)        │
│    - Compare with provided key                  │
│ 3. If match found:                              │
│    ✓ Valid key                                  │
│    - Extract user-id annotation                 │
│    - Extract plan-id annotation                 │
│ 4. If no match:                                 │
│    ✗ Invalid key → Deny request                 │
└──────┬──────────────────────────────────────────┘
       │
       │ 5. If valid, extract metadata
       ▼
┌─────────────────────────────────────────────────┐
│ Metadata Extracted from Secret                  │
│                                                 │
│ annotations:                                    │
│   secret.kuadrant.io/user-id:                   │
│     user:default/alice                          │
│   secret.kuadrant.io/plan-id: gold              │
│                                                 │
│ This metadata is passed to:                     │
│ - Limitador (for rate limiting by plan)         │
│ - Audit logs (for tracking)                     │
│ - Backend services (as headers)                 │
└──────┬──────────────────────────────────────────┘
       │
       │ 6. Pass to rate limiting
       ▼
┌─────────────────────────────────────────────────┐
│ Limitador (Rate Limiting Service)               │
│                                                 │
│ 1. Receive plan-id: gold                        │
│ 2. Lookup PlanPolicy: toystore-plans            │
│ 3. Find gold tier limits:                       │
│    - Daily: 10000 requests                      │
│    - Per minute: 100 requests                   │
│ 4. Check current usage for alice+gold           │
│ 5. If under limit:                              │
│    ✓ Allow, increment counter                   │
│ 6. If over limit:                               │
│    ✗ Deny, return 429 Too Many Requests         │
└──────┬──────────────────────────────────────────┘
       │
       │ 7. Authorization decision
       ▼
┌─────────────────────────────────────────────────┐
│ Authorino: Return Decision                      │
│                                                 │
│ If valid key AND under rate limit:              │
│   HTTP 200 OK → Allow request                   │
│   Headers to add:                               │
│     X-User-Id: user:default/alice               │
│     X-Plan-Id: gold                             │
│                                                 │
│ If invalid key:                                 │
│   HTTP 401 Unauthorized → Deny                  │
│                                                 │
│ If over rate limit:                             │
│   HTTP 429 Too Many Requests → Deny             │
└──────┬──────────────────────────────────────────┘
       │
       │ 8. Return to gateway
       ▼
┌─────────────────────────────────────────────────┐
│ Istio Gateway                                   │
│                                                 │
│ If allowed:                                     │
│   Forward request to backend service            │
│   (toystore API)                                │
│                                                 │
│ If denied:                                      │
│   Return error to client                        │
│   (401 or 429)                                  │
└──────┬──────────────────────────────────────────┘
       │
       │ 9. Response
       ▼
┌─────────────────────────────────────────────────┐
│ API Consumer                                    │
│                                                 │
│ Receives:                                       │
│ - 200 OK + API response data, OR                │
│ - 401 Unauthorized, OR                          │
│ - 429 Too Many Requests                         │
└─────────────────────────────────────────────────┘
```

**Important Notes**:
- Backstage does NOT talk to Authorino directly
- Authorino watches Kubernetes Secrets in real-time
- The controller creates Secrets with specific labels and annotations
- AuthPolicy configuration determines which Secrets are valid for which API
- This separation allows runtime authentication to work independently of Backstage

### Catalog Sync Flow

```
┌─────────────────────────────────────────────────┐
│ Kubernetes Cluster                              │
│                                                 │
│ APIProduct CRD: toystore-api                    │
│ metadata:                                       │
│   namespace: toystore                           │
│ spec:                                           │
│   displayName: "Toystore API"                   │
│   description: "API for toy management"         │
│   publishStatus: Published  ← Must be Published │
│   targetRef:                                    │
│     kind: HTTPRoute                             │
│     name: toystore                              │
│   documentation:                                │
│     openAPISpecURL: https://...                 │
└──────┬──────────────────────────────────────────┘
       │
       │ 1. Every 30 seconds (dev) or on-demand
       ▼
┌─────────────────────────────────────────────────┐
│ APIProductEntityProvider                        │
│ (plugins/kuadrant-backend/src/provider/)        │
│                                                 │
│ async refresh():                                │
│   1. List all APIProducts from K8s              │
│   2. Filter by publishStatus == "Published"     │
│   3. For each published APIProduct:             │
│      - Extract metadata                         │
│      - Fetch referenced HTTPRoute               │
│      - Extract hostname from HTTPRoute          │
│      - Build Backstage API entity               │
└──────┬──────────────────────────────────────────┘
       │
       │ 2. Transform to Backstage entity format
       ▼
┌─────────────────────────────────────────────────┐
│ Backstage API Entity                            │
│                                                 │
│ apiVersion: backstage.io/v1alpha1               │
│ kind: API                                       │
│ metadata:                                       │
│   name: toystore-api                            │
│   namespace: toystore                           │
│   title: "Toystore API"                         │
│   description: "API for toy management"         │
│   annotations:                                  │
│     backstage.io/managed-by-location:           │
│       url:https://.../toystore/toystore-api     │
│     kuadrant.io/apiproduct-namespace: toystore  │
│     kuadrant.io/apiproduct-name: toystore-api   │
│ spec:                                           │
│   type: openapi                                 │
│   lifecycle: production                         │
│   owner: user:default/bob  ← From location URL  │
│   definition: |                                 │
│     $text: https://...openapi.yaml              │
└──────┬──────────────────────────────────────────┘
       │
       │ 3. Apply mutation to catalog
       ▼
┌─────────────────────────────────────────────────┐
│ Backstage Catalog Database                      │
│                                                 │
│ Stores API entity                               │
│ Updates indexes                                 │
│ Triggers catalog processing                     │
└──────┬──────────────────────────────────────────┘
       │
       │ 4. Catalog queries
       ▼
┌─────────────────────────────────────────────────┐
│ Frontend: Catalog Pages                         │
│                                                 │
│ - API list (catalog/default/api)                │
│ - API detail page                               │
│ - Shows EntityKuadrantApiAccessCard             │
│ - Shows EntityKuadrantApiKeyManagementTab       │
└─────────────────────────────────────────────────┘
```

**Ownership Derivation**:
The provider sets ownership based on the `managed-by-location` annotation, which contains a URL like:
```
url:https://kubernetes-api/apis/devportal.kuadrant.io/v1alpha1/namespaces/toystore/apiproducts/toystore-api?user=user:default/bob
```

The `?user=` query parameter is extracted and set as the `spec.owner` in the Backstage entity.

## Key Design Decisions

### 1. Why CRDs Instead of ConfigMaps for Approval Workflow?

**Decision**: Use Kubernetes Custom Resource Definitions (APIKey, APIProduct, PlanPolicy) instead of ConfigMaps.

**Rationale**:
- **Schema Validation**: CRDs enforce schema via OpenAPI validation, preventing invalid data
- **Status Subresource**: Separate `spec` (desired state) from `status` (observed state) - controller pattern best practice
- **Versioning**: CRDs support versioning (v1alpha1, v1beta1, v1), allowing schema evolution
- **RBAC**: Fine-grained Kubernetes RBAC on custom resources
- **Controller Pattern**: Natural fit for reconciliation loops
- **Discoverability**: `kubectl api-resources` shows custom types
- **Garbage Collection**: OwnerReferences enable automatic cleanup
- **Watch API**: Efficient event-driven updates

**ConfigMaps Limitations**:
- No schema enforcement (just key-value strings)
- No status subresource (mixing desired and observed state)
- No versioning
- Less expressive RBAC (only read/write/delete)

### 2. Why No Direct Authorino Integration?

**Decision**: Backstage does not call Authorino APIs directly.

**Rationale**:
- **Separation of Concerns**:
  - Backstage = management plane (provisioning, catalog, RBAC)
  - Authorino = data plane (runtime authentication)
- **Loose Coupling**: Can upgrade/replace Authorino without changing Backstage
- **Kubernetes-Native**: Secrets are the interface, controller does the wiring
- **Scalability**: Authorino watches Secrets directly, no backend bottleneck

**How It Works**:
1. Backstage creates APIKey CRD
2. Controller creates Secret with labels/annotations
3. Authorino watches Secrets via Kubernetes API
4. API requests validated against Secrets in real-time

## Technology Choices

### Frontend
- **React + TypeScript** - Backstage standard, type-safe UI development
- **Material-UI** - Backstage's UI component library
- **Zod** - Schema validation with automatic TypeScript types

### Backend
- **Express.js** - Backstage standard HTTP framework
- **@kubernetes/client-node** - Official Kubernetes client for CRD operations
- **Backstage RBAC** - Built-in permission system

## Security Architecture

### Defense in Depth

The plugin implements security at multiple layers:

```
┌─────────────────────────────────────────────────┐
│ Layer 1: Authentication                         │
│ - All endpoints require valid Backstage creds   │
│ - No guest fallbacks                            │
│ - Token validation via HttpAuthService          │
└──────┬──────────────────────────────────────────┘
       │
┌──────▼──────────────────────────────────────────┐
│ Layer 2: Authorization (RBAC)                   │
│ - Permission checks on every endpoint           │
│ - Tiered checks (.all then .own)                │
│ - Resource-based permissions                    │
└──────┬──────────────────────────────────────────┘
       │
┌──────▼──────────────────────────────────────────┐
│ Layer 3: Input Validation                       │
│ - Zod schemas validate all request bodies       │
│ - Type checking prevents injection              │
│ - Required fields enforced                      │
└──────┬──────────────────────────────────────────┘
       │
┌──────▼──────────────────────────────────────────┐
│ Layer 4: Field Whitelisting                     │
│ - PATCH only allows specific fields             │
│ - Prevents modification of system fields        │
│ - Namespace, owner cannot be changed            │
└──────┬──────────────────────────────────────────┘
       │
┌──────▼──────────────────────────────────────────┐
│ Layer 5: Ownership Verification                 │
│ - For .own permissions, verify owner matches    │
│ - Fetch resource, check annotations             │
│ - Throw NotAllowedError if mismatch             │
└──────┬──────────────────────────────────────────┘
       │
┌──────▼──────────────────────────────────────────┐
│ Layer 6: Kubernetes RBAC                        │
│ - Service account has minimal permissions       │
│ - Only access to specific CRDs and namespaces   │
│ - No cluster-admin privileges                   │
└─────────────────────────────────────────────────┘
```

## References

- [Backend Security](./backend-security.md) - Detailed security tenets and implementation
- [RBAC Permissions](./rbac-permissions.md) - Permission model and role definitions
- [Kuadrant Resources](./kuadrant-resources.md) - CRD schemas and examples
- [Repository Guide](./repository-guide.md) - Monorepo structure, build system, configuration
