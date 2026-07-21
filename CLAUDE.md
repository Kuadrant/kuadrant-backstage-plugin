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
| [docs/overview.md](docs/overview.md) | High-level portal overview, personas, workflow summary |
| [docs/getting-started.md](docs/getting-started.md) | End-to-end tutorial: publish an API and manage consumer access |
| [docs/plugin-architecture.md](docs/plugin-architecture.md) | Plugin architecture, component diagrams, data flows, design decisions, security |
| [docs/repository-guide.md](docs/repository-guide.md) | Monorepo structure, dynamic plugins, build system, Kubernetes config |
| [docs/backend-security.md](docs/backend-security.md) | Backend security tenets, input validation, authentication, error handling |
| [docs/rbac-permissions.md](docs/rbac-permissions.md) | RBAC permissions, role definitions, ownership model, permission checks |
| [docs/plugin-integration.md](docs/plugin-integration.md) | Adding plugins, routes, entity pages, common pitfalls |
| [docs/kuadrant-resources.md](docs/kuadrant-resources.md) | CRDs, namespace organisation, approval modes, catalog sync |
| [docs/ui-patterns.md](docs/ui-patterns.md) | Table patterns, delete dialogs, frontend permissions, sidebar menu config |
| [docs/api-reference.md](docs/api-reference.md) | Backend REST API endpoints, request/response shapes, auth requirements |
| [docs/e2e-testing.md](docs/e2e-testing.md) | E2E test setup, Playwright configuration, test structure |
| [docs/ci.md](docs/ci.md) | CI/CD pipelines, release flow, npm publishing, static vs dynamic plugins |
| [docs/oinc.md](docs/oinc.md) | oinc dev environment, cluster setup, RHDH integration testing |

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
- Kuadrant operator 1.5+ (or RHCL 1.4+)
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

**Dynamic-plugin E2E (manually dispatched in CI):**
```bash
make e2e-dynamic                # build, bake, boot oinc, run the specs, tear down
make preflight                  # check required tooling, change nothing
```
Needs oinc (pinned version), docker, helm, kubectl, curl, python3 and node/yarn, and
installs none of them; it does run `yarn install` and `playwright install chromium`, as
CI does. Cluster is left up on failure for inspection.

For manual testing, run the same phases without the one-shot teardown:
```bash
make dynamic-up                 # build and leave the RHDH environment running
make e2e-deps                   # install Playwright locally (once)
make e2e-specs                  # run the specs against it (repeatable, no rebuild)
make teardown                   # delete the cluster (no-op if there is none)
```
`dynamic-up` leaves RHDH at `http://rhdh.localhost:9080` and always rebuilds the image.
It signs in through dex with the same five personas as `yarn dev`, so the whole spec set
runs there. It deliberately skips Playwright installation for browser-only manual
testing. After `e2e-deps`, `e2e-specs` forwards `PLAYWRIGHT_ARGS` and needs no rebuild.
See [docs/e2e-testing.md](docs/e2e-testing.md) and [docs/oinc.md](docs/oinc.md).

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

`yarn dev` starts a local dex container on `:5556`; `make dynamic-up` deploys dex on the
oinc cluster from the same files. Either way, sign in through the dex quick-login picker
as one of five personas: `admin@kuadrant.local`, `owner1@`, `owner2@`, `consumer1@`,
`consumer2@` (passwords match usernames). Sign out and back in to switch.

Personas live in [`kuadrant-dev-setup/dex/config.yaml`](kuadrant-dev-setup/dex/config.yaml)
and [`catalog-entities/kuadrant-users.yaml`](catalog-entities/kuadrant-users.yaml); their
group membership maps to roles in [`rbac-policy.csv`](rbac-policy.csv). Adding a persona
is a one-file edit that both environments pick up.

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
- Kubernetes Client: [`plugins/kuadrant-backend/src/k8s-client.ts`](plugins/kuadrant-backend/src/k8s-client.ts)
- Entity Provider: [`plugins/kuadrant-backend/src/providers/APIProductEntityProvider.ts`](plugins/kuadrant-backend/src/providers/APIProductEntityProvider.ts)

### Frontend
- Plugin entry: [`plugins/kuadrant/src/plugin.ts`](plugins/kuadrant/src/plugin.ts)
- Permissions: [`plugins/kuadrant/src/permissions.ts`](plugins/kuadrant/src/permissions.ts)
- Permission hooks: [`plugins/kuadrant/src/utils/permissions.ts`](plugins/kuadrant/src/utils/permissions.ts)

### Configuration
- Base config: [`app-config.yaml`](app-config.yaml)
- Local overrides: [`app-config.local.yaml`](app-config.local.yaml)
- RBAC policies: [`rbac-policy.csv`](rbac-policy.csv)

### CRDs
CRDs (APIProduct, APIKey) are installed from the upstream operator via kustomize during `make kind-create`. See [`kuadrant-dev-setup/Makefile`](kuadrant-dev-setup/Makefile).
