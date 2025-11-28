# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

This is a customised fork of [Red Hat Developer Hub (RHDH)](https://github.com/redhat-developer/rhdh) for developing **Kuadrant Backstage plugins**. It's a monorepo containing the full RHDH application with Kuadrant-specific plugins for API access management:
- `plugins/kuadrant` - Frontend plugin for API key management UI
- `plugins/kuadrant-backend` - Backend plugin for Kubernetes integration
- `kuadrant-dev-setup/` - Development environment setup (kind cluster, CRDs, demo resources)

### Kuadrant Plugin Goals

The Kuadrant plugins enable developer portals for API access management using Kuadrant Gateway API primitives:

**For API Consumers:**
- Request API access with tiered plans (bronze, silver, gold)
- View and manage API keys
- Track request status (pending, approved, rejected)

**For Platform Engineers:**
- Approve/reject API access requests
- Manage API products and plan tiers
- Configure rate limits via PlanPolicy

**For API Owners:**
- Create API products with multiple plan tiers
- Define rate limits and quotas
- Sync API products from Kubernetes to Backstage catalog

**Technical Implementation:**
- Kubernetes CRDs: APIProduct, APIKeyRequest, PlanPolicy
- Kuadrant Gateway API integration
- AuthPolicy and RateLimitPolicy support
- Direct Backstage integration (no dynamic plugin complexity for dev)

## Backend Security Principles

**When implementing or modifying permissions, RBAC, or access control, refer to [`docs/rbac-permissions.md`](docs/rbac-permissions.md) for:**
- Complete permission definitions and role capabilities
- Ownership model and enforcement patterns
- Backend tiered permission check patterns
- Frontend permission check examples
- RBAC configuration and testing

All backend code in `plugins/kuadrant-backend/src/router.ts` must follow these security tenets:

### 1. Never Trust Client Input

**Principle:** All data from HTTP requests is untrusted and must be validated before use.

**Implementation:**
- Use Zod schemas to validate all request bodies
- Define explicit whitelists of allowed fields
- Reject requests that don't match the schema

**Example:**
```typescript
// bad - accepts arbitrary client data
const patch = req.body;
await k8sClient.patchCustomResource(..., patch);

// good - validates against whitelist
const patchSchema = z.object({
  spec: z.object({
    displayName: z.string().optional(),
    description: z.string().optional(),
  }).partial(),
});

const parsed = patchSchema.safeParse(req.body);
if (!parsed.success) {
  return res.status(400).json({ error: 'invalid patch: ' + parsed.error.toString() });
}
await k8sClient.patchCustomResource(..., parsed.data);
```

**Why:** Unvalidated input allows attackers to modify fields they shouldn't (privilege escalation, namespace injection, etc.).

### 2. Authentication Required, No Fallbacks

**Principle:** All endpoints must require valid authentication. No guest user fallbacks.

**Implementation:**
- Use `httpAuth.credentials(req)` without `{ allow: ['user', 'none'] }`
- Explicitly check credentials exist before proceeding
- Extract user identity from auth credentials, never from request parameters

**Example:**
```typescript
// bad - allows unauthenticated access
const credentials = await httpAuth.credentials(req, { allow: ['user', 'none'] });
const userId = req.body.userId; // client-controlled!

// good - requires authentication
const credentials = await httpAuth.credentials(req);

if (!credentials || !credentials.principal) {
  throw new NotAllowedError('authentication required');
}

const { userId } = await getUserIdentity(req, httpAuth, userInfo);
```

**Why:** Guest fallbacks and client-supplied identity allow user impersonation and privilege escalation.

### 3. Pure RBAC Permission Model

**Principle:** Authorization decisions must only use Backstage RBAC permissions, not group membership checks.

**See [`docs/rbac-permissions.md`](docs/rbac-permissions.md) for complete permission definitions and enforcement patterns.**

**Implementation:**
- Check permissions using `permissions.authorize()`
- Use specific permission objects (create, read, update, delete, etc.)
- Support both `.own` and `.all` permission variants where appropriate
- Never bypass RBAC with group-based role flags

**Example:**
```typescript
// bad - dual authorization paths
const { isApiOwner } = await getUserIdentity(...);
if (!isApiOwner) {
  throw new NotAllowedError('must be api owner');
}

// good - pure RBAC
const decision = await permissions.authorize(
  [{ permission: kuadrantApiProductUpdatePermission }],
  { credentials }
);

if (decision[0].result !== AuthorizeResult.ALLOW) {
  throw new NotAllowedError('unauthorised');
}
```

**Why:** Mixed authorization models create bypass opportunities and make security audits difficult.

### 4. Validate Field Mutability

**Principle:** Distinguish between mutable and immutable fields. Prevent modification of critical resource identifiers.

**Implementation:**
- In PATCH endpoints, only allow updating safe metadata fields
- Exclude from validation schemas:
  - `namespace`, `name` (Kubernetes identifiers)
  - `targetRef` (infrastructure references)
  - `userId`, `requestedBy` (ownership)
  - Fields managed by controllers (e.g., `plans` in APIProduct)

**Example:**
```typescript
// patch schema excludes immutable fields
const patchSchema = z.object({
  spec: z.object({
    displayName: z.string().optional(),
    description: z.string().optional(),
    // targetRef NOT included - immutable
    // plans NOT included - managed by controller
  }).partial(),
});
```

**Why:** Allowing modification of references can break infrastructure relationships or grant unauthorised access.

### 5. Ownership Validation for User Resources

**Principle:** When users manage their own resources (API keys, requests), verify ownership before allowing modifications.

**See [`docs/rbac-permissions.md`](docs/rbac-permissions.md) for detailed ownership model and tiered permission check patterns.**

**Implementation:**
- Check `.all` permission first (admin/owner access)
- If not allowed, check `.own` permission
- Fetch existing resource and verify `requestedBy.userId` matches current user
- Throw `NotAllowedError` if ownership check fails

**Example:**
```typescript
const updateAllDecision = await permissions.authorize(
  [{ permission: kuadrantApiKeyRequestUpdatePermission }],
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

  const existing = await k8sClient.getCustomResource(...);
  if (existing.spec?.requestedBy?.userId !== userId) {
    throw new NotAllowedError('you can only update your own requests');
  }
}
```

**Why:** Prevents users from modifying other users' resources even if they have the base permission.

### 6. Follow Namespace Organisation Pattern

**Principle:** Respect Kuadrant's namespace architecture where all API resources live in the same namespace.

**See "Kuadrant Resource Namespace Organisation" section below for detailed architecture.**

**Implementation:**
- Never accept `namespace` from client input for resource creation
- Use the namespace of the referenced resource (APIProduct, HTTPRoute)
- Create APIKeyRequests in the API's namespace (spec.apiNamespace)
- Create Secrets in the API's namespace (not user namespace)

**Example:**
```typescript
// bad - client controls namespace
const { namespace, apiName } = req.body;
await k8sClient.createCustomResource('apikeyrequests', namespace, ...);

// good - use API's namespace
const { apiName, apiNamespace } = req.body;
await k8sClient.createCustomResource('apikeyrequests', apiNamespace, ...);
```

**Why:** Cross-namespace creation can bypass RBAC, pollute namespaces, or break AuthPolicy references.

### 7. Explicit Error Responses

**Principle:** Return appropriate HTTP status codes and clear error messages.

**Implementation:**
- 400 for validation errors (`InputError`)
- 403 for permission denied (`NotAllowedError`)
- 500 for unexpected errors
- Include error details in response body
- Log errors server-side for debugging

**Example:**
```typescript
try {
  // endpoint logic
} catch (error) {
  console.error('error updating resource:', error);

  if (error instanceof NotAllowedError) {
    res.status(403).json({ error: error.message });
  } else if (error instanceof InputError) {
    res.status(400).json({ error: error.message });
  } else {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'internal error'
    });
  }
}
```

**Why:** Clear errors help legitimate users debug issues while avoiding information disclosure to attackers.

### Reference Examples in Codebase

**Good patterns to follow:**
- `router.patch('/requests/:namespace/:name', ...)` (line ~1135) - Whitelist validation, ownership checks
- `router.post('/requests/:namespace/:name/approve', ...)` (line ~620) - Zod validation, proper auth
- `router.patch('/apiproducts/:namespace/:name', ...)` (line ~306) - Comprehensive field whitelist

**Anti-patterns fixed in security audit:**
- ❌ Accepting userId from request body (privilege escalation)
- ❌ Guest user fallbacks (authentication bypass)
- ❌ Group-based authorization alongside RBAC (dual auth paths)
- ❌ Unvalidated PATCH bodies (field manipulation)
- ❌ Client-controlled namespace (namespace injection)

## Prerequisites

**Node.js version:** 22.20.0 (specified in `.nvmrc`)

If using nvm and Homebrew Node together, ensure nvm's Node takes precedence:
```bash
nvm use                         # use version from .nvmrc
node --version                  # verify you're on v22.20.0, not v24+
```

If `node --version` shows the wrong version, Homebrew's Node may be taking precedence. Either open a new terminal (so nvm loads properly) or temporarily unlink Homebrew's Node: `brew unlink node`

## Essential Commands

### Development
```bash
yarn install                    # install dependencies
yarn dev                        # start frontend (webpack, hot reload) + backend
yarn start                      # start backend only (serves frontend as static assets)
yarn build                      # build all packages
yarn tsc                        # run typescript compilation
```

### Kuadrant Development Setup
```bash
cd kuadrant-dev-setup
make kind-create                # create kind cluster with kuadrant + demo
cd ..
yarn dev                        # start rhdh with hot reload

# cleanup
cd kuadrant-dev-setup
make kind-delete                # delete cluster
```

The kind cluster includes:
- Kuadrant operator v1.3.0
- Gateway API CRDs
- Istio service mesh
- Custom CRDs (APIProduct, APIKeyRequest)
- Toystore demo (example API with policies)
- RHDH service account with proper RBAC

### Testing

**Unit Tests:**
```bash
yarn test                       # run all tests
yarn test --filter=backend      # run tests for specific package
```

**E2E Tests:**

End-to-end tests use Playwright to test the Kuadrant plugin UI and workflows.

Prerequisites:
1. Kind cluster running with Kuadrant (`cd kuadrant-dev-setup && make kind-create`)
2. App running (`yarn dev` in separate terminal)

Run tests:
```bash
cd e2e-tests
yarn test                       # run kuadrant e2e tests
yarn test:smoke                 # run smoke tests only
```

Tests available:
- `kuadrant-plugin.spec.ts` - basic navigation and rendering tests
- `kuadrant-rbac.spec.ts` - comprehensive RBAC permission tests covering all personas

The E2E tests verify:
- UI navigation and page rendering
- RBAC permissions for all 4 personas (Platform Engineer, API Admin, API Owner, API Consumer)
- Create/read/update/delete operations
- Approval workflows
- Ownership enforcement

### Linting and Formatting
```bash
yarn lint:check                 # check for linting errors
yarn lint:fix                   # fix linting errors
yarn prettier:check             # check formatting
yarn prettier:fix               # fix formatting
```

### Dynamic Plugins
```bash
# from repository root
yarn export-dynamic -- -- --dev # export all dynamic plugins for local dev

# from specific wrapper in dynamic-plugins/wrappers/
yarn export-dynamic             # export single dynamic plugin
```

### E2E Tests
```bash
cd e2e-tests
yarn showcase                   # run showcase tests
yarn showcase-rbac              # run showcase tests with RBAC
yarn showcase-k8s-ci-nightly    # run kubernetes tests
yarn showcase-auth-providers    # run authentication provider tests
```

## Architecture

### Monorepo Structure

**packages/** - Core application packages
- `app` - Frontend application (React, using Backstage framework)
- `app-next` - Next-generation frontend (experimental)
- `backend` - Backend application (Node.js, Backstage backend)
- `plugin-utils` - Shared utilities for plugins
- `theme-wrapper` - Theme customisation

**plugins/** - Custom plugins
- `kuadrant` - Frontend plugin for Kuadrant API key management UI
- `kuadrant-backend` - Backend plugin for Kuadrant Kubernetes integration
- `dynamic-plugins-info-backend` - Provides information about loaded dynamic plugins
- `licensed-users-info-backend` - Tracks licensed user information
- `scalprum-backend` - Frontend federation support for dynamic plugins

**dynamic-plugins/wrappers/** - Third-party plugins wrapped for dynamic loading
- Contains 80+ wrapped Backstage community plugins
- Each wrapper adds dynamic plugin support to upstream plugins

**e2e-tests/** - End-to-end testing (Playwright + TypeScript)
- Tests organised by feature area (plugins, auth, configuration, etc.)
- Multiple test projects for different deployment scenarios (showcase, showcase-rbac, showcase-k8s, etc.)

**catalog-entities/marketplace/** - RHDH Extensions Catalog
- `packages/` - Package metadata (OCI URLs, versions)
- `plugins/` - Plugin metadata (descriptions, categories, support levels)

### Dynamic Plugin System

RHDH supports dynamic plugins that can be installed without rebuilding the application. The system uses Backstage's backend plugin manager to scan `dynamic-plugins-root/` for plugin packages and load them at runtime.

**Key concepts:**
- Derived packages: Special JavaScript packages exported from original plugin source
- Frontend plugins require wiring configuration (mount points, routes) in app-config
- Backend plugins are auto-discovered and loaded
- Configuration via `dynamic-plugins.default.yaml` or Helm values

### Configuration Files

**Local development:**
- `app-config.yaml` - Base configuration
- `app-config.local.yaml` - Local overrides with RBAC enabled (checked in for team convenience)
- `app-config.dynamic-plugins.yaml` - Dynamic plugin configuration

### Build System

Uses Turborepo for monorepo orchestration and Yarn 3 workspaces for package management. Build configuration in `turbo.json`.

## Testing Infrastructure

### Test Projects

Every test file must have a component annotation in `test.beforeAll`:
```typescript
test.beforeAll(async ({ }, testInfo) => {
  testInfo.annotations.push({
    type: "component",
    description: "your_component_name",
  });
});
```

Common component values: `authentication`, `rbac`, `plugins`, `configuration`, `audit-log`, `core`, `navigation`, `api`, `integration`

## RBAC and Permissions

**See [`docs/rbac-permissions.md`](docs/rbac-permissions.md) for complete RBAC and permissions documentation.**

When implementing or modifying anything related to permissions, roles, or access control, consult the comprehensive guide which covers:
- All permission definitions (PlanPolicy, APIProduct, APIKeyRequest, API Key)
- Role definitions (API Consumer, API Owner, API Admin)
- Ownership model and enforcement patterns
- Backend security patterns and tiered permission checks
- Frontend permission checks and UI patterns
- RBAC configuration files and testing

### Quick Reference

**Testing Different Roles:**
```bash
yarn user:consumer      # switch to API Consumer
yarn user:owner         # switch to API Owner
yarn user:default       # restore default permissions
```

After switching roles, restart with `yarn dev`.

## Recent Architectural Changes

### HTTPRoute-First APIProduct Model (IMPLEMENTED)

**Previous implementation:**
- API Owner created APIProduct in Backstage form
- APIProduct referenced PlanPolicy directly via `spec.planPolicyRef`
- No HTTPRoute reference in APIProduct
- Plans were populated by controller reading from PlanPolicy

**Current implementation:**
- Platform Engineers set up infrastructure on-cluster **first**:
  1. Create PlanPolicy with rate limit tiers
  2. Apply PlanPolicy to HTTPRoute via `targetRef`
  3. Annotate HTTPRoute to expose in Backstage (`backstage.io/expose: "true"`)
- API Owner workflow in Backstage:
  1. Browse list of available HTTPRoutes (filtered by annotation)
  2. Select existing HTTPRoute to publish
  3. Add catalog metadata (display name, description, docs, tags)
  4. APIProduct is created with `spec.targetRef` pointing to HTTPRoute
- Plans are included in APIProduct spec (will be discovered by controller in future)
- APIProduct is a catalog/metadata layer, not defining infrastructure relationships

**Benefits:**
- Backstage remains read-only for infrastructure resources (HTTPRoute, PlanPolicy)
- PlanPolicy configuration happens on-cluster where it belongs (via kubectl/GitOps)
- Clear separation: Platform Engineers configure infrastructure, API Owners publish to catalog
- Multiple APIProducts can reference the same HTTPRoute
- Aligns with spec requirement: plans are "offered" on APIs, not assigned through portal

**Changes made:**
1. Updated APIProduct CRD to have `spec.targetRef` (HTTPRoute reference) instead of `spec.planPolicyRef`
2. Updated CreateAPIProductDialog to list/select HTTPRoutes instead of PlanPolicies
3. Added backend endpoint `/httproutes` to list HTTPRoutes
4. Updated backend validation to check `targetRef` instead of `planPolicyRef`
5. HTTPRoutes must have `backstage.io/expose: "true"` annotation to appear in selection

### APIKeyRequest Scoping to APIProduct (IMPLEMENTED)

**Problem:**
- APIKeyRequest `spec.apiName` previously referenced HTTPRoute name
- Multiple APIProducts referencing same HTTPRoute would share API key requests
- No isolation between different products exposing the same route

**Solution:**
- Changed `spec.apiName` to reference the **APIProduct name** instead of HTTPRoute name
- Each APIProduct now has its own isolated set of API key requests
- Multiple APIProducts can safely reference the same HTTPRoute with separate keys/requests

**Changes made:**
1. Updated ApiKeyManagementTab to use `entity.metadata.annotations['kuadrant.io/apiproduct']`
2. Frontend now passes APIProduct name in `apiName` field when creating requests
3. Backend already used `apiName` from request body, no changes needed
4. Updated APIKeyRequest CRD descriptions to clarify `apiName` is APIProduct name

**Benefits:**
- Multiple APIProducts can share HTTPRoute infrastructure
- Each product has separate approval workflow, keys, and request tracking
- API keys are scoped to the product abstraction, not infrastructure
- Allows different products with different plans on same HTTPRoute

### Immediate Catalog Sync for APIProducts (IMPLEMENTED)

**Previous behaviour:**
- APIProductEntityProvider synced catalog every 30 seconds via periodic `setInterval`
- After creating/deleting an APIProduct, users had to wait up to 30 seconds to see changes in catalog
- No event-driven updates on CRUD operations

**Current implementation:**
- Provider instance is shared between module and router via singleton pattern
- `refresh()` method is public and callable from router endpoints
- After successful APIProduct create/delete operations, router immediately calls `provider.refresh()`
- Catalog updates appear instantly without waiting for next scheduled sync

**Changes made:**
1. Made `APIProductEntityProvider.refresh()` method public (was private)
2. Added singleton pattern in `module.ts` to export provider instance
3. Added `getAPIProductEntityProvider()` function to retrieve instance
4. Updated router to import provider getter and call `refresh()` after:
   - POST `/apiproducts` (after successful create)
   - DELETE `/apiproducts/:namespace/:name` (after successful delete)

**Benefits:**
- Improved developer experience with immediate feedback
- Reduced wait time from up to 30 seconds to instant
- Maintains periodic sync as backup for external changes
- No breaking changes to existing functionality

### PublishStatus for APIProducts (IMPLEMENTED)

**Context:**
- APIProducts need Draft/Published workflow
- Only Published APIProducts should appear in Backstage catalog
- Draft APIProducts are hidden until ready for consumption

**Implementation:**
- APIProduct CRD has `spec.publishStatus` field with enum values: `Draft`, `Published`
- Default value is `Draft` (hidden from catalog)
- Entity provider filters APIProducts, only syncing those with `publishStatus: Published`
- CreateAPIProductDialog includes dropdown to select publish status (defaults to `Published`)

**Changes made:**
1. CRD already included `publishStatus` field with enum validation
2. Entity provider filters out Draft APIProducts during sync
3. Added publishStatus dropdown to CreateAPIProductDialog
4. Updated demo resources to set `publishStatus: Published` by default

**Benefits:**
- API Owners can create draft APIProducts without exposing them to consumers
- Clear workflow: draft → published
- No accidental exposure of incomplete API products
- Aligns with typical content publishing workflows

### Plan Population from PlanPolicy (TEMPORARY WORKAROUND)

**Context:**
- APIProduct spec includes plans array that should be discovered from PlanPolicy
- Full controller implementation not yet available
- Without plans, API Keys tab shows "no plans available" error

**Temporary implementation:**
- Backend populates `spec.plans` during APIProduct creation
- Finds PlanPolicy targeting the same HTTPRoute as the APIProduct
- Copies plans array (tier, description, limits) from PlanPolicy to APIProduct
- Non-blocking: continues without plans if PlanPolicy lookup fails

**Changes made:**
1. Added PlanPolicy lookup in POST `/apiproducts` endpoint
2. Searches for PlanPolicy with matching `targetRef` (HTTPRoute)
3. Copies plans from PlanPolicy into APIProduct before creating resource
4. Wrapped in try-catch to avoid breaking creation if PlanPolicy missing

**Limitations:**
- Only populates plans at creation time (not updated if PlanPolicy changes)
- Does not write to status (writes to spec instead, which is acceptable until controller exists)
- Will be replaced by proper controller that maintains discoveredPlans in status

**Benefits:**
- Makes API Keys tab functional immediately
- Allows developers to request API access with plan selection
- Provides realistic testing environment for approval workflows
- No changes needed when controller is implemented (controller will override spec with status)

## Important Notes

### System Dependencies

**macOS users:** Must use GNU `grep` and GNU `sed` instead of BSD versions:
```bash
brew install grep gnu-sed
```
Set GNU versions as default to avoid script compatibility issues.

### Running Locally with Dynamic Plugins

The repository includes a pre-configured `app-config.local.yaml` with RBAC enabled and proper dev server ports.

1. Run `yarn install`
2. (Optional) Run `yarn export-dynamic -- -- --dev` to export dynamic plugins to `dynamic-plugins-root/`
3. Start with `yarn dev` (frontend + backend with hot reload) or `yarn start` (backend only)

**Note:** `yarn dev` doesn't load dynamic plugins but provides hot reload for Kuadrant plugin development. Use `yarn start` if you need dynamic plugins loaded.

### Extensions Catalog Workflow

When adding plugins to marketplace:
1. Generate package metadata: `npx @red-hat-developer-hub/marketplace-cli generate`
2. Create plugin YAML in `catalog-entities/marketplace/plugins/`
3. Add entries to `all.yaml` files in **alphabetical order**
4. Validate with `yq` (Go version) and `ajv-cli`

### Telemetry

Telemetry is enabled by default via `analytics-provider-segment` plugin. Disable in local dev by setting `SEGMENT_TEST_MODE=true` or disabling the plugin in dynamic plugins config.

### Kubernetes Configuration Pattern

Backend plugins that need Kubernetes access should follow the standard RHDH pattern:

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

**Example configuration:**
```yaml
kubernetes:
  clusterLocatorMethods:
    - clusters:
      - authProvider: serviceAccount
        name: my-cluster
        serviceAccountToken: ${K8S_CLUSTER_TOKEN}
        url: https://kubernetes.default.svc
        skipTLSVerify: true
      type: config
  customResources:
    - apiVersion: 'v1'
      group: 'devportal.kuadrant.io'
      plural: 'apiproducts'
    - apiVersion: 'v1'
      group: 'devportal.kuadrant.io'
      plural: 'apikeyrequests'
```

This allows plugins to work in:
- Production (explicit cluster config with service account token)
- In-cluster (service account mounted at `/var/run/secrets/kubernetes.io/serviceaccount/`)
- Local development (kubeconfig at `~/.kube/config`)

### Kuadrant RBAC Architecture

**See [`docs/rbac-permissions.md`](docs/rbac-permissions.md) for complete RBAC documentation including:**
- Two-layer RBAC model (Backstage Portal vs Kuadrant/Gateway Runtime)
- Per-APIProduct access control with resource references
- Approval mode (automatic vs manual)
- All permission definitions and role capabilities

The Kuadrant plugin uses a two-layer RBAC model:
- **Layer 1 (Backstage)**: Portal access control - who can see/request/approve APIs
- **Layer 2 (Kuadrant/Gateway)**: Runtime access control - API key validation and rate limiting

Key security principles:
- Ownership is immutable (set on creation, cannot be modified)
- All endpoints use tiered permission checks (`.all` → `.own` → ownership verification)
- Input validation with explicit whitelists
- No authentication bypasses

### Backstage Table detailPanel with Interactive Content

When using the Backstage `Table` component's `detailPanel` feature with interactive elements (tabs, buttons, etc.), there's a critical pattern to avoid re-render issues:

**Problem**: If the detail panel content uses parent component state, changing that state causes the entire parent to re-render, which makes the Material Table lose its internal expansion state and collapse the row.

**Solution**: Create a separate component for the detail panel content with its own isolated local state:

```typescript
// In parent component - keep detailPanel config simple and stable
const detailPanelConfig = useMemo(() => [
  {
    render: (data: any) => {
      const item = data.rowData;
      if (!item) return <Box />;
      return <DetailPanelContent item={item} />;
    },
  },
], [/* minimal dependencies */]);

