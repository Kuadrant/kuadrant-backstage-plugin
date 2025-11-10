# Kuadrant Backstage Plugins

Backstage plugins for API access management using Kuadrant Gateway API primitives.

**Based on:** [Red Hat Developer Hub (RHDH)](https://github.com/redhat-developer/rhdh)
**Development mode:** Hot reload with full catalog integration

## Features

**For API consumers:**
- Request API access with tiered plans (bronze, silver, gold)
- View and manage API keys
- Track request status (pending, approved, rejected)

**For platform engineers:**
- Approve/reject API access requests
- Manage API products and plan tiers
- Configure rate limits via PlanPolicy

**For API owners:**
- Create API products with multiple plan tiers
- Define rate limits and quotas
- Sync API products from Kubernetes to Backstage catalog

## Quick Start

```bash
# Install dependencies
yarn install

# Create kind cluster with Kuadrant
cd kuadrant-dev-setup
make kind-create
cd ..

# Start development server with hot reload
yarn dev
```

Visit:
- http://localhost:3000/kuadrant - Main plugin page
- http://localhost:3000/catalog - Catalog with APIProduct entities
- http://localhost:3000/catalog/default/api/toystore-api - API with Kuadrant tabs

## Architecture

### Plugins

**Frontend (`plugins/kuadrant`):**
- Main Kuadrant page with approval queue
- API key management tab for API entities
- API product info tab for APIProduct entities
- API access request card

**Backend (`plugins/kuadrant-backend`):**
- Kubernetes integration (@kubernetes/client-node)
- APIProduct entity provider for catalog sync
- HTTP API endpoints for API keys and requests
- Support for explicit cluster config and in-cluster auth

### Kubernetes Resources

**Custom CRDs:**
- `APIProduct` - Defines API products with plan tiers
- `APIKeyRequest` - Tracks API access requests

**Kuadrant components:**
- Kuadrant operator v1.3.0
- Gateway API with Istio
- AuthPolicy for authentication
- RateLimitPolicy for rate limiting
- PlanPolicy for tiered access

## Development

### Daily Workflow

```bash
yarn dev                          # Start with hot reload
# Make changes to plugin code
# Browser automatically reloads
```

### Kubernetes Access

Uses local `~/.kube/config` for development:

```bash
kubectl config current-context    # Verify cluster
kubectl get apiproducts -A        # Check resources
kubectl get apikeyrequests -A
```

### Cluster Management

```bash
cd kuadrant-dev-setup
make kind-delete                  # Delete cluster
make kind-create                  # Recreate with fresh setup
```

### Building

```bash
yarn build                        # Build all packages
yarn tsc                          # TypeScript compilation
yarn lint:check                   # Check linting
yarn test                         # Run tests
```

### Testing Permissions

The application uses RBAC with two roles: API Consumer and API Owner. Use these commands to switch roles:

```bash
yarn user:consumer      # Switch to API Consumer
yarn user:owner         # Switch to API Owner
yarn user:default       # Restore default permissions
```

After switching roles, restart with `yarn dev`.

**API Consumer (restricted access):**
- Can view API Products
- Can request API keys
- No "Create API Product" button
- No "Plan Policies" or "Approval Queue" cards

**API Owner (can publish APIs):**
- Can create/delete API Products
- Can approve/reject API key requests
- Can view Plan Policies (read-only)

Note: PlanPolicies are managed on the cluster by platform engineers. This plugin only provides read access to view existing policies.

## Project Structure

```
plugins/
├── kuadrant/                     # Frontend plugin
└── kuadrant-backend/             # Backend plugin

kuadrant-dev-setup/               # Development environment
├── crds/                         # APIProduct, APIKeyRequest CRDs
├── demo/                         # Toystore demo resources
├── rbac/                         # RHDH service account permissions
├── kuadrant-instance.yaml        # Kuadrant CR
└── Makefile                      # Cluster setup automation

packages/
├── app/                          # RHDH frontend (customised)
└── backend/                      # RHDH backend (customised)
```

## Customisations

This repo is a fork of RHDH with Kuadrant-specific customisations. See [KUADRANT.md](KUADRANT.md) for:
- Branching strategy (main vs rhdh-upstream)
- List of modified files
- Merge conflict resolution guide
- How to pull RHDH updates

### Key Integration Points

**Routes:** `packages/app/src/components/AppBase/AppBase.tsx`
**Entity tabs:** `packages/app/src/components/catalog/EntityPage/defaultTabs.tsx`
**Menu:** `packages/app/src/consts.ts`
**Backend plugins:** `packages/backend/src/index.ts`

## Documentation

- [KUADRANT.md](KUADRANT.md) - Branching strategy and customisations
- [CLAUDE.md](CLAUDE.md) - Development guidance and patterns
- [plugins/kuadrant/README.md](plugins/kuadrant/README.md) - Plugin installation guide
- [kuadrant-dev-setup/README.md](kuadrant-dev-setup/README.md) - Cluster setup guide

## Technical Details

**Node.js:** 22.20.0 (see `.nvmrc`)
**Package manager:** Yarn 3
**Build system:** Turborepo
**Hot reload:** Webpack dev server on port 3000
**Backend:** Express on port 7007

## Contributing

We welcome contributions! This is a development fork focused on Kuadrant plugins.

For RHDH-specific improvements, see [KUADRANT.md](KUADRANT.md#contributing-changes-upstream) for how to contribute upstream.

## License

See [LICENSE](LICENSE)

## Related

- [Kuadrant](https://docs.kuadrant.io/) - API management for Kubernetes
- [Backstage](https://backstage.io/) - Open platform for building developer portals
- [RHDH](https://github.com/redhat-developer/rhdh) - Enterprise Backstage distribution
