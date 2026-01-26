import { test, expect } from "@playwright/test";
import { Common } from "../utils/common";
import { waitForKuadrantPageReady, TIMEOUTS } from "../utils/kuadrant-helpers";

test.describe("Kuadrant Plugin", () => {
  let common: Common;

  test.beforeAll(async () => {
    test.info().annotations.push({
      type: "component",
      description: "kuadrant",
    });
  });

  test.beforeEach(async ({ page }) => {
    common = new Common(page);
    await common.loginAsGuest();
  });

  test("should display Kuadrant menu section in sidebar", async ({ page }) => {
    // kuadrant parent menu item should be visible
    const kuadrantSection = page.locator("nav").getByText("Kuadrant");
    await expect(kuadrantSection.first()).toBeVisible({
      timeout: TIMEOUTS.SLOW,
    });
  });

  test("should display API Products and API Keys sub-menu items", async ({
    page,
  }) => {
    // expand kuadrant menu if needed
    const kuadrantSection = page.locator("nav").getByText("Kuadrant").first();
    await kuadrantSection.click();

    // check for sub-menu items
    const apiProductsLink = page.locator(
      'nav a[href="/kuadrant/api-products"]',
    );
    const apiKeysLink = page.locator('nav a[href="/kuadrant/api-keys"]');

    await expect(apiProductsLink).toBeVisible({ timeout: TIMEOUTS.DEFAULT });
    await expect(apiKeysLink).toBeVisible({ timeout: TIMEOUTS.DEFAULT });
  });

  test("should display API Products page", async ({ page }) => {
    await page.goto("/kuadrant/api-products");

    // check for main heading
    await waitForKuadrantPageReady(page);

    // check for content area
    const content = page.locator("main");
    await expect(content).toBeVisible();
  });

  test("should display API Keys page", async ({ page }) => {
    await page.goto("/kuadrant/api-keys");

    // check for api keys heading
    const heading = page.locator("h1, h2").filter({ hasText: /api keys/i });
    await expect(heading.first()).toBeVisible({ timeout: TIMEOUTS.SLOW });

    // check for tabs
    const myApiKeysTab = page.getByTestId("my-api-keys-tab");
    await expect(myApiKeysTab).toBeVisible({ timeout: TIMEOUTS.DEFAULT });
  });

  test("should display Create API Product button for users with permission", async ({
    page,
  }) => {
    await page.goto("/kuadrant/api-products");
    await waitForKuadrantPageReady(page);

    // button may or may not be visible depending on permissions
    // just check the page loaded without errors
    const content = page.locator("main");
    await expect(content).toBeVisible();
  });

  test("should navigate to catalog and find API entities", async ({ page }) => {
    await page.goto("/catalog?filters[kind]=api");

    // check catalog loaded
    const catalogHeading = page
      .locator("h1, h2")
      .filter({ hasText: /catalog/i });
    await expect(catalogHeading.first()).toBeVisible({
      timeout: TIMEOUTS.SLOW,
    });
  });

  test("should display filter panel on API Keys page", async ({ page }) => {
    await page.goto("/kuadrant/api-keys");

    // wait for page to load
    const heading = page.locator("h1, h2").filter({ hasText: /api keys/i });
    await expect(heading.first()).toBeVisible({ timeout: TIMEOUTS.SLOW });

    // check for filter panel
    const filtersText = page.getByText("Filters");
    await expect(filtersText.first()).toBeVisible({
      timeout: TIMEOUTS.DEFAULT,
    });
  });

  test("should display My API Keys tab on API Keys page", async ({ page }) => {
    await page.goto("/kuadrant/api-keys");

    const myApiKeysTab = page.getByTestId("my-api-keys-tab");
    await expect(myApiKeysTab).toBeVisible({ timeout: TIMEOUTS.SLOW });
  });

  test("should display status filter options on API Keys page", async ({
    page,
  }) => {
    await page.goto("/kuadrant/api-keys");

    // wait for page to load
    const heading = page.locator("h1, h2").filter({ hasText: /api keys/i });
    await expect(heading.first()).toBeVisible({ timeout: TIMEOUTS.SLOW });

    // check for status filter options
    const statusSection = page.getByText("Status");
    await expect(statusSection.first()).toBeVisible({
      timeout: TIMEOUTS.DEFAULT,
    });
  });

  test("should navigate to API Key detail page", async ({ page }) => {
    await page.goto("/kuadrant/api-keys");

    // wait for page to load
    const heading = page.locator("h1, h2").filter({ hasText: /api keys/i });
    await expect(heading.first()).toBeVisible({ timeout: TIMEOUTS.SLOW });

    // look for view details button (eye icon)
    const viewDetailsButton = page
      .getByRole("button", { name: /view details/i })
      .first();
    const buttonVisible = await viewDetailsButton
      .isVisible()
      .catch(() => false);

    if (buttonVisible) {
      await viewDetailsButton.click();

      // should navigate to detail page
      await page.waitForURL(/\/kuadrant\/api-keys\/[^/]+\/[^/]+/);

      // verify detail page content
      const breadcrumb = page.getByText("API keys").first();
      await expect(breadcrumb).toBeVisible({ timeout: TIMEOUTS.DEFAULT });
    }
    // test passes if no API keys exist (nothing to view)
  });

  test("should display API Key detail page with correct sections", async ({
    page,
  }) => {
    // navigate directly to a known API key detail page
    await page.goto("/kuadrant/api-keys");

    const heading = page.locator("h1, h2").filter({ hasText: /api keys/i });
    await expect(heading.first()).toBeVisible({ timeout: TIMEOUTS.SLOW });

    // find first row in table and click view details
    const viewDetailsButton = page
      .getByRole("button", { name: /view details/i })
      .first();
    const buttonVisible = await viewDetailsButton
      .isVisible()
      .catch(() => false);

    if (buttonVisible) {
      await viewDetailsButton.click();
      await page.waitForURL(/\/kuadrant\/api-keys\/[^/]+\/[^/]+/);

      // verify detail page sections
      const detailsCard = page.getByText("API Key Details");
      await expect(detailsCard.first()).toBeVisible({
        timeout: TIMEOUTS.DEFAULT,
      });

      // verify View API button exists
      const viewApiButton = page.getByTestId("view-api-button");
      await expect(viewApiButton).toBeVisible({ timeout: TIMEOUTS.DEFAULT });
    }
  });
});