// Separate component with isolated state
const DetailPanelContent = ({ item }) => {
  const [localState, setLocalState] = useState(initialValue);

  return (
    <Box onClick={(e) => e.stopPropagation()}>
      {/* Interactive content like Tabs, buttons, etc. */}
      <Tabs value={localState} onChange={(e, val) => {
        e.stopPropagation();
        setLocalState(val);
      }}>
        {/* ... */}
      </Tabs>
    </Box>
  );
};
```

**Key principles:**
1. Each detail panel instance gets its own component with isolated state
2. Changing state in one detail panel doesn't trigger parent re-renders
3. Add `onClick={(e) => e.stopPropagation()}` to prevent clicks from bubbling to table row
4. Add `e.stopPropagation()` to interactive element handlers (onChange, onClick, etc.)
5. Keep `detailPanelConfig` in `useMemo` with minimal dependencies

**Example**: API key management tab shows expandable rows with code examples in multiple languages (cURL, Node.js, Python, Go). Each row has language tabs that can be switched without collapsing the expansion.

### Adding Custom Plugins

To add custom plugins to the monorepo for local development:

1. Copy plugin directories to `plugins/` folder
2. Run `yarn install` to link them via workspace
3. Add backend plugins to `packages/backend/src/index.ts`:
```typescript
backend.add(import('@internal/plugin-your-backend'));
backend.add(import('@internal/plugin-your-backend/alpha'));
```

4. Add frontend plugin to `packages/app/package.json`:
```json
{
  "dependencies": {
    "@internal/plugin-your-plugin": "0.1.0"
  }
}
```

5. Import and use directly in app components (see Plugin Integration below)

Hot reloading works automatically with `yarn dev`.

### Plugin Integration Patterns

For local development, direct imports work better than Scalprum dynamic loading:

**Adding a plugin page:**
1. Import and add route in `packages/app/src/components/AppBase/AppBase.tsx`:
```typescript
import { YourPluginPage } from '@internal/plugin-your-plugin';

