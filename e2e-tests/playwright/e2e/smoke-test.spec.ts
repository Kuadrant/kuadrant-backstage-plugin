import { test, expect } from "@playwright/test";
import { UIhelper } from "../utils/ui-helper";
import { Common } from "../utils/common";
test.describe("Smoke test", () => {
  let uiHelper: UIhelper;
  let common: Common;

  test.beforeAll(async () => {
    test.info().annotations.push({
      type: "component",
      description: "core",
    });
  });

  test.beforeEach(async ({ page }) => {
    uiHelper = new UIhelper(page);
    common = new Common(page);
    await common.loginAsGuest();
  });

  test("Verify the Homepage renders", async ({ page }) => {
    // in production mode (yarn start), dynamic home page shows "welcome back!"
    // in dev mode (yarn dev), home redirects to catalog which shows "my org catalog"
    const homeHeading = page.locator('h1, h2, h3, h4, h5, h6').filter({ hasText: /Welcome back!|My Org Catalog/i });
    await expect(homeHeading.first()).toBeVisible({ timeout: 20000 });
  });
});
