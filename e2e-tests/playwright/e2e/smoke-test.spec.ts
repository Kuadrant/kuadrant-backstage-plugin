import { test, expect } from "../fixtures/test";
import { loginAs } from "../support/auth/login-as";
test.describe("Smoke test", () => {
  test.beforeAll(async () => {
    test.info().annotations.push({
      type: "component",
      description: "core",
    });
  });

  test.beforeEach(async ({ page }) => {
    await loginAs(page, "admin@kuadrant.local");
  });

  test("Verify the Homepage renders", async ({ page }) => {
    // in production mode (yarn start), dynamic home page shows "welcome back!"
    // in dev mode (yarn dev), home redirects to catalog which shows "my org catalog"
    const homeHeading = page
      .locator("h1, h2, h3, h4, h5, h6")
      .filter({ hasText: /Welcome back!|My Org Catalog/i });
    await expect(homeHeading.first()).toBeVisible({ timeout: 20000 });
  });
});