<Route path="/your-plugin" element={<YourPluginPage />} />
```

2. Add menu item in `packages/app/src/consts.ts`:
```typescript
'default.your-plugin': {
  title: 'Your Plugin',
  icon: 'extension',
  to: 'your-plugin',
  priority: 55,
}
```

**Adding entity page components:**
1. Add imports to `packages/app/src/components/catalog/EntityPage/defaultTabs.tsx`:
```typescript
import {
  EntityYourContent,
} from '@internal/plugin-your-plugin';
```

2. Define tab in `defaultTabs` object:
```typescript
'/your-tab': {
  title: 'Your Tab',
  mountPoint: 'entity.page.your-tab',
}
```

3. Add visibility rule in `tabRules` object:
```typescript
'/your-tab': {
  if: isKind('api'),
}
```

4. Add content in `tabChildren` object:
```typescript
'/your-tab': {
  children: <EntityYourContent />,
}
```

**Adding entity overview cards:**
Add to `packages/app/src/components/catalog/EntityPage/OverviewTabContent.tsx` within the appropriate `EntitySwitch.Case`:
```typescript
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
  <EntityYourCard />
</Grid>
```

**Grid layout for entity page tabs:**
Entity pages use CSS Grid layout. Content in tabs must be wrapped in Grid components with explicit grid column settings:

```typescript
// full-width content (recommended for most tabs)
'/your-tab': {
  children: (
    <Grid item sx={{ gridColumn: '1 / -1' }}>
      <YourContent />
    </Grid>
  ),
}

