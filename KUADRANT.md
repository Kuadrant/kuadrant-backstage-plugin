# Kuadrant Plugin Development

This repository is a customised fork of [Red Hat Developer Hub (RHDH)](https://github.com/redhat-developer/rhdh) for developing Kuadrant Backstage plugins.

## Branching Strategy

- **`main`** - Our development branch with Kuadrant plugins and customisations
- **`rhdh-upstream-main`** - Tracking branch for upstream RHDH main (reference only, do not commit here)
- **`pre-migration-backup`** - Snapshot of old plugin structure before migration (backup only)

### Repository Remotes

This repository tracks three remotes:

- **`origin`** - Your fork (e.g., jasonmadigan/kuadrant-backstage-plugin)
- **`upstream`** - Kuadrant organisation repo (Kuadrant/kuadrant-backstage-plugin)
- **`rhdh-upstream`** - Red Hat Developer Hub upstream (redhat-developer/rhdh)

### Pulling RHDH Updates

To pull the latest changes from upstream RHDH and rebase our Kuadrant customisations:

```bash
# fetch latest from rhdh upstream
git fetch rhdh-upstream

# update the tracking branch (optional, for reference)
git checkout rhdh-upstream-main
git reset --hard rhdh-upstream/main
git push upstream rhdh-upstream-main

# rebase our main branch on top of latest rhdh
git checkout main
git rebase rhdh-upstream/main

# resolve any conflicts (see below)

# force push to update upstream after rebase
git push --force-with-lease upstream main
git push --force-with-lease origin main
```

### Expected Merge Conflicts

When rebasing, you'll likely see conflicts in these files:

**packages/app/src/components/AppBase/AppBase.tsx**
- Conflict: Kuadrant route and Navigate import
- Resolution: Keep both upstream changes and our Kuadrant route

**packages/app/src/components/catalog/EntityPage/defaultTabs.tsx**
- Conflict: Kuadrant tab definitions
- Resolution: Keep our Kuadrant imports and tab configurations

**packages/app/src/components/catalog/EntityPage/OverviewTabContent.tsx**
- Conflict: EntityKuadrantApiAccessCard in API entity section
- Resolution: Keep our Kuadrant card addition

**packages/app/src/consts.ts**
- Conflict: Kuadrant menu item
- Resolution: Keep our menu item addition

**packages/app/package.json**
- Conflict: Kuadrant plugin dependency
- Resolution: Keep our @internal/plugin-kuadrant dependency

**packages/backend/src/index.ts**
- Conflict: Kuadrant backend plugin registration
- Resolution: Keep our backend.add() calls for Kuadrant plugins

**app-config.local.yaml**
- Conflict: Usually none (gitignored)
- Resolution: N/A

## Customisations Summary

### Added Files/Directories

```
plugins/kuadrant/                      # Frontend plugin
plugins/kuadrant-backend/              # Backend plugin
kuadrant-dev-setup/                    # Kind cluster setup
  ├── crds/                            # APIProduct, APIKey
  ├── demo/                            # Toystore demo
  ├── rbac/                            # RHDH service account
  ├── scripts/                         # Kind cluster config
  ├── kuadrant-instance.yaml           # Kuadrant CR
  ├── Makefile                         # Cluster setup
  └── README.md
KUADRANT.md                            # This file
```

### Modified RHDH Files

**Frontend routing:**
- `packages/app/src/components/AppBase/AppBase.tsx`
  - Added: `import { Navigate, Route } from 'react-router-dom'`
  - Added: `<Route path="/" element={<Navigate to="catalog" />} />`
  - Added: `<Route path="/kuadrant" element={<KuadrantPage />} />`

**Entity page integration:**
- `packages/app/src/components/catalog/EntityPage/defaultTabs.tsx`
  - Added: Kuadrant imports
  - Added: `/api-keys` and `/api-product-info` tabs
  - Added: Grid wrapping for full-width layout

- `packages/app/src/components/catalog/EntityPage/OverviewTabContent.tsx`
  - Added: `EntityKuadrantApiAccessCard` for API entities

**Navigation:**
- `packages/app/src/consts.ts`
  - Added: Kuadrant menu item

**Dependencies:**
- `packages/app/package.json`
  - Added: `"@internal/plugin-kuadrant": "0.1.0"`

**Backend:**
- `packages/backend/src/index.ts`
  - Added: `backend.add(import('@internal/plugin-kuadrant-backend'))`
  - Added: `backend.add(import('@internal/plugin-kuadrant-backend/alpha'))`

**Documentation:**
- `CLAUDE.md` - Added Kuadrant development guidance

### Configuration

**app-config.local.yaml** (checked in for dev convenience):
```yaml
app:
  baseUrl: http://localhost:3000

backend:
  baseUrl: http://localhost:7007
  cors:
    origin: http://localhost:3000
    credentials: true

auth:
  environment: development
  providers:
    guest:
      dangerouslyAllowOutsideDevelopment: true

catalog:
  rules:
    - allow: [Component, System, Group, Resource, Location, Template, API, APIProduct]
```

## Development Workflow

### First Time Setup

```bash
# Install dependencies
yarn install

# Create kind cluster with Kuadrant
cd kuadrant-dev-setup
make kind-create
cd ..
```

### Daily Development

```bash
# Start RHDH with hot reload
yarn dev

# Visit http://localhost:3000
# - /kuadrant - Main plugin page
# - /catalog - Catalog with APIProduct entities
# - /catalog/default/api/toystore-api - API with Kuadrant tabs
```

### Kubernetes Access

The backend uses your local `~/.kube/config` for development. Verify access:

```bash
kubectl config current-context
kubectl get apiproducts -A
```

### Rebuilding Cluster

```bash
cd kuadrant-dev-setup
make kind-delete
make kind-create
```

## RBAC and Permissions

The Kuadrant plugins ship with a comprehensive permission system for access control.

### Three-Tier Role Hierarchy

These are example role configurations - permissions are composable, so you can create custom roles mixing these permissions however you want.

```
API Consumer (browse all, manage own keys)
    ↓
API Owner (owns specific products, approves requests for own products)
    ↓
API Admin (owns all products, approves any request)
```

**API Admin** (platform engineer)
- **Can do**: View/edit ALL API Products, approve/reject any API key requests, manage RBAC policies, read PlanPolicy
- **Cannot do**: Create/update/delete PlanPolicy (managed on cluster by platform engineers via kubectl)
- **Use case**: Platform engineers who manage all API products and access control

**API Owner**
- **Can do**: Create/update OWN API Products, approve/reject requests for OWN APIs, read PlanPolicy (to reference), request API access
- **Cannot do**: View/edit other owners' APIs, create/update/delete PlanPolicy (managed on cluster)
- **Use case**: Publishes APIs they own, manages access to their own APIs

**API Consumer**
- **Can do**: Read ALL APIProducts (for catalog browsing), create APIKeys, manage own API keys
- **Cannot do**: Approve requests, create APIs, modify rate limits
- **Use case**: Browses APIs, requests access, uses APIs within quotas

### Kuadrant Permissions

The backend exports these permissions (defined in `plugins/kuadrant-backend/src/permissions.ts`). These appear in the RBAC plugin UI and can be composed into custom roles.

**PlanPolicy (rate limit tiers):**
- `kuadrant.planpolicy.create` - create PlanPolicy resources
- `kuadrant.planpolicy.read` - read PlanPolicy resources
- `kuadrant.planpolicy.update` - update PlanPolicy resources
- `kuadrant.planpolicy.delete` - delete PlanPolicy resources
- `kuadrant.planpolicy.list` - list PlanPolicy resources

**APIProduct (catalog entries with ownership):**
- `kuadrant.apiproduct.create` - create APIProduct resources
- `kuadrant.apiproduct.read.own` - read own APIProduct resources
- `kuadrant.apiproduct.read.all` - read all APIProduct resources
- `kuadrant.apiproduct.update.own` - update own APIProduct resources
- `kuadrant.apiproduct.update.all` - update any APIProduct resource
- `kuadrant.apiproduct.delete.own` - delete own APIProduct resources
- `kuadrant.apiproduct.delete.all` - delete any APIProduct resource
- `kuadrant.apiproduct.list` - list APIProduct resources (backend filters by ownership)

**APIKey (access requests with ownership):**
- `kuadrant.apikeyrequest.create` - create APIKey resources (resource permission scoped to APIProduct)
- `kuadrant.apikeyrequest.read.own` - read own APIKey resources
- `kuadrant.apikeyrequest.read.all` - read all APIKey resources
- `kuadrant.apikeyrequest.update` - update any APIKey (approve/reject)
- `kuadrant.apikeyrequest.update.own` - update own APIKey resources
- `kuadrant.apikeyrequest.delete.own` - delete own APIKey resources
- `kuadrant.apikeyrequest.delete.all` - delete any APIKey resource
- `kuadrant.apikeyrequest.list` - list APIKey resources

**API Keys (managed secrets with ownership):**
- `kuadrant.apikey.read.own` - read own API keys
- `kuadrant.apikey.read.all` - read all API keys
- `kuadrant.apikey.delete.own` - delete own API keys
- `kuadrant.apikey.delete.all` - delete any API key

**Ownership Model:**

APIProducts track ownership via Kubernetes annotations:
- `backstage.io/created-by-user-id` - user ID for permission checks
- `backstage.io/created-by-user-ref` - user entity ref for catalog owner field
- `backstage.io/created-at` - creation timestamp

Backend enforces ownership checks for `.own` permissions:
- API Owners can only view/edit/delete their own APIProducts
- API Admins can view/edit/delete all APIProducts
- APIKey approval requires ownership of the associated APIProduct

### Testing with Different Users

Test users are defined in `catalog-entities/kuadrant-users.yaml`:

**API Consumers:**
- `consumer1` (consumer1@kuadrant.local)
- `consumer2` (consumer2@kuadrant.local)

**API Owners:**
- `owner1` (owner1@kuadrant.local) - API Owner 1
- `owner2` (owner2@kuadrant.local) - API Owner 2

**API Admins:**
- `admin` (admin@kuadrant.local) - Administrator

**Development:**
- `guest` (guest@kuadrant.local) - Guest User (member of api-owners for development convenience)

To test different permission levels, sign in as different users through your authentication provider (Dex, Keycloak, etc.)

### RBAC Policy

The RBAC policy is defined in `rbac-policy.csv` using Casbin format. This maps:
- Roles to permissions (what each role can do)
- Groups to roles (which groups have which roles)
- Users to roles (which users have which roles)

Example policy entry:
```csv
p, role:default/platform-engineer, kuadrant.policy.write, update, allow
g, group:default/platform-engineers, role:default/platform-engineer
g, user:default/platform-engineer, role:default/platform-engineer
```

### Configuration

RBAC is configured in `app-config.local.yaml`:

```yaml
auth:
  environment: development
  providers:
    guest:
      dangerouslyAllowOutsideDevelopment: true

permission:
  enabled: true
  rbac:
    policies-csv-file: ../../rbac-policy.csv
```

The RBAC policy file maps groups to roles, and users inherit permissions from their group memberships defined in the catalog.

### Kubernetes RBAC

For production deployments, the RHDH service account needs these permissions:

- Read/write access to `apiproducts.devportal.kuadrant.io`
- Read/write access to `apikeys.devportal.kuadrant.io`
- Read/write access to `secrets` (for API key storage)
- Read access to Kuadrant policies (optional, for policy viewing)

See `kuadrant-dev-setup/rbac/rhdh-rbac.yaml` for the development cluster setup.


## Philosophy

- **main is ours** - This is our development repo for Kuadrant plugins
- **Track upstream RHDH** - Periodically rebase from rhdh-upstream to stay current with RHDH releases
- **Customisations are minimal** - Keep changes focused on Kuadrant integration
- **Clean history** - Use rebase workflow to maintain clean commit history
