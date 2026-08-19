import { test as base, expect, Page } from "@playwright/test";

/**
 * Guards every test against failures that would otherwise pass silently.
 *
 * A spec that asserts on rendered text will happily go green while the backend
 * answers 500 and the UI shows an empty table, or while an uncaught exception
 * takes out a component the assertion never looks at. These three listeners
 * turn those into failures.
 *
 * Imported in place of `@playwright/test`, so no spec has to opt in.
 */

// console.error text we do not treat as a failure. the guard exists to catch
// OUR regressions (e.g. a failed fetch our code logs but never throws), so keep
// this list to noise we can prove is third-party: an entry that could also
// match our own output would blind the guard. widen only with a stock source.
const consoleNoise = [
  // browser-generated line for a request that already failed. the network
  // status is the useful signal and the 5xx guard below already carries it;
  // this repeats it without the status or path, and fires for expected non-2xx
  // too (the pre-sign-in auth probe 401s by design).
  /^Failed to load resource:/,

  // the rest are react dev-mode warnings and mui advisories from third-party
  // components the rhdh shell renders. yarn dev runs react in development so
  // they fire; the production dynamic build strips them. rhdh pins these deps,
  // none of it is our code, and each pattern matches the whole warning class
  // (any offending component), not just the instances the homepage happened to
  // surface.

  // react-beautiful-dnd (via @backstage-community/plugin-rbac) calls the
  // deprecated findDOMNode.
  /findDOMNode is deprecated/,

  // material-table (MTableHeader, MTablePagination) and Connect(Droppable) from
  // react-beautiful-dnd set defaultProps on function/memo components.
  /Support for defaultProps will be removed/,

  // mui advisory about MuiBottomNavigationAction css specificity.
  /MuiBottomNavigationAction/,

  // stock backstage nests a Typography h2 inside an h5 in its page header.
  /validateDOMNesting/,
];

// 5xx from these is the backend admitting it broke. anything else - 4xx, or a
// 5xx from a route we do not own - is left to the test's own assertions.
const kuadrantApi = /^\/api\/kuadrant\//;

function watchForFailures(page: Page, failures: string[]) {
  page.on("response", (response) => {
    const { pathname } = new URL(response.url());
    if (kuadrantApi.test(pathname) && response.status() >= 500) {
      failures.push(
        `${response.status()} from ${response.request().method()} ${pathname}`,
      );
    }
  });

  page.on("requestfailed", (request) => {
    // a 5xx at least got answered; a requestfailed is the request never
    // completing - dns, a reset, a refused connection - which the response
    // guard above never sees. same url filter, so it stays about our backend.
    const { pathname } = new URL(request.url());
    if (!kuadrantApi.test(pathname)) return;

    // the browser aborts in-flight requests when the spa navigates away mid
    // fetch; that is expected churn, not a transport fault.
    const errorText = request.failure()?.errorText ?? "";
    if (errorText === "net::ERR_ABORTED") return;

    failures.push(
      `request failed: ${request.method()} ${pathname} (${errorText})`,
    );
  });

  page.on("pageerror", (error) => {
    failures.push(`uncaught exception: ${error.message}`);
  });

  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (consoleNoise.some((pattern) => pattern.test(text))) return;
    failures.push(`console error: ${text}`);
  });
}

const TEST = base.extend<{
  /**
   * Opt a test out of the guards below.
   *
   * Only for tests whose subject IS the error path - the ones that stub a 500
   * with `page.route(...).fulfill(...)` to check the UI reports it. There the
   * error is the fixture of the test, not a fault, and the app logging it is
   * the behaviour under test.
   *
   * Set per describe block: `test.use({ allowExpectedErrors: true })`. Do not
   * reach for it to quieten a failure you have not explained.
   */
  allowExpectedErrors: boolean;
  failOnRuntimeErrors: void;
}>({
  allowExpectedErrors: [false, { option: true }],

  failOnRuntimeErrors: [
    async ({ page, allowExpectedErrors }, use) => {
      if (allowExpectedErrors) {
        await use();
        return;
      }

      const failures: string[] = [];
      watchForFailures(page, failures);

      await use();

      expect
        .soft(
          failures,
          "backend 5xx, uncaught exceptions and console errors seen during this test",
        )
        .toEqual([]);
    },
    { auto: true },
  ],
});

export { TEST as test, expect };
export type { Page };