// half-width content
'/your-tab': {
  children: (
    <>
      <Grid item sx={{ gridColumn: { lg: '1 / span 6', xs: '1 / -1' } }}>
        <LeftContent />
      </Grid>
      <Grid item sx={{ gridColumn: { lg: '7 / span 6', xs: '1 / -1' } }}>
        <RightContent />
      </Grid>
    </>
  ),
}
```

Without explicit grid column settings, content receives default grid sizing which may appear half-width.

### Local Development Authentication

For local development with `yarn dev`, enable guest authentication in `app-config.local.yaml`:
```yaml
auth:
  environment: development
  providers:
    guest:
      dangerouslyAllowOutsideDevelopment: true
```

### Home Page Route

For local development with `yarn dev`, dynamic plugins don't load, so the dynamic home page plugin (`red-hat-developer-hub.backstage-plugin-dynamic-home-page`) won't provide the "/" route, causing a 404 on the home page.

Add a redirect in `packages/app/src/components/AppBase/AppBase.tsx`:

```typescript
import { Navigate, Route } from 'react-router-dom';

// in FlatRoutes:
<Route path="/" element={<Navigate to="catalog" />} />
```

This redirects the root path to the catalog page in dev mode, preventing 404 errors.

**Note:** The actual dynamic home page (with SearchBar, QuickAccessCard, CatalogStarredEntitiesCard, etc.) configured in `app-config.dynamic-plugins.yaml` will work correctly in production with `yarn start` or when deployed. The redirect is only needed for `yarn dev` which provides hot reload but doesn't load dynamic plugins.

### Common Pitfalls

**Backend API calls in frontend components:**
Always use absolute backend URLs, not relative paths. Relative paths go to the webpack dev server (port 3000) instead of the backend (port 7007).

```typescript
// incorrect (goes to webpack dev server)
const response = await fetchApi.fetch('/api/your-endpoint');

