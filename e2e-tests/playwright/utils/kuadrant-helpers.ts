import { Page, Locator, Browser, expect } from "@playwright/test";
import { Common } from "./common";

// timeout constants for consistent test behaviour
export const TIMEOUTS = {
  QUICK: 5000, // negative assertions - give UI time to settle
  DEFAULT: 10000, // standard element visibility (match playwright config)
  SLOW: 20000, // api responses, page loads
  VERY_SLOW: 45000, // kubernetes propagation, catalog sync
} as const;

// test data generation
export function generateTestId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
}

export interface TestAPIProduct {
  // the unique part, shared by name and displayName. use it to find the product
  // in a table without having to know which of the two that table renders.
  id: string;
  name: string;
  displayName: string;
  namespace: string;
  owner: string;
}

export function createTestAPIProductData(owner: string): TestAPIProduct {
  const id = generateTestId();
  return {
    id,
    name: `e2e-test-api-${id}`,
    displayName: `E2E Test API ${id}`,
    namespace: "default",
    owner,
  };
}

/**
 * Check if element is visible with proper error categorisation.
 * Returns false for timeouts (expected permission denial), throws for infrastructure errors.
 */
export async function isElementVisible(
  locator: Locator,
  timeout = TIMEOUTS.DEFAULT,
): Promise<boolean> {
  try {
    await locator.waitFor({ state: "visible", timeout });
    return true;
  } catch (error: unknown) {
    if (error instanceof Error && error.name === "TimeoutError") {
      return false;
    }
    throw error;
  }
}

/**
 * Check if button with specific name is visible.
 * Returns false for timeouts (expected permission denial), throws for infrastructure errors.
 */
export async function isButtonVisible(
  page: Page,
  name: RegExp,
  timeout = TIMEOUTS.DEFAULT,
): Promise<boolean> {
  const button = page.getByRole("button", { name });
  return isElementVisible(button.first(), timeout);
}

/**
 * Check if text is visible on the page.
 * Returns false for timeouts, throws for infrastructure errors.
 */
export async function isTextVisible(
  page: Page,
  text: string | RegExp,
  timeout = TIMEOUTS.DEFAULT,
): Promise<boolean> {
  const locator = page.getByText(text);
  return isElementVisible(locator.first(), timeout);
}

/**
 * Assert button visibility matches expected permission.
 * Use for explicit permission checks that should fail fast.
 */
export async function expectButtonPermission(
  page: Page,
  buttonName: RegExp,
  expectedVisible: boolean,
  message?: string,
): Promise<void> {
  const button = page.getByRole("button", { name: buttonName }).first();
  const timeout = expectedVisible ? TIMEOUTS.DEFAULT : TIMEOUTS.QUICK;

  if (expectedVisible) {
    await expect(button, message).toBeVisible({ timeout });
  } else {
    await expect(button, message).not.toBeVisible({ timeout });
  }
}

/**
 * Assert element visibility matches expected state.
 * Use for explicit checks that should fail fast.
 */
export async function expectElementPermission(
  locator: Locator,
  expectedVisible: boolean,
  message?: string,
): Promise<void> {
  const timeout = expectedVisible ? TIMEOUTS.DEFAULT : TIMEOUTS.QUICK;

  if (expectedVisible) {
    await expect(locator, message).toBeVisible({ timeout });
  } else {
    await expect(locator, message).not.toBeVisible({ timeout });
  }
}

/**
 * Wait for API Products page to be ready.
 * Uses toPass for robust polling with networkidle for stability.
 */
export async function waitForKuadrantPageReady(page: Page): Promise<void> {
  await page.waitForURL(/\/kuadrant\/api-products/, {
    timeout: TIMEOUTS.VERY_SLOW,
  });
  await page.waitForLoadState("load").catch(() => {});

  await expect(async () => {
    // no visible spinners
    const spinner = page.locator('[role="progressbar"]:visible');
    await expect(spinner).toHaveCount(0);
    // page header is visible (Backstage Header renders as h1)
    const heading = page.locator("h1").filter({ hasText: /api products/i });
    await expect(heading).toBeVisible();
    // table is present (data loaded) - use first() as pagination is also a table
    const table = page.locator("table").first();
    await expect(table).toBeVisible();
  }).toPass({ timeout: TIMEOUTS.VERY_SLOW, intervals: [500, 1000, 2000] });
}

/**
 * Wait for API Keys page to be ready.
 * Uses toPass for robust polling with networkidle for stability.
 * @param page - The Playwright Page object
 * @param urlPattern - Optional URL pattern to wait for (defaults to any api-keys URL)
 * @param headingPattern - Optional heading text pattern to wait for (defaults to "api keys")
 */
