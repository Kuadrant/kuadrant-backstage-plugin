# E2E Testing

End-to-end tests for the Kuadrant Backstage plugin using Playwright.

## Overview

The E2E tests verify the full user journey through the Kuadrant plugin, including:
- API product creation and management
- API access request workflow
- RBAC permission enforcement
- Approval queue functionality

## Test Structure

```
e2e-tests/
├── playwright/
│   ├── e2e/
│   │   ├── kuadrant-plugin.spec.ts       # basic navigation/rendering
│   │   ├── kuadrant-happy-path.spec.ts   # full API lifecycle
│   │   └── kuadrant-permissions-matrix.spec.ts  # RBAC tests
│   └── utils/
│       ├── common.ts                     # login helpers
│       └── kuadrant-helpers.ts           # shared utilities
└── test-results/                         # failure artifacts
```

## Running Tests

Prerequisites:
1. Kind cluster running: `cd kuadrant-dev-setup && make kind-create`
2. App running: `yarn dev` (in separate terminal)

```bash
cd e2e-tests
yarn test                              # all kuadrant tests
yarn test --grep "Happy Path"          # specific test suite
yarn test --grep "permissions matrix"  # RBAC tests only
```

## Key Principles

### 1. Tests verify real behaviour
Tests should fail if the application is broken. Don't fudge tests to make them pass - investigate whether it's a test bug or an application bug.

### 2. Use data-testid for reliable selectors
Prefer `data-testid` attributes over fragile selectors:
```typescript
// good - stable, explicit
const tierSelect = page.locator('[data-testid="tier-select"]');

// bad - brittle, can break with UI changes
const tierSelect = page.locator('.MuiSelect-root').first();
```

### 3. Serial execution for dependent tests
Tests that depend on prior state use serial mode:
```typescript
test.describe.configure({ mode: "serial" });
```

### 4. Cleanup regardless of outcome
Use `afterAll` for cleanup that runs even on failure:
```typescript
test.afterAll(async ({ browser }) => {
  // cleanup code - always runs
});
```

## Debugging Failed Tests

### Check test-results directory
Failed tests produce artifacts in `test-results/`:
- `error-context.md` - ARIA snapshot of page state at failure
- `test-failed-*.png` - screenshots at failure point
- `trace.zip` - full trace (open with `npx playwright show-trace`)
- `video.webm` - video recording

### Reading error-context.md
The ARIA snapshot shows the accessibility tree at failure. Key things to look for:
- Is the expected element present?
- Is it visible/enabled?
- What's the actual page structure?

Example:
```yaml
- dialog [ref=e156]:
  - button "Submit Request" [ref=e172] [cursor=pointer]
```

### Common issues

**Material-UI Select dropdowns**
MUI renders dropdown options in a portal outside the dialog DOM. The options only appear when the dropdown is open:
```typescript
// click to open dropdown
await tierSelect.click();
// find listbox (rendered in portal)
const listbox = page.getByRole("listbox");
await expect(listbox).toBeVisible({ timeout: TIMEOUTS.SLOW });
await listbox.getByRole("option").first().click();
```

**Material-UI TextField labels**
MUI TextField uses placeholder as the accessible name, not the label text:
```typescript
// bad - label text isn't the accessible name
dialog.getByLabel(/use case/i);

// good - use the placeholder text
dialog.getByRole("textbox", { name: /describe how you plan to use/i });
```

**Multiple elements with same role**
When multiple tabs/buttons have the same name, use testids:
```typescript
// bad - which "Pending" tab?
page.getByRole("tab", { name: /pending/i });

// good - explicit
page.locator('[data-testid="approval-queue-pending-tab"]');
```

**Timing issues**
Use appropriate timeouts from `kuadrant-helpers.ts`:
```typescript
import { TIMEOUTS } from "../utils/kuadrant-helpers";

await expect(element).toBeVisible({ timeout: TIMEOUTS.SLOW });
```

### Viewing traces
For detailed debugging, use the Playwright trace viewer:
```bash
npx playwright show-trace test-results/.../trace.zip
```

## Test Users

Tests use Dex authentication with these users:
- `admin@kuadrant.local` - full permissions
- `owner1@kuadrant.local` - API owner (can manage own APIs)
- `owner2@kuadrant.local` - API owner (for ownership isolation tests)
- `consumer1@kuadrant.local` - API consumer (can request access)

## Adding testids

When selectors are unreliable, add `data-testid` attributes to components:

```tsx
<Tab
  label={`Pending (${pending.length})`}
  data-testid="approval-queue-pending-tab"
/>
```

Naming convention: `{component}-{element}-{descriptor}`
- `approval-queue-pending-tab`
- `my-api-keys-active-tab`
- `request-api-access-button`

## Shared Utilities

### kuadrant-helpers.ts

**TIMEOUTS** - consistent timeout values:
- `QUICK`: 3s - elements that should be immediate
- `DEFAULT`: 10s - normal interactions
- `SLOW`: 30s - operations requiring backend calls

**waitForKuadrantPageReady(page)** - waits for Kuadrant page to fully load

**retryUntilSuccess(fn, options)** - retry async operations:
```typescript
await retryUntilSuccess(
  async () => {
    await page.goto("/catalog");
    await expect(page.getByText("My API")).toBeVisible();
  },
  { maxAttempts: 5, delayMs: 3000 }
);
```

**createTestAPIProductData(owner)** - generates unique test data with timestamps