// correct (goes to backend)
const config = useApi(configApiRef);
const backendUrl = config.getString('backend.baseUrl');
const response = await fetchApi.fetch(`${backendUrl}/api/your-endpoint`);
```

**Menu items showing translation keys:**
If menu items show `menuItem.key-name` instead of the actual title, remove the `titleKey` property and only use `title`:
```typescript
// incorrect
'default.your-plugin': {
  title: 'Your Plugin',
  titleKey: 'menuItem.yourPlugin',  // remove this
  icon: 'extension',
  to: 'your-plugin',
}

// correct
'default.your-plugin': {
  title: 'Your Plugin',
  icon: 'extension',
  to: 'your-plugin',
}
```

## Kuadrant Resource Namespace Organisation

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

**Frontend validation** (`CreateAPIProductDialog.tsx:50-52, 77-80`):
- PlanPolicy dropdown filtered to only show policies in the same namespace as the APIProduct being created
- Validation error thrown if cross-namespace PlanPolicy selected

**Backend Secret creation** (`router.ts:532, 547, 752`):
- Secrets always created in `apiNamespace` (not request namespace)
- Ensures Secrets live where AuthPolicy can access them

**Example error**:
```
PlanPolicy must be in the same namespace as the APIProduct (default).
Selected PlanPolicy is in toystore.
```

## Automatic vs Manual Approval Modes

APIProducts support two approval modes for API key requests:

### Approval Modes

1. **Manual** (default): Requests require explicit approval by API owner
2. **Automatic**: Requests immediately create API keys without review

### Implementation

**CRD field** (`devportal.kuadrant.io_apiproduct.yaml:39-43`):
```yaml
approvalMode:
  type: string
  enum: [automatic, manual]
  default: manual
  description: Whether access requests are auto-approved or require manual review