export async function waitForApiKeysPageReady(
  page: Page,
  urlPattern: RegExp = /\/kuadrant\/(my-api-keys|api-key-approval)/,
  headingPattern: RegExp = /api key/i,
): Promise<void> {
  await page.waitForURL(urlPattern, { timeout: TIMEOUTS.VERY_SLOW });
  await page.waitForLoadState("load").catch(() => {});

  await expect(async () => {
    // no visible spinners
    const spinner = page.locator('[role="progressbar"]:visible');
    await expect(spinner).toHaveCount(0);
    // page header is visible (Backstage Header renders as h1)
    const heading = page.locator("h1").filter({ hasText: headingPattern });
    await expect(heading).toBeVisible();
  }).toPass({ timeout: TIMEOUTS.VERY_SLOW, intervals: [500, 1000, 2000] });
}

/**
 * How many rows the API keys table holds in total, not just on screen.
 *
 * Rows for the same API product are indistinguishable in the DOM, and the table
 * pages at 20 - so counting visible rows proves nothing once the first page is
 * full: adding one pushes another off, removing one pulls the next up. The
 * pagination footer carries the real total, so read that where it is rendered
 * (material-table only pages past 10 rows) and fall back to counting otherwise.
 *
 * @param page - The Playwright Page object
 */
export async function apiKeyTableTotal(page: Page): Promise<number> {
  const label = page.getByText(/\d+-\d+ of \d+/);
  if (await label.count()) {
    const match = (await label.first().innerText()).match(/of (\d+)/);
    if (match) return Number(match[1]);
  }
  return page.locator("table tbody tr").count();
}

/**
 * Open a MUI Select and wait until its options are on screen.
 *
 * Two things make a bare `.click()` unreliable here. The select is disabled
 * while its options load, and a click on a disabled MUI Select is silently
 * swallowed - no menu opens, and the later wait for an option times out
 * complaining about the listbox rather than the real cause. Even once enabled,
 * a re-render as the fetch settles can dismiss a menu that did open. So: wait
 * for enabled, then retry the open until options are actually showing.
 *
 * Use this wherever a test wants to assert on the options itself; use
 * selectFirstOption when it just needs a value chosen.
 *
 * @param page - The Playwright Page object
 * @param container - The Locator the select lives in (usually the dialog)
 * @param testId - data-testid of the select, e.g. "api-select"
 */
export async function openSelect(
  page: Page,
  container: Locator,
  testId: string,
): Promise<void> {
  const select = container.getByTestId(testId);
  await expect(
    select,
    `${testId} should become enabled once its options have loaded`,
  ).toBeEnabled({ timeout: TIMEOUTS.SLOW });

  await expect(async () => {
    await select.click();
    await expect(
      page.getByRole("listbox").getByRole("option").first(),
    ).toBeVisible({ timeout: TIMEOUTS.QUICK });
  }).toPass({ timeout: TIMEOUTS.SLOW, intervals: [250, 500, 1000] });
}

/**
 * Open one of the Request Access dialog's selects and choose an option.
 *
 * @param page - The Playwright Page object
 * @param dialog - The dialog Locator the select lives in
 * @param testId - data-testid of the select, e.g. "api-select"
 * @param optionName - Exact option to pick; the first option if omitted
 */
export async function selectFirstOption(
  page: Page,
  dialog: Locator,
  testId: string,
  optionName?: string,
): Promise<void> {
  await openSelect(page, dialog, testId);

  const listbox = page.getByRole("listbox");
  const option = optionName
    ? listbox.getByRole("option", { name: optionName, exact: true })
    : listbox.getByRole("option").first();
  await expect(
    option,
    `${testId} should offer ${optionName ?? "at least one option"}`,
  ).toBeVisible({ timeout: TIMEOUTS.DEFAULT });
  await option.click();
}

/**
 * Request an API key through the UI, so a test that needs one to exist can
 * create it rather than skip itself when the environment happens to be empty.
 *
 * Picks the first API and the first tier offered. Returns once the dialog has
 * closed, which the dialog only does on a successful submission.
 *
 * @param page - The Playwright Page object
 * @param useCase - Use-case text, worth making unique per test so the resulting
 *   row can be identified.
 */
export async function requestApiKey(
  page: Page,
  useCase: string,
  apiProductName?: string,
): Promise<void> {
  await page.goto("/kuadrant/my-api-keys");
  await waitForApiKeysPageReady(page);

  await page.getByTestId("request-access-button").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog, "Request Access dialog should open").toBeVisible({
    timeout: TIMEOUTS.DEFAULT,
  });

  await selectFirstOption(page, dialog, "api-select", apiProductName);
  await selectFirstOption(page, dialog, "tier-select");

  await dialog.getByTestId("usecase-input").fill(useCase);
  await dialog.getByTestId("submit-button").click();

  await expect(
    dialog,
    "Request Access dialog should close once the request is accepted",
  ).not.toBeVisible({ timeout: TIMEOUTS.SLOW });
}

/**
 * Create a pending API key request as a consumer, in a browser context of its
 * own, so an approver test has something to approve.
 *
 * A separate context avoids signing out and back in on the test's own page,
 * which would throw away the approver session the test is there to exercise.
 *
 * The API product is named rather than "whichever is first", because an
 * approval queue only shows requests for APIs the approver owns - so a test
 * about owner1's queue has to seed against an API owner1 owns.
 *
 * @param browser - The Playwright Browser, from the test's `browser` fixture
 * @param useCase - Use-case text, recorded on the request
 * @param apiProductName - Name of the APIProduct to request access to
 */
