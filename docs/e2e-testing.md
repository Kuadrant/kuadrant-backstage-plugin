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

Point the suite at an existing Backstage/RHDH installation to test the plugins
loaded there:

```bash
make e2e-deps
make e2e-remote BASE_URL=https://backstage.example.com PLAYWRIGHT_ARGS="--grep 'Smoke test'"
make e2e-remote BASE_URL=https://backstage.example.com
```

`BASE_URL` is required. Use the application's HTTP(S) origin, without a path,
query, fragment or credentials. The runner prints the selected URL and passes
it to Playwright. It starts no local app, requires no kubeconfig or local setup
record, and runs no fixture setup or cleanup. Playwright runs headlessly unless
`--headed` is requested; the HTML report does not open automatically. The tests
create and delete resources through the deployed plugin as part of their flows.

The deployment must already have:

- Both Kuadrant plugins loaded and connected to the intended cluster, with
  permissions to manage the test resources.
- The five test personas, catalog groups and RBAC from
  `catalog-entities/kuadrant-users.yaml` and `rbac-policy.csv`.
- OIDC sign-in through the Dex quick-login picker used by the current suite.
  A different identity provider or a standard login form needs a matching login
  helper before these role-based tests can run.
- The toystore, gamestore and additional demo API products, plus the MCP fixtures
  used by the full suite. See `kuadrant-dev-setup/demo/`,
  `e2e-tests/remote/mcp-gateway.yaml` and `oinc/manifests/mcp-demo.yaml`.

The runner tests the installation as configured. It does not install Backstage,
load plugins, change authentication or configure the deployment's Kubernetes
credentials. A passing run covers the plugin versions loaded by that deployment;
record those versions alongside the results.

### Preparing RHDH on OpenShift

On OpenShift, `make remote-setup BASE_URL=...` deploys Dex and the fixtures, then
configures the RHDH instance behind `BASE_URL` to sign in through that Dex.
`BASE_URL` must be the route of a `Backstage` CR managed by the RHDH operator.
Setup needs Node 22, Yarn, kubectl and the cluster prerequisites of the
[local app path](#local-backstage-against-an-existing-openshift-cluster), but not
Docker. Select the cluster's kubectl context, then:

```bash
make e2e-deps
make remote-setup BASE_URL=https://rhdh.example.com
make e2e-remote BASE_URL=https://rhdh.example.com
make remote-teardown
```

Setup creates two ConfigMaps in the RHDH namespace and adds them to the
`Backstage` CR after its own entries:

- `kuadrant-e2e-app-config`, last in `spec.application.appConfig.configMaps` so
  it merges last: the OIDC provider for Dex, `signInPage: oidc`, the persona
  catalog location and RBAC.
- `kuadrant-e2e-files` in `spec.application.extraFiles.configMaps`, mounted at
  `/opt/app-root/src/kuadrant-e2e`: `catalog-entities/kuadrant-users.yaml` and
  `rbac-policy.csv`, or the files named by `CATALOG_USERS` and `RBAC_POLICY`.

It then waits for RHDH to restart and checks that sign-in redirects to Dex.

Dex runs in the owned `kuadrant-backstage-e2e` namespace behind an edge TLS
route, `https://dex-kuadrant-backstage-e2e.<ingress domain>`, with the
`BASE_URL` callback added to its `backstage` client. RHDH must trust the
cluster's ingress CA to reach Dex, for example through `NODE_EXTRA_CA_CERTS`;
setup warns when this machine cannot verify Dex or RHDH. Until teardown, anyone
who can reach the route can sign in as a test persona, including the RBAC super
user.

Teardown removes the two entries from the CR and waits until no RHDH pod runs
with them before it deletes the ConfigMaps and Dex. Deleting Dex first would
leave RHDH trusting an issuer whose host any user able to create routes could
claim. Teardown stops before changing anything while a `Backstage` CR
references a `kuadrant-e2e-*` ConfigMap that this run did not create.

## Local Backstage against an existing OpenShift cluster

This development path runs the checkout's plugins locally against remote
Kuadrant APIs. It does not validate a deployed Backstage or its released plugins.
`remote-setup`, `remote-dev` and `remote-teardown` support this path independently
of `e2e-remote`.

Prerequisites: Node 22, Yarn, kubectl, curl, Python 3, Docker (for local Dex), and a logged-in
OpenShift context. Kuadrant must already have the developer portal enabled,
the APIProduct/APIKey/approval/PlanPolicy APIs, an accepted `istio` GatewayClass,
and the MCP APIs/controllers. The full suite includes MCP tests. Setup leaves
operator versions, CRDs, and the Kuadrant installation unchanged.

```bash
# Log in/select the release-test cluster first. Keep the same KUBECONFIG and
# context in each terminal; a separate KUBECONFIG is useful for release testing.
oc login https://api.<test-cluster>:6443 --username=admin
kubectl config current-context
yarn install --immutable
make e2e-deps
make remote-setup

# Terminal 1: local Backstage :3000, backend :7007, Dex :5556
make remote-dev

# Terminal 2: verify which cluster the local backend reads, then test it
node e2e-tests/remote/cluster.mjs check
make e2e-remote BASE_URL=http://localhost:3000

# Stop remote-dev with Ctrl-C, then remove this run's fixtures
make remote-teardown
```

Setup creates the toystore/gamestore demos, their Gateways, an MCP Gateway and
server fixture, persona consumer namespaces, and a dedicated service account
with the plugin's Kubernetes RBAC. It refuses to overwrite existing fixture
namespaces or its ClusterRole/ClusterRoleBinding. Gateway Services use the
cluster's default load balancer, without oinc's MetalLB class.

Ownership and the cluster identity are recorded in the ignored `.e2e-remote/`
directory. Keep it until cleanup completes. Setup failures retain this record
so `make remote-teardown` can remove partially created fixtures before retrying.
Cleanup checks ownership and identity, removes only this run's namespaces and
RBAC, and retains the cluster and installed release. It deletes this run's MCP
resources before their namespaces, so the MCP controller can remove its
finalizers. Do not use `make teardown` for this path: that target belongs to oinc.

If you delete or re-clone the checkout and lose `.e2e-remote/`, stop any running
local app, select the original cluster, and run:

```bash
make remote-teardown
make remote-setup
```

Without a local record, teardown recovers ownership from the known fixture
namespaces, RBAC and labelled RHDH ConfigMaps. Every remaining fixture must
have the same run label; unlabelled resources or mixed runs stop cleanup before
anything is deleted. The recovered record includes current resource UIDs so an
interrupted cleanup can be retried safely. This also works after a partially
completed setup.

`remote-dev` checks the recorded cluster and local ports, then requests an
eight-hour service-account token (the API server may cap its lifetime). The
token is passed to the app's environment; `.env` is unchanged. Restart
`remote-dev` to renew it. The remote targets do not open browser tabs or the HTML
report automatically; Playwright runs headlessly unless `--headed` is requested.
The `cluster.mjs check` command verifies that the local backend lists this
run's labelled HTTPRoutes. It signs its request with a per-run token that only
`remote-dev` gives the app, and that token can list HTTPRoutes and nothing else.
Reports, screenshots and traces use the usual `e2e-tests/` paths.

The remote runner and setup/cleanup regression tests use fake commands, without
contacting a cluster: `node --test e2e-tests/remote/*.test.mjs`.

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