```

**Frontend** (`CreateAPIProductDialog.tsx:35, 202-214`):
- Dropdown selector in create form
- Defaults to manual
- Includes helper text explaining behaviour

**Backend logic** (`router.ts:509-581`):
When APIKeyRequest is created (POST /requests):
1. Create APIKeyRequest resource in Kubernetes
2. Fetch associated APIProduct
3. If `apiProduct.spec.approvalMode === 'automatic'`:
   - Immediately generate API key
   - Create Secret in API namespace
   - Update APIKeyRequest status to 'Approved' with `reviewedBy: 'system'`
4. If manual, request stays in 'Pending' state

### User Experience

**Manual mode** (toystore demo):
- User requests API access → status: Pending
- API Owner reviews → clicks approve → status: Approved
- User sees API key

**Automatic mode**:
- User requests API access → immediately approved
- User sees API key instantly
- No approval queue needed

## Frontend Permission System (2025-11-05)

**See [`docs/rbac-permissions.md`](docs/rbac-permissions.md) for complete frontend permission documentation including:**
- Custom `useKuadrantPermission` hook usage
- Permission error handling patterns
- Ownership-aware action patterns
- Component patterns (PermissionGate, button gating, conditional columns)
- Loading states and empty states
- Key frontend files and examples

The Kuadrant frontend uses Backstage's permission framework for fine-grained access control. All UI actions check permissions before rendering buttons/forms.

## API Key Management Model

APIKeyRequests are the source of truth for API keys, not Kubernetes Secrets.

### Resource Relationship

```
APIKeyRequest (CRD)          Secret (Kubernetes)
├── metadata.name            Created when approved
├── spec.planTier            annotations:
├── spec.apiName               - secret.kuadrant.io/plan-id
├── spec.requestedBy.userId    - secret.kuadrant.io/user-id
└── status.apiKey            labels:
                               - app: <apiName>
