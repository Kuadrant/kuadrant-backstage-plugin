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
- Kubernetes CRDs: APIProduct, APIKey, PlanPolicy
- Kuadrant Gateway API integration
- AuthPolicy and RateLimitPolicy support
- Direct Backstage integration (no dynamic plugin complexity for dev)

## Detailed Documentation

For specific topics, refer to these focused guides:

| Document | Topics Covered |
|----------|---------------|
| [docs/backend-security.md](docs/backend-security.md) | Backend security tenets, input validation, authentication, error handling |
| [docs/rbac-permissions.md](docs/rbac-permissions.md) | RBAC permissions, role definitions, ownership model, permission checks |
| [docs/architecture.md](docs/architecture.md) | Monorepo structure, dynamic plugins, build system, Kubernetes config |
| [docs/plugin-integration.md](docs/plugin-integration.md) | Adding plugins, routes, entity pages, common pitfalls |
| [docs/kuadrant-resources.md](docs/kuadrant-resources.md) | CRDs, namespace organisation, approval modes, catalog sync |
| [docs/ui-patterns.md](docs/ui-patterns.md) | Table patterns, delete dialogs, frontend permissions, sidebar menu config |

## Prerequisites

**Node.js version:** 22.20.0 (specified in `.nvmrc`)

If using nvm and Homebrew Node together, ensure nvm's Node takes precedence:
```bash
nvm use                         # use version from .nvmrc
node --version                  # verify you're on v22.20.0, not v24+
```

**macOS users:** Must use GNU `grep` and GNU `sed` instead of BSD versions:
```bash
brew install grep gnu-sed
```

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
- Custom CRDs (APIProduct, APIKey)
- Toystore demo (example API with policies)
- RHDH service account with proper RBAC

### Testing

**Unit Tests:**
```bash
yarn test                       # run all tests
yarn test --filter=backend      # run tests for specific package
```

**E2E Tests:**

Prerequisites:
1. Kind cluster running with Kuadrant (`cd kuadrant-dev-setup && make kind-create`)
2. App running (`yarn dev` in separate terminal)

```bash
cd e2e-tests
yarn test                       # run kuadrant e2e tests
yarn test:smoke                 # run smoke tests only
```

Tests available:
- `kuadrant-plugin.spec.ts` - basic navigation and rendering tests
- `kuadrant-rbac.spec.ts` - comprehensive RBAC permission tests covering all personas

### Linting and Formatting
```bash
yarn lint:check                 # check for linting errors
yarn lint:fix                   # fix linting errors
yarn prettier:check             # check formatting
yarn prettier:fix               # fix formatting
```

### Dynamic Plugins
```bash
yarn export-dynamic -- -- --dev # export all dynamic plugins for local dev
```

### Testing Different Roles
```bash
yarn user:consumer              # switch to API Consumer
yarn user:owner                 # switch to API Owner
yarn user:default               # restore default permissions
```
After switching roles, restart with `yarn dev`.

## Testing Infrastructure

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

## Key Files Reference

### Backend
- Router: [`plugins/kuadrant-backend/src/router.ts`](plugins/kuadrant-backend/src/router.ts)
- Kubernetes Client: [`plugins/kuadrant-backend/src/KubernetesClient.ts`](plugins/kuadrant-backend/src/KubernetesClient.ts)
- Entity Provider: [`plugins/kuadrant-backend/src/provider/APIProductEntityProvider.ts`](plugins/kuadrant-backend/src/provider/APIProductEntityProvider.ts)

### Frontend
- Plugin entry: [`plugins/kuadrant/src/plugin.ts`](plugins/kuadrant/src/plugin.ts)
- Permissions: [`plugins/kuadrant/src/permissions.ts`](plugins/kuadrant/src/permissions.ts)
- Permission hooks: [`plugins/kuadrant/src/utils/permissions.ts`](plugins/kuadrant/src/utils/permissions.ts)

### Configuration
- Base config: [`app-config.yaml`](app-config.yaml)
- Local overrides: [`app-config.local.yaml`](app-config.local.yaml)
- RBAC policies: [`rbac-policy.csv`](rbac-policy.csv)

### CRDs
- APIProduct: [`kuadrant-dev-setup/crds/devportal.kuadrant.io_apiproduct.yaml`](kuadrant-dev-setup/crds/devportal.kuadrant.io_apiproduct.yaml)
- APIKey: [`kuadrant-dev-setup/crds/devportal.kuadrant.io_apikeys.yaml`](kuadrant-dev-setup/crds/devportal.kuadrant.io_apikeys.yaml)
