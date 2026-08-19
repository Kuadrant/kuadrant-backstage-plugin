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
