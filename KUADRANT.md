# Kuadrant Plugin Development

This repository is a customised fork of [Red Hat Developer Hub (RHDH)](https://github.com/redhat-developer/rhdh) for developing Kuadrant Backstage plugins.

## Branching Strategy

- **`main`** - Our development branch with Kuadrant plugins and customisations
- **`rhdh-upstream`** - Tracks upstream RHDH (for pulling updates)

### Pulling RHDH Updates

```bash
# Switch to upstream tracking branch
git checkout rhdh-upstream
git pull origin main              # Pull from redhat-developer/rhdh

# Rebase our work on top of latest RHDH
git checkout main
git rebase rhdh-upstream

# Resolve any conflicts (see below)
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
  ├── crds/                            # APIProduct, APIKeyRequest
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

### User Roles

**Platform Engineer (admin)**
- Approve/reject API key requests
- View and manage all API keys across all namespaces
- Read and write policies (PlanPolicy, RateLimitPolicy, etc.)
- Full visibility of all pending requests

**API Owner**
- Publish APIs and create API products
- Approve/reject API key requests for their APIs
- View and manage API keys for their APIs
- Read policies

**API Consumer**
- Request API keys for APIs
- View and manage only own API keys
- Limited catalog access

### Kuadrant Permissions

The backend exports these permissions (defined in `plugins/kuadrant-backend/src/permissions.ts`):

- `kuadrant.apikey.create` - Create API keys
- `kuadrant.apikey.read.own` - Read own API keys
- `kuadrant.apikey.read.all` - Read all API keys (admin)
- `kuadrant.apikey.delete.own` - Delete own API keys
- `kuadrant.apikey.delete.all` - Delete any API key (admin)
- `kuadrant.policy.read` - Read Kuadrant policies
- `kuadrant.policy.write` - Write Kuadrant policies (admin)
- `kuadrant.request.approve` - Approve API key requests (admin)
- `kuadrant.request.reject` - Reject API key requests (admin)

### Testing with Different Users

Switch between test users to verify RBAC behaviour:

```bash
# switch to platform engineer (full admin access)
./switch-user.sh platform-engineer

# switch to api owner (can approve requests)
./switch-user.sh api-owner

# switch to api consumer (can only request keys)
./switch-user.sh api-consumer

# restart development server
yarn dev
```

**Test users** (defined in `catalog-entities/kuadrant-users.yaml`):
- `platform-engineer` - member of platform-engineers group
- `api-owner` - member of api-owners group
- `api-consumer` - member of api-consumers group

After switching:
1. Restart `yarn dev`
2. Refresh browser (cmd+r)
3. You're now authenticated as the selected user

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
      userEntityRef: user:default/api-owner

permission:
  enabled: true
  rbac:
    policies-csv-file: ../../rbac-policy.csv
```

The `userEntityRef` determines which user you're logged in as (changeable via `switch-user.sh`).

### Kubernetes RBAC

For production deployments, the RHDH service account needs these permissions:

- Read/write access to `apiproducts.extensions.kuadrant.io`
- Read/write access to `apikeyrequests.extensions.kuadrant.io`
- Read/write access to `secrets` (for API key storage)
- Read access to Kuadrant policies (optional, for policy viewing)

See `kuadrant-dev-setup/rbac/rhdh-rbac.yaml` for the development cluster setup.


## Philosophy

- **main is ours** - This is our development repo for Kuadrant plugins
- **rhdh-upstream tracks upstream** - Periodically pull and rebase to stay current
- **Customisations are minimal** - Keep changes focused on Kuadrant integration
