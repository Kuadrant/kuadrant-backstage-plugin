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

CI (`e2e-tests` in `.github/workflows/ci.yml`) uses **oinc**, not kind: `yarn oinc:cluster` then `yarn dev:oinc`, same addons as [kuadrant-console-plugin](https://github.com/Kuadrant/kuadrant-console-plugin) (gateway-api, cert-manager, metallb, istio, kuadrant, mcp-gateway). That job is 60 minutes on `ubuntu-latest` because oinc create is ~6+ min. See [docs/ci.md](ci.md).

Locally, match CI (loop 2) or use kind (loop 1):

1. Cluster: `yarn oinc:cluster` (CI path) **or** `make -C kuadrant-dev-setup kind-create`
2. App: `yarn dev:oinc` **or** `yarn dev:kind` (in a separate terminal)

```bash
cd e2e-tests
yarn test                              # all kuadrant tests
yarn test --grep "Happy Path"          # specific test suite
yarn test --grep "permissions matrix"  # RBAC tests only
```

Kind has no MCP Gateway operator. Prefer oinc when exercising MCP. Do not run kind and oinc at the same time (both write `.env`).

## Running against a deployed Backstage

Run the existing suite against the plugins loaded by an existing Backstage/RHDH
installation:

```bash
make e2e-deps
make e2e-remote BASE_URL=https://backstage.example.com
# Or select tests:
make e2e-remote BASE_URL=https://backstage.example.com PLAYWRIGHT_ARGS="--grep 'Smoke test'"
```

`BASE_URL` must be the application's HTTP(S) origin, without a path, query,
fragment or credentials. Playwright already supports this setting; the Make
wrapper requires it explicitly, forwards `PLAYWRIGHT_ARGS`, and leaves the HTML
report closed. It needs no local app, kubeconfig or setup record. Tests create
and delete resources through the deployed plugin as part of their flows.

The deployment must provide:

- Both Kuadrant plugins, connected to the intended cluster with permission to
  manage test resources.
- The existing Dex test personas, catalog groups and policy from
  `kuadrant-dev-setup/dex/config.yaml`, `catalog-entities/kuadrant-users.yaml`
  and `rbac-policy.csv`. The login helper expects the Dex quick-login picker;
  another login flow needs a matching helper.
- The demo API products and MCP fixtures used by the suite, from
  `kuadrant-dev-setup/demo/`, `e2e-tests/remote/mcp-gateway.yaml` and
  `oinc/manifests/mcp-demo.yaml`.

These are the same roles and test identities used locally and on oinc. Existing
RBAC alone is insufficient if the deployment lacks those users or grants them
different permissions. Record the deployed plugin versions alongside results.

### Preparing fixtures on OpenShift

If authentication and RBAC are already configured for the suite, create just the
cluster fixtures:

```bash
make remote-setup BASE_URL=
make e2e-remote BASE_URL=https://backstage.example.com
make remote-teardown
```

Setup needs Node 22, the E2E dependencies, kubectl and a logged-in OpenShift
context. Kuadrant must already have the developer portal enabled, the
APIProduct/APIKey/approval/PlanPolicy APIs, an accepted `istio` GatewayClass,
and the MCP APIs/controllers. RHDH uses its existing Kubernetes credentials.

Setup reuses the demo manifests and creates owned fixture namespaces, including
the consumer namespaces for the Dex personas. It refuses to overwrite existing
namespaces. Run ownership and cluster identity are recorded in `.e2e-remote/`;
`E2E_REMOTE_STATE_DIR` selects another record directory. A failed setup retains
its record for cleanup. If the record is lost, teardown recovers ownership from
run labels and refuses unlabelled resources or mixed runs.

Teardown deletes the run's MCP resources before their namespaces, avoiding the
RHCL 1.5.0 RC3 MCP Gateway finalizer hang. It retains the cluster and its installed
operators. `make teardown` belongs to oinc; use `make remote-teardown` here.

### Preparing RHDH on OpenShift

For an RHDH instance that still needs the test login and policy, pass its URL to
setup. The instance must be managed by the RHDH operator and have a completed
rollout:

```bash
make remote-setup BASE_URL=https://rhdh.example.com
make e2e-remote BASE_URL=https://rhdh.example.com
make remote-teardown
```

This also deploys Dex and mounts the existing catalog users and `rbac-policy.csv`
into RHDH through two ConfigMaps on its `Backstage` CR. OIDC and RBAC defaults
come from `kuadrant-dev-setup/rhdh-auth.yaml`, shared with oinc. `CATALOG_USERS`
and `RBAC_POLICY` can select files from the plugin release being tested.

The test configuration merges last and temporarily overrides OIDC sign-in, the
RBAC policy-file path and superusers. Such a run tests the installed plugins
under the supplied test policy. Setup preserves existing catalog locations by
reading the backend's loaded configuration through `pods/exec`; it refuses
catalog environment overrides or file directives it cannot preserve. It waits
for RHDH to restart and checks that sign-in redirects to Dex.

Dex uses an edge TLS route in the owned `kuadrant-backstage-e2e` namespace.
RHDH must trust the ingress CA, for example through `NODE_EXTRA_CA_CERTS`.
Until teardown, anyone who can reach RHDH can sign in as a test persona,
including the RBAC superuser.

Teardown removes the added configuration and waits until no RHDH pod uses it
before deleting Dex. It refuses to remove configuration owned by another run.

The runner and lifecycle regression tests use fake commands without contacting
a cluster: `node --test e2e-tests/remote/*.test.mjs`.

## Running against RHDH (dynamic plugins)

The required CI job above remains the static-plugin path. The separate `E2E (dynamic plugins)` workflow is manually dispatched and runs the same full suite against the current branch's `export-dynamic` output in RHDH on oinc.

The root Makefile is the shared driver for CI and local use. For a one-shot local run:

```bash
make e2e-dynamic
```

This builds and exports both plugins, bakes them into an RHDH image, creates the oinc cluster, runs the suite, and tears down on success. A failed run leaves the cluster up for inspection.

For manual UI testing or repeated spec runs:

```bash
make dynamic-up              # build and leave RHDH running
make e2e-deps                # needed once before running Playwright locally
make e2e-specs               # repeat without rebuilding RHDH
make teardown
```

`dynamic-up` deliberately does not install Playwright. RHDH is available at `http://rhdh.localhost:9080`; that `.localhost` origin keeps Web Crypto and clipboard APIs available over HTTP. Both RHDH and `yarn dev` authenticate through Dex with the same personas. See [oinc Development Environment](oinc.md) for the cluster, image, authentication, and version details.

The Make targets require oinc v0.6.1, Docker, Helm, kubectl, curl, Python 3, Node, and Yarn. They install project dependencies but do not install those tools. Version and image defaults can be overridden on the command line, for example:

```bash
make dynamic-up KUADRANT_VERSION=1.5.1 RHDH_IMAGE_TAG=my-test
make e2e-specs PLAYWRIGHT_ARGS="--grep 'permissions matrix'"
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

Tests use Dex authentication with these users in both environments:

- `admin@kuadrant.local` - full permissions
- `owner1@kuadrant.local` - API owner (can manage own APIs)
- `owner2@kuadrant.local` - API owner (for ownership isolation tests)
- `consumer1@kuadrant.local` - API consumer (can request access)
- `consumer2@kuadrant.local` - API consumer (for isolation tests)

Passwords match the username local part. Personas are defined in `kuadrant-dev-setup/dex/config.yaml`; their catalog users and group membership are in `catalog-entities/kuadrant-users.yaml`, with roles mapped in `rbac-policy.csv`.

## Runtime guards

Kuadrant specs import `test` and `expect` from `playwright/fixtures/test.ts`. The fixture fails a test that sees a Kuadrant backend 5xx, an uncaught page exception, or an unexpected console error. This prevents an empty-state assertion from passing over a failed fetch.

Tests that intentionally stub an error response opt out only for that scope:

```typescript
test.describe("simulated backend failures", () => {
  test.use({ allowExpectedErrors: true });
});
```

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
