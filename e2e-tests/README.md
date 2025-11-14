# Kuadrant E2E Tests

End-to-end tests for the Kuadrant Backstage plugins using Playwright.

## Running Tests

Start the app in another terminal:

```bash
yarn dev
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

- Kind cluster running with Kuadrant:
  ```bash
  cd kuadrant-dev-setup
  make kind-create
  ```

## What's Tested

- Smoke test: app loads and displays homepage
- Kuadrant plugin: navigation, page rendering, API products display

Tests run in CI automatically on every PR and push to main.
