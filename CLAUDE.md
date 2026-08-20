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
| [docs/oinc.md](docs/oinc.md) | Three loops: kind + host, oinc + host (`yarn dev:oinc`), oinc + published dynamic plugins (`yarn oinc:rhdh`) |

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
yarn dev:kind                   # host app vs kind (Dex :3000); fails if context is not kind-*
yarn dev:oinc                   # host app vs oinc (Dex :3000); fails if context is not oinc
yarn dev                        # same app, unguarded (current .env)
yarn start                      # start backend only (serves frontend as static assets)
yarn build                      # build all packages
yarn tsc                        # run typescript compilation
```

### Kuadrant Development Setup

Three loops. Pick one. Kind has no in-cluster RHDH path.

| | Commands | URL | Auth | For |
|---|---|---|---|---|
| **1. kind + host app** | `make -C kuadrant-dev-setup kind-create` then `yarn dev:kind` | http://localhost:3000 | OIDC (Dex :5556) | In-tree plugins, hot reload. |
| **2. oinc + host app** | `yarn oinc:cluster` then `yarn dev:oinc` | http://localhost:3000 | OIDC (Dex :5556) | Same app; OpenShift-compatible cluster. Console :9000. |
| **3. oinc + published dynamic plugins** | `yarn oinc` **or** `yarn oinc:cluster` then `yarn oinc:rhdh` | http://localhost:7007 | Guest | npm packages RHDH loads (`setup-rhdh.sh` / `npm view`). No hot reload. No local `export-dynamic` bake. |

**:3000 is yarn-dev. :7007 is Helm RHDH.** Do not run kind and oinc together (both write `.env`). Do not port-forward 7007 during yarn-dev. Sign in with OIDC (`admin@kuadrant.local` / `admin`); Guest on :7007 is loop 3. Teardown: `yarn oinc:teardown` or `make -C kuadrant-dev-setup kind-delete`.

### Testing

**Unit Tests:**
```bash
yarn test                       # run all tests
yarn test --filter=backend      # run tests for specific package
```

**E2E Tests:**

CI uses oinc, not kind. Prerequisites:
1. oinc cluster with Kuadrant + MCP Gateway (`yarn oinc:cluster`)
2. App running (`yarn dev:oinc` in a separate terminal)

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
yarn export-dynamic -- -- --dev # RHDH wrapper plugins → dynamic-plugins-root/ (not the Kuadrant in-cluster loop)
yarn oinc:rhdh                  # loop 3: Helm RHDH loads published Kuadrant npm dynamic plugins
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