export async function seedPendingApiKeyRequest(
  browser: Browser,
  useCase: string,
  apiProductName: string,
): Promise<void> {
  // a manually created context inherits nothing from the config's `use` block,
  // so mirror the baseURL (dexQuickLogin starts with a relative goto) and the
  // https override the rest of the suite runs with.
  const context = await browser.newContext({
    baseURL: process.env.BASE_URL || "http://localhost:3000",
    ignoreHTTPSErrors: true,
  });
  try {
    const page = await context.newPage();
    await new Common(page).dexQuickLogin("consumer1@kuadrant.local");
    await requestApiKey(page, useCase, apiProductName);
  } finally {
    await context.close();
  }
}

/**
 * Retry an operation with delays for kubernetes propagation.
 */
export async function retryUntilSuccess<T>(
  fn: () => Promise<T>,
  options: {
    maxAttempts?: number;
    delayMs?: number;
    errorMessage?: string;
  } = {},
): Promise<T> {
  const {
    maxAttempts = 5,
    delayMs = 2000,
    errorMessage = "Operation failed after max attempts",
  } = options;

  let lastError: Error | undefined;

  for (let i = 0; i < maxAttempts; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (i < maxAttempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  throw new Error(`${errorMessage}: ${lastError?.message}`);
}

// test data builder for isolated test execution
export class KuadrantTestDataBuilder {
  private cleanupFns: Array<() => Promise<void>> = [];

  constructor(private page: Page) {}

  async createAPIProductViaUI(
    ownerEmail: string,
    data: TestAPIProduct,
  ): Promise<TestAPIProduct> {
    const common = new Common(this.page);
    await common.dexQuickLogin(ownerEmail);
    await this.page.goto("/kuadrant/api-products");
    await waitForKuadrantPageReady(this.page);

    // click create button
    const createButton = this.page.getByRole("button", {
      name: /create api product/i,
    });
    await expect(createButton).toBeVisible({ timeout: TIMEOUTS.SLOW });
    await createButton.click();

    // wait for dialog
    const dialog = this.page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: TIMEOUTS.DEFAULT });

    // fill form
    await this.page.getByPlaceholder("my-api").fill(data.name);
    await this.page.getByPlaceholder("My API").fill(data.displayName);
    await this.page
      .getByPlaceholder("API description")
      .fill("E2E test - will be cleaned up");

    // select httproute
    const httprouteSelect = this.page.locator(
      '[data-testid="httproute-select"]',
    );
    await httprouteSelect.scrollIntoViewIfNeeded();
    await httprouteSelect.click({ timeout: TIMEOUTS.DEFAULT });

    // wait for dropdown and select first option
    const toystoreOption = this.page
      .getByRole("option", { name: /toystore/i })
      .first();
    await expect(toystoreOption).toBeVisible({ timeout: TIMEOUTS.DEFAULT });
    await toystoreOption.click();

    // submit
    const submitButton = dialog.getByRole("button", { name: /create/i });
    await submitButton.click();

    // wait for success
    await expect(dialog).not.toBeVisible({ timeout: TIMEOUTS.SLOW });

    // register cleanup
    this.cleanupFns.push(async () => {
      await this.deleteAPIProductViaUI(ownerEmail, data);
    });

    return data;
  }

  async deleteAPIProductViaUI(
    ownerEmail: string,
    data: TestAPIProduct,
  ): Promise<void> {
    try {
      const common = new Common(this.page);
      await common.dexQuickLogin(ownerEmail);
      await this.page.goto("/kuadrant/api-products");
      await waitForKuadrantPageReady(this.page);

      const apiProductRow = this.page
        .locator("tr")
        .filter({ hasText: data.displayName });
      const rowVisible = await isElementVisible(
        apiProductRow,
        TIMEOUTS.DEFAULT,
      );

      if (rowVisible) {
        const deleteButton = apiProductRow.getByRole("button", {
          name: /delete api product/i,
        });
        await deleteButton.click();

        const confirmDialog = this.page.getByRole("dialog");
        await expect(confirmDialog).toBeVisible({ timeout: TIMEOUTS.DEFAULT });

        const confirmInput = confirmDialog.getByRole("textbox");
        await confirmInput.fill(data.name);

        const confirmButton = confirmDialog.getByRole("button", {
          name: /delete/i,
        });
        await confirmButton.click();
        await expect(confirmDialog).not.toBeVisible({ timeout: TIMEOUTS.SLOW });
      }
    } catch (error) {
      console.warn(`Cleanup failed for ${data.name}:`, error);
    }
  }

  async cleanup(): Promise<void> {
    for (const fn of this.cleanupFns.reverse()) {
      try {
        await fn();
      } catch (error) {
        console.warn("Cleanup error:", error);
      }
    }
    this.cleanupFns = [];
  }
}
