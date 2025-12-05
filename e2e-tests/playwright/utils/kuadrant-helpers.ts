import { Page, Locator, expect } from "@playwright/test";
import { Common } from "./common";

// timeout constants for consistent test behaviour
export const TIMEOUTS = {
  QUICK: 3000,       // quick checks where element absence is expected
  DEFAULT: 5000,     // standard element visibility
  SLOW: 10000,       // api responses, catalog sync
  VERY_SLOW: 30000,  // kubernetes propagation
} as const;

// test data generation
export function generateTestId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
}

export interface TestAPIProduct {
  name: string;
  displayName: string;
  namespace: string;
  owner: string;
}

export function createTestAPIProductData(owner: string): TestAPIProduct {
  const id = generateTestId();
  return {
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
 * Wait for page to be ready without relying on networkidle.
 * Waits for a known element to appear instead.
 */
export async function waitForKuadrantPageReady(page: Page): Promise<void> {
  // wait for the kuadrant heading to appear
  const heading = page.locator("h1, h2").filter({ hasText: /kuadrant/i }).first();
  await expect(heading).toBeVisible({ timeout: TIMEOUTS.SLOW });
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
  const { maxAttempts = 5, delayMs = 2000, errorMessage = "Operation failed after max attempts" } = options;

  let lastError: Error | undefined;

  for (let i = 0; i < maxAttempts; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (i < maxAttempts - 1) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
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
    await this.page.goto("/kuadrant");
    await waitForKuadrantPageReady(this.page);

    // click create button
    const createButton = this.page.getByRole("button", { name: /create api product/i });
    await expect(createButton).toBeVisible({ timeout: TIMEOUTS.SLOW });
    await createButton.click();

    // wait for dialog
    const dialog = this.page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: TIMEOUTS.DEFAULT });

    // fill form
    await this.page.getByPlaceholder("my-api").fill(data.name);
    await this.page.getByPlaceholder("My API").fill(data.displayName);
    await this.page.getByPlaceholder("API description").fill("E2E test - will be cleaned up");

    // select httproute
    const httprouteSelect = this.page.locator('[data-testid="httproute-select"]');
    await httprouteSelect.scrollIntoViewIfNeeded();
    await httprouteSelect.click({ timeout: TIMEOUTS.DEFAULT });

    // wait for dropdown and select first option
    const toystoreOption = this.page.getByRole("option", { name: /toystore/i }).first();
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
      await this.page.goto("/kuadrant");
      await waitForKuadrantPageReady(this.page);

      const apiProductRow = this.page.locator("tr").filter({ hasText: data.displayName });
      const rowVisible = await isElementVisible(apiProductRow, TIMEOUTS.DEFAULT);

      if (rowVisible) {
        const deleteButton = apiProductRow.getByRole("button", { name: /delete api product/i });
        await deleteButton.click();

        const confirmDialog = this.page.getByRole("dialog");
        await expect(confirmDialog).toBeVisible({ timeout: TIMEOUTS.DEFAULT });

        const confirmInput = confirmDialog.getByRole("textbox");
        await confirmInput.fill(data.name);

        const confirmButton = confirmDialog.getByRole("button", { name: /delete/i });
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
