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
```bash
yarn test                       # run all tests
yarn test --filter=backend      # run tests for specific package
```

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

## RBAC Permission System

The application uses Casbin-based RBAC with two key configuration files that work together:

### Roles

**API Owner:**
- can create/update/delete API Products
- can approve/reject API key requests
- can view Plan Policies (read-only)

**API Consumer:**
- can view API Products
- can request API keys
- can manage own API keys only

**Platform Engineers:**
- not a role in this plugin - they manage PlanPolicies directly on the cluster
- PlanPolicy create/update/delete operations are not exposed via this plugin
- only read/list permissions for PlanPolicy exist in the plugin

### Configuration Files

**1. `catalog-entities/kuadrant-users.yaml`**
- defines users and groups in the backstage catalog
- sets user identity and group membership via `memberOf` field
- determines which groups a user belongs to

**2. `rbac-policy.csv`**
- defines permissions for roles and groups using casbin policy format
- maps groups → roles → specific permissions
- controls actual access to resources and operations
- referenced in `app-config.local.yaml` at `permission.rbac.policies-csv-file`

### Permission Flow

```
user logs in → auth sets userEntityRef (e.g., user:default/guest)
    ↓
catalog lookup → finds user's memberOf groups from kuadrant-users.yaml
    ↓
rbac-policy.csv → maps groups to roles (e.g., g, group:default/api-owners, role:default/api-owner)
    ↓
rbac-policy.csv → grants permissions to roles (e.g., p, role:default/api-owner, kuadrant.apiproduct.create, create, allow)
    ↓
user gets all permissions from all their group memberships
```

### Testing Different Permission Levels

the guest user (default in development) has full admin access. to test restricted permission levels, use these commands:

```bash
yarn user:consumer      # switch to API Consumer
yarn user:owner         # switch to API Owner
yarn user:default       # restore default permissions
```

after switching roles, restart with `yarn dev`.

alternatively, make the following manual changes:

#### Test as API Consumer (Restricted Access)

**1. edit `catalog-entities/kuadrant-users.yaml`:**
find the guest user entry and change:
```yaml
memberOf: [api-consumers]
```

**2. optionally edit `rbac-policy.csv`:**
find the guest user assignment and change:
```csv
g, user:default/guest, role:default/api-consumer
```
(this is redundant if group membership is set, but keeps direct assignments consistent)

**3. restart the application:**
```bash
yarn dev
```

**4. expected behaviour:**
- ✅ view api products (browse catalog)
- ✅ request api keys for apis
- ✅ view/delete own api keys only
- ✅ see only "API Products" card on /kuadrant page
- ❌ no "Plan Policies" card visible
- ❌ no "Approval Queue" card visible
- ❌ no "Create API Product" button
- ❌ no delete buttons on api products
- ❌ cannot view other users' api keys

#### Test as API Owner (Can Publish APIs)

**1. edit `catalog-entities/kuadrant-users.yaml`:**
find the guest user entry and change:
```yaml
memberOf: [api-owners]
```

**2. optionally edit `rbac-policy.csv`:**
find the guest user assignment and change:
```csv
g, user:default/guest, role:default/api-owner
```

**3. restart the application:**
```bash
yarn dev
```

**4. expected behaviour:**
- ✅ all api-consumer permissions above
- ✅ see "API Products", "Plan Policies", and "Approval Queue" cards
- ✅ "Create API Product" button visible
- ✅ delete buttons on api products
- ✅ create/update/delete api products
- ✅ approve/reject api key requests in approval queue
- ✅ view/delete any api key
- ✅ view plan policies (read-only)
- ❌ cannot create/update/delete plan policies (managed on cluster)

#### Restore Default (All Permissions)

**1. edit `catalog-entities/kuadrant-users.yaml`:**
find the guest user entry and change:
```yaml
memberOf: [api-owners, api-consumers]
```

**2. optionally edit `rbac-policy.csv`:**
find the guest user assignment and change:
```csv
g, user:default/guest, role:default/api-owner
```

