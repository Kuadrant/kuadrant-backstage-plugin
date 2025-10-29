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


## next steps: enforcing kuadrant permissions (pending)

### current state
- ✅ 19 kuadrant permissions defined and documented
- ✅ permissions visible in rbac ui for role creation
- ✅ rbac policies configured in `rbac-policy.csv` for 3 roles (platform-engineer, api-owner, api-consumer)
- ❌ permissions not yet enforced in plugin backend endpoints

### work required
need to add permission checks to kuadrant backend endpoints in `plugins/kuadrant-backend/src/router.ts`:

**planpolicy endpoints** (rate limit tiers):
- `POST /planpolicies` - require `kuadrant.planpolicy.create`
- `GET /planpolicies` - require `kuadrant.planpolicy.list`
- `GET /planpolicies/:name` - require `kuadrant.planpolicy.read`
- `PUT /planpolicies/:name` - require `kuadrant.planpolicy.update`
- `DELETE /planpolicies/:name` - require `kuadrant.planpolicy.delete`

**apiproduct endpoints**:
- `POST /apiproducts` - require `kuadrant.apiproduct.create`
- `GET /apiproducts` - require `kuadrant.apiproduct.list`
- `GET /apiproducts/:name` - require `kuadrant.apiproduct.read`
- `PUT /apiproducts/:name` - require `kuadrant.apiproduct.update`
- `DELETE /apiproducts/:name` - require `kuadrant.apiproduct.delete`

**apikeyrequest endpoints** (access requests):
- `POST /requests` - require `kuadrant.apikeyrequest.create`
- `GET /requests` - require `kuadrant.apikeyrequest.list`
- `GET /requests/:id` - require `kuadrant.apikeyrequest.read.own` or `kuadrant.apikeyrequest.read.all` (conditional)
- `PUT /requests/:id` - require `kuadrant.apikeyrequest.update` (for approve/reject)

**apikey endpoints** (secrets):
- `GET /apikeys` - require `kuadrant.apikey.read.own` or `kuadrant.apikey.read.all` (conditional)
- `DELETE /apikeys/:id` - require `kuadrant.apikey.delete.own` or `kuadrant.apikey.delete.all` (conditional)

### implementation pattern
use backstage permission framework in router:
```typescript
import { AuthorizeResult } from '@backstage/plugin-permission-common';
import { kuadrantPlanPolicyCreatePermission } from './permissions';

router.post('/planpolicies', async (req, res) => {
  const credentials = await httpAuth.credentials(req);
  
  const decision = (await permissions.authorize([
    { permission: kuadrantPlanPolicyCreatePermission },
  ], { credentials }))[0];
  
  if (decision.result !== AuthorizeResult.ALLOW) {
    throw new NotAllowedError('unauthorised');
  }
  
  // proceed with creating planpolicy
});
```

### conditional permissions (own vs all)
for `.own` vs `.all` permissions, need resource ownership checks:
```typescript
// check if user owns the resource
const userInfo = await userInfoService.getUserInfo(credentials);
const userId = userInfo.userEntityRef.split('/')[1];
const isOwner = resource.metadata.annotations?.['secret.kuadrant.io/user-id'] === userId;

// authorize based on ownership
const permission = isOwner 
  ? kuadrantApiKeyReadOwnPermission 
  : kuadrantApiKeyReadAllPermission;
  
const decision = (await permissions.authorize([{ permission }], { credentials }))[0];
```