```

### UI Behaviour

**What users see**:
- Pending Requests - awaiting approval
- Rejected Requests - denied access
- API Keys - approved requests showing the key from APIKeyRequest.status.apiKey

**What users don't see**:
- Kubernetes Secrets directly
- Secret names or metadata

### Deletion Flow

When user deletes an approved API key (`router.ts:905-930`):
1. Backend finds matching Secret by annotations:
   - `secret.kuadrant.io/user-id` === requestUserId
   - `secret.kuadrant.io/plan-id` === planTier
   - `app` label === apiName
2. Deletes Secret from API namespace
3. Deletes APIKeyRequest resource
4. Both disappear from Kubernetes

### Why Secrets Aren't Listed

**Problem**: Previously showed two sections:
- "Approved Requests" (from APIKeyRequests)
- "API Keys (from Secrets)" (from Kubernetes Secrets)

Deleting a Secret left the APIKeyRequest, showing duplicate/stale data.

**Solution**:
- UI only shows APIKeyRequests (single source of truth)
- Secrets are implementation details managed by backend
- Delete button on approved requests triggers both deletions

**Removed code**:
- `GET /apikeys` endpoint (no longer called)
- Secret fetching in `ApiKeyManagementTab.tsx`
- "API Keys (from Secrets)" table component

## Delete Confirmation Patterns

All delete operations should use proper Material-UI dialogs instead of browser `window.confirm()` or `alert()`. The pattern varies based on severity.

### ConfirmDeleteDialog Component

Reusable component at `plugins/kuadrant/src/components/ConfirmDeleteDialog/ConfirmDeleteDialog.tsx`:

```typescript
interface ConfirmDeleteDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmText?: string;  // for high-severity, require typing this to confirm
  severity?: 'normal' | 'high';  // high shows warning icon + text confirmation
  deleting?: boolean;  // shows spinner on button
  onConfirm: () => void;
  onCancel: () => void;
}
```

### Severity Levels

**Normal severity** (API key requests, pending requests):
- Simple confirmation dialog with description
- Cancel and Delete buttons
- No text confirmation required

**High severity** (API Products, infrastructure resources):
- Warning icon in title
- Detailed description explaining consequences
- Text confirmation required (user must type resource name)
- Delete button disabled until text matches

### Usage Examples

**Normal severity** (MyApiKeysCard, ApiKeyManagementTab):
```typescript
<ConfirmDeleteDialog
  open={deleteDialogState.open}
  title="Delete API Key Request"
  description={`Are you sure you want to delete the API key request for ${request?.spec.apiName}?`}
  deleting={deleting !== null}
  onConfirm={handleDeleteConfirm}
  onCancel={handleDeleteCancel}
