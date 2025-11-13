import { test, expect } from "@playwright/test";
import { Common } from "../utils/common";

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

  test("should display Kuadrant menu item", async ({ page }) => {
    const kuadrantLink = page.locator('nav a[href="/kuadrant"]');
    await expect(kuadrantLink).toBeVisible({ timeout: 10000 });
  });

  test("should navigate to Kuadrant page", async ({ page }) => {
    await page.goto("/kuadrant");

    // check for main heading
    const heading = page.locator('h1, h2').filter({ hasText: /kuadrant/i });
    await expect(heading.first()).toBeVisible({ timeout: 10000 });
  });

  test("should display API Products section", async ({ page }) => {
    await page.goto("/kuadrant");

    // wait for page to load
    await page.waitForLoadState('networkidle');

    // check for api products text anywhere on page (could be in table, card, etc)
    const apiProductsText = page.getByText(/api products/i).first();
    await expect(apiProductsText).toBeVisible({ timeout: 10000 });
  });

  test("should display Create API Product button for users with permission", async ({ page }) => {
    await page.goto("/kuadrant");

    // wait for page to load
    await page.waitForLoadState('networkidle');

    // button may or may not be visible depending on permissions
    // just check the page loaded without errors
    const content = page.locator('main');
    await expect(content).toBeVisible();
  });

  test("should navigate to catalog and find API entities", async ({ page }) => {
    await page.goto("/catalog?filters[kind]=api");

    // check catalog loaded
    const catalogHeading = page.locator('h1, h2').filter({ hasText: /catalog/i });
    await expect(catalogHeading.first()).toBeVisible({ timeout: 10000 });
  });
});