**3. restart the application:**
```bash
yarn dev
```

### Note on Configuration Files

**group membership (primary mechanism):**
- `catalog-entities/kuadrant-users.yaml` controls which groups a user belongs to
- this is the primary way to grant permissions
- requires full application restart to take effect

**direct user-to-role assignments (optional):**
- `rbac-policy.csv` line 65 can directly assign guest to a role
- redundant if user is already in a group that maps to that role
- useful for users not in any groups or for specific overrides
- hot-reloads due to `policyFileReload: true` in app-config

**admin/superUsers bypass (avoid for testing):**
- `app-config.local.yaml` defines admin and superUsers in the `permission.rbac` section
- these users bypass all RBAC checks entirely
- do not add guest to these lists when testing permissions

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
      group: 'extensions.kuadrant.io'
      plural: 'apiproducts'
    - apiVersion: 'v1'
      group: 'extensions.kuadrant.io'
      plural: 'apikeyrequests'
```

This allows plugins to work in:
- Production (explicit cluster config with service account token)
- In-cluster (service account mounted at `/var/run/secrets/kubernetes.io/serviceaccount/`)
- Local development (kubeconfig at `~/.kube/config`)

### Kuadrant RBAC Architecture

The Kuadrant plugin uses a two-layer RBAC model with clear separation of concerns:

**Layer 1: Backstage RBAC (Portal Access Control)**
- **Catalog visibility**: Who can see API entities in the catalog
- **Request creation**: Who can request API keys (with per-APIProduct resource-based permissions)
- **Approval**: Who can approve/reject access requests
- **Management**: Who can create/delete APIProducts

**Layer 2: Kuadrant/Gateway RBAC (Runtime Access Control)**
- **API key validation**: Is this key valid? (AuthPolicy)
- **Rate limiting**: What limits apply? (PlanPolicy predicate checks plan-id annotation on Secret)
- **Authentication**: Does request have valid auth? (AuthPolicy validates bearer tokens)

**No overlap** - Backstage controls who gets API keys, Kuadrant/Gateway enforces runtime limits.

**Per-APIProduct Access Control:**

The `kuadrant.apikeyrequest.create` permission supports resource references for fine-grained access control:

```csv
# Allow all consumers to request any API
p, role:default/api-consumer, kuadrant.apikeyrequest.create, create, allow, apiproduct:*/*

# Restrict specific APIs to specific roles
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

**Approval Mode:**

APIProduct supports `approvalMode: automatic | manual` (defaults to manual):
- **automatic**: Backstage immediately creates API key Secret when request is made
- **manual**: API owner must approve request before key is created

This is separate from per-APIProduct access control - approval mode controls workflow, RBAC controls who can even request access.

**Plan Tier Names:**

Plan tier names are **not hardcoded** (gold/silver/bronze) - they are arbitrary strings defined by API owners in the PlanPolicy. The APIProduct CRD syncs plan data (tier names, descriptions, limits) from the PlanPolicy for display in Backstage.

**Why Not Sync PlanPolicy Predicates to Backstage?**

PlanPolicy predicates (CEL expressions) are evaluated by the gateway at runtime, not by Backstage. Backstage should not duplicate Authorino's auth logic. Access control in Backstage is for portal UX (who can see/request APIs), not runtime enforcement (who can call APIs with which rate limits).

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

## archived session context (2025-10-29) - completed

this section has been replaced by the detailed solution documentation in "making kuadrant permissions visible in rbac ui (2025-10-29)" below.

## making kuadrant permissions visible in rbac ui (2025-10-29)

### problem
kuadrant permissions (19 permissions) were defined but not appearing in rbac ui plugin dropdown when creating roles. only "catalog", "scaffolder", and "permission" plugins were visible.

### solution (completed)
implemented two-part solution for rbac permission discovery:

**1. permission integration router**
- created `plugins/kuadrant-backend/src/permissions-router.ts` using `createPermissionIntegrationRouter` from `@backstage/plugin-permission-node`
- registered router in plugin at `plugins/kuadrant-backend/src/plugin.ts`
- exposes permissions at `/.well-known/backstage/permissions/metadata` endpoint
- verified: `curl http://localhost:7007/api/kuadrant/.well-known/backstage/permissions/metadata` returns all 19 permissions

**2. rbac plugin id provider**
- created `plugins/kuadrant-backend/src/rbac-module.ts` as backend module
- registers 'kuadrant' plugin id with rbac using `pluginIdProviderExtensionPoint` from `@backstage-community/plugin-rbac-node`
- added `/rbac` export path in `package.json`
- loaded in backend at `packages/backend/src/index.ts:174`

### key learnings
- rbac discovers plugins through two mechanisms:
  1. permission integration router at `/.well-known/backstage/permissions/metadata` (provides permission definitions)
  2. plugin id provider extension point (tells rbac which plugins have permissions)
- **important**: use `@backstage-community/plugin-rbac-node` for `pluginIdProviderExtensionPoint`, not `@backstage-community/plugin-rbac-backend`
- cannot use `.then()` approach for loading backend modules - must use separate export paths in `package.json`

### files created/modified
- `plugins/kuadrant-backend/src/permissions-router.ts` - permission integration router (new)
- `plugins/kuadrant-backend/src/rbac-module.ts` - rbac plugin id provider (new)
- `plugins/kuadrant-backend/src/plugin.ts` - register permission router
- `plugins/kuadrant-backend/src/index.ts` - export rbac module
- `plugins/kuadrant-backend/package.json` - add `/rbac` export path
- `packages/backend/src/index.ts` - load rbac module

### verification
✅ backend starts without errors
✅ plugin initialization complete with 'kuadrant' listed
✅ permission integration endpoint working: returns all 19 permissions
✅ rbac ui shows "kuadrant" in plugin dropdown
✅ all 19 kuadrant permissions visible when creating roles

### example rbac module pattern
```typescript
import { createBackendModule } from '@backstage/backend-plugin-api';
import { pluginIdProviderExtensionPoint } from '@backstage-community/plugin-rbac-node';

export const kuadrantRbacModule = createBackendModule({
  pluginId: 'permission',
  moduleId: 'kuadrant-rbac-provider',
  register(env) {
    env.registerInit({
      deps: {
        pluginIdProvider: pluginIdProviderExtensionPoint,
      },
      async init({ pluginIdProvider }) {
        pluginIdProvider.addPluginIdProvider({
          getPluginIds: () => ['kuadrant'],
        });
      },
    });
  },
});
```


## permission enforcement (completed)

### implementation summary
all 19 kuadrant permissions now enforced across backend api endpoints in `plugins/kuadrant-backend/src/router.ts`:

**planpolicy endpoints** (2 implemented):
- ✅ `GET /planpolicies` - enforces `kuadrant.planpolicy.list`
- ✅ `GET /planpolicies/:namespace/:name` - enforces `kuadrant.planpolicy.read`
- note: create/update/delete not implemented (platform engineer manages via kubectl)

**apiproduct endpoints** (3 implemented):
- ✅ `GET /apiproducts` - enforces `kuadrant.apiproduct.list`
- ✅ `GET /apiproducts/:namespace/:name` - enforces `kuadrant.apiproduct.read`
- ✅ `POST /apiproducts` - enforces `kuadrant.apiproduct.create` (replaced group-based checks)

**apikeyrequest endpoints** (6 implemented):
- ✅ `POST /requests` - enforces `kuadrant.apikeyrequest.create`
- ✅ `GET /requests` - enforces `kuadrant.apikeyrequest.list`
- ✅ `GET /requests/my` - enforces `kuadrant.apikeyrequest.read.own`
- ✅ `PATCH /requests/:namespace/:name` - enforces `kuadrant.apikeyrequest.update`
- ✅ `POST /requests/:namespace/:name/approve` - enforces `kuadrant.apikeyrequest.update`
- ✅ `POST /requests/:namespace/:name/reject` - enforces `kuadrant.apikeyrequest.update`

**apikey endpoints** (2 implemented):
- ✅ `GET /apikeys` - conditional: `kuadrant.apikey.read.own` if userId param, else `kuadrant.apikey.read.all`
- ✅ `DELETE /apikeys/:namespace/:name` - tries `.delete.all` first, falls back to `.delete.own` with ownership check

### implementation patterns

**standard permission check**:
```typescript
const credentials = await httpAuth.credentials(req);

const decision = await permissions.authorize(
  [{ permission: kuadrantApiProductListPermission }],
  { credentials }
);

if (decision[0].result !== AuthorizeResult.ALLOW) {
  throw new NotAllowedError('unauthorised');
}
```

**conditional permission (own vs all)**:
```typescript
// example: GET /apikeys with optional userId filter
const permission = userId
  ? kuadrantApiKeyReadOwnPermission
  : kuadrantApiKeyReadAllPermission;

const decision = await permissions.authorize([{ permission }], { credentials });
```

**tiered permission check with fallback**:
```typescript
// example: DELETE /apikeys/:name - try delete all, fallback to delete own
const deleteAllDecision = await permissions.authorize(
  [{ permission: kuadrantApiKeyDeleteAllPermission }],
  { credentials }
);

if (deleteAllDecision[0].result !== AuthorizeResult.ALLOW) {
  const deleteOwnDecision = await permissions.authorize(
    [{ permission: kuadrantApiKeyDeleteOwnPermission }],
    { credentials }
  );

  if (deleteOwnDecision[0].result !== AuthorizeResult.ALLOW) {
    throw new NotAllowedError('unauthorised');
  }

  // verify ownership
  if (secretUserId !== userId) {
    throw new NotAllowedError('you can only delete your own api keys');
  }
}
```

### how permissions are made visible in rbac ui

**important**: backstage has a standard mechanism for exposing permissions to rbac ui. do not create custom metadata types.

the correct pattern uses two components:

1. **permission integration router** in `router.ts`:
```typescript
router.use(createPermissionIntegrationRouter({
  permissions: kuadrantPermissions, // array of all permission objects
}));
```
this exposes permissions via the backstage permission framework's standard endpoint.

2. **rbac module** in `rbac-module.ts`:
```typescript
export const kuadrantRbacModule = createBackendModule({
  pluginId: 'permission',
  moduleId: 'kuadrant-rbac-provider',
  register(env) {
    env.registerInit({
      deps: { pluginIdProvider: pluginIdProviderExtensionPoint },
      async init({ pluginIdProvider }) {
        pluginIdProvider.addPluginIdProvider({
          getPluginIds: () => ['kuadrant'], // plugin id for rbac ui dropdown
        });
      },
    });
  },
});
```
this registers the 'kuadrant' plugin id with rbac so it knows to look for permissions from this plugin.

the rbac ui will:
- show "kuadrant" in the plugin dropdown when creating roles
- auto-generate human-readable labels from permission names (e.g., `kuadrant.planpolicy.create` → "Create Plan Policy")
- expose all 19 permissions for role creation

**anti-pattern**: do not create a `PermissionMetadata` type or try to manually provide titles/descriptions. this type doesn't exist in backstage and the ui generates labels automatically from permission names.

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

**CRD field** (`extensions.kuadrant.io_apiproduct.yaml:39-43`):
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

### Overview

The Kuadrant frontend uses Backstage's permission framework for fine-grained access control. All UI actions (create, delete, approve, etc.) check permissions before rendering buttons/forms.

### Custom Permission Hook

**`src/utils/permissions.ts`** provides `useKuadrantPermission` hook that:
- Handles both BasicPermission and ResourcePermission types without type bypasses
- Returns `{ allowed, loading, error }` for proper error handling
- Eliminates `as any` type casting found in raw `usePermission` usage

**Usage**:
```typescript
import { useKuadrantPermission } from '../../utils/permissions';
import { kuadrantApiProductCreatePermission } from '../../permissions';

const { allowed, loading, error } = useKuadrantPermission(
  kuadrantApiProductCreatePermission
);

if (loading) return <Progress />;
if (error) return <ErrorMessage error={error} />;
if (!allowed) return null; // hide button
```

### Permission Error Handling

All components show detailed error messages when permission checks fail:
```typescript
if (permissionError) {
  return (
    <Box p={2}>
      <Typography color="error">
        Unable to check permissions: {permissionError.message}
      </Typography>
      <Typography variant="body2" color="textSecondary">
        Permission: kuadrant.apiproduct.create
      </Typography>
      <Typography variant="body2" color="textSecondary">
        Please try again or contact your administrator
      </Typography>
    </Box>
  );
}
```

This helps users and administrators diagnose permission service failures vs actual permission denial.

### Ownership-Aware Actions

Delete buttons for API keys use ownership checking via `canDeleteResource` helper:
```typescript
import { canDeleteResource } from '../../utils/permissions';

// in render
const canDelete = canDeleteResource(
  row.spec.requestedBy.userId,  // owner
  currentUserId,                 // current user
  canDeleteOwnKey,               // permission to delete own
  canDeleteAllKeys               // permission to delete all
);

if (!canDelete) return null;
```

This prevents showing delete buttons on keys users can't actually delete, avoiding confusing "permission denied" errors.

### ResourcePermission Handling

`kuadrantApiKeyRequestCreatePermission` is a ResourcePermission (scoped to 'apiproduct'). The custom hook handles this automatically:

```typescript
// frontend - no special handling needed
const { allowed } = useKuadrantPermission(kuadrantApiKeyRequestCreatePermission);

// backend - uses resource reference
const decision = await permissions.authorize([{
  permission: kuadrantApiKeyRequestCreatePermission,
  resourceRef: `apiproduct:${namespace}/${name}`,
}], { credentials });
```

### Component Patterns

**1. Page-level access via PermissionGate**:
```typescript
export const KuadrantPage = () => (
  <PermissionGate
    permission={kuadrantApiProductListPermission}
    errorMessage="You don't have permission to view the Kuadrant page"
  >
    <ResourceList />
  </PermissionGate>
);
```

**2. Action button gating**:
```typescript
{canCreateApiProduct && (
  <Button onClick={() => setCreateDialogOpen(true)}>
    Create API Product
  </Button>
)}
```

**3. Conditional table columns**:
```typescript
{
  title: 'Actions',
  render: (row) => {
    if (!canDelete) return null;
    return <IconButton onClick={() => handleDelete(row)} />;
  },
}
```

### Permission Documentation

All permissions in `src/permissions.ts` include JSDoc comments explaining:
- What the permission controls
- When to use it
- Whether it's BasicPermission or ResourcePermission
- The difference between `.own` vs `.all` variants

Example:
```typescript
/**
 * permission to delete API keys owned by the current user
 * allows users to revoke their own access
 */
export const kuadrantApiKeyDeleteOwnPermission = createPermission({
  name: 'kuadrant.apikey.delete.own',
  attributes: { action: 'delete' },
});
```

### Common Patterns

**Loading states**: Include permission loading in component loading logic:
```typescript
const loading = dataLoading || permissionLoading;
if (loading) return <Progress />;
```

**Multiple permissions**: Check all permission errors:
```typescript
const permissionError = createError || deleteError || updateError;
if (permissionError) {
  // show error with failed permission name
}
```

**Empty states**: Hide entire sections when users lack permissions:
```typescript
{canViewApprovalQueue && (
  <Grid item>
    <ApprovalQueueCard />
  </Grid>
)}
```

### Key Files

- `src/utils/permissions.ts` - Custom hook and helper functions
- `src/permissions.ts` - Permission definitions (must match backend)
- `src/components/PermissionGate/PermissionGate.tsx` - Page-level access control
- `src/components/KuadrantPage/KuadrantPage.tsx` - Example of multi-permission component
- `src/components/ApiKeyManagementTab/ApiKeyManagementTab.tsx` - Example of ownership-aware actions

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