/>
```

**High severity** (KuadrantPage - API Products):
```typescript
<ConfirmDeleteDialog
  open={deleteDialogOpen}
  title="Delete API Product"
  description={`This will permanently delete "${name}" from namespace "${namespace}" and remove it from Kubernetes. Any associated API keys will stop working.`}
  confirmText={name}
  severity="high"
  deleting={deleting}
  onConfirm={handleDeleteConfirm}
  onCancel={handleDeleteCancel}
/>
```

### State Pattern

Each component with delete functionality uses this state pattern:

```typescript
const [deleteDialogState, setDeleteDialogState] = useState<{
  open: boolean;
  request: SomeType | null;
}>({ open: false, request: null });

const handleDeleteClick = () => {
  setDeleteDialogState({ open: true, request: itemToDelete });
};

const handleDeleteConfirm = async () => {
  if (!deleteDialogState.request) return;
  // perform delete
  setDeleteDialogState({ open: false, request: null });
};

const handleDeleteCancel = () => {
  setDeleteDialogState({ open: false, request: null });
};
```

### Files Using ConfirmDeleteDialog

- `MyApiKeysCard.tsx` - normal severity for API key requests
- `ApiKeyManagementTab.tsx` - normal severity for requests/keys
- `KuadrantPage.tsx` - high severity for API Products

