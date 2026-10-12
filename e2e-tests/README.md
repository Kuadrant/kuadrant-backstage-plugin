# Kuadrant E2E Tests

End-to-end tests for the Kuadrant Backstage plugins using Playwright.

## Running Tests

Start the app in another terminal (after the cluster below):

```bash
yarn dev:oinc
```

Then run the tests:

```bash
cd e2e-tests
yarn test
```

Or just smoke test:

```bash
yarn test:smoke
```

## Prerequisites

To test a deployed Backstage/RHDH, run from the repository root:

```bash
make e2e-deps
make e2e-remote BASE_URL=https://backstage.example.com
```

This tests the plugins loaded by that deployment. It needs no local app,
kubeconfig or `.e2e-remote/` state. The deployment must already provide the
suite's Dex personas, RBAC and demo resources; see
[deployment prerequisites](../docs/e2e-testing.md#running-against-a-deployed-backstage).

For local plugin development against a remote cluster, see the separate
[local-app workflow](../docs/e2e-testing.md#local-backstage-against-an-existing-openshift-cluster).

CI uses oinc (Kuadrant + MCP Gateway), not kind. Locally, match that or use kind as a lighter fallback:

```bash
# loop 2 — same cluster as CI
yarn oinc:cluster
yarn dev:oinc

# loop 1 — kind, no MCP Gateway operator
make -C kuadrant-dev-setup kind-create
yarn dev:kind
```

## What's Tested

- Smoke test: app loads and displays homepage
- Kuadrant plugin: navigation, page rendering, API products display

Tests run in CI automatically on every PR and push to main.
