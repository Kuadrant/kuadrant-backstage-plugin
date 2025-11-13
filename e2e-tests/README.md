# Kuadrant E2E Tests

End-to-end tests for the Kuadrant Backstage plugins using Playwright.

## Test Structure

- `playwright/e2e/smoke-test.spec.ts` - basic smoke test to verify the app loads
- `playwright/e2e/kuadrant-plugin.spec.ts` - kuadrant plugin-specific tests

## Running Tests

### Against Dev Mode (yarn dev)

run tests against webpack dev server with hot reloading (port 3000):

```bash
yarn test:dev
```

### Against Production Build (yarn start)

run tests against production build (port 7007):

```bash
yarn test:prod
```

### Smoke Test Only

quick check that the app loads:

```bash
yarn test:smoke
```

## Prerequisites

1. start the application in another terminal:
   ```bash
   # for dev mode
   yarn dev

   # for production mode
   yarn start
   ```

2. ensure the kind cluster is running if testing kubernetes integration:
   ```bash
   cd kuadrant-dev-setup
   make kind-create
   ```

## Writing New Tests

tests follow playwright's conventions. example:

```typescript
import { test, expect } from "@playwright/test";
import { Common } from "../utils/common";

test.describe("my feature", () => {
  let common: Common;

  test.beforeEach(async ({ page }) => {
    common = new Common(page);
    await common.loginAsGuest();
  });

  test("should do something", async ({ page }) => {
    await page.goto("/my-page");
    await expect(page.locator("h1")).toContainText("expected text");
  });
});
```

## Utilities

the `playwright/utils/` directory contains helper functions:
- `common.ts` - authentication and common actions
- `ui-helper.ts` - ui interaction helpers

## Configuration

- `playwright.config.ts` - playwright configuration
- default base url: `http://localhost:3000` (dev mode)
- override with `BASE_URL` environment variable for production mode

## Test Projects

- `smoke-test` - basic health check (runs first, 3 retries)
- `kuadrant` - all kuadrant-specific tests (depends on smoke-test passing)
