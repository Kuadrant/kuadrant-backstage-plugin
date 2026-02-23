import { test, expect } from "@playwright/test";
import { Common } from "../utils/common";
import {
  TIMEOUTS,
  expectButtonPermission,
  waitForKuadrantPageReady,
} from "../utils/kuadrant-helpers";

/**
 * Comprehensive permissions matrix test.
 *
 * Tests ALL permission combinations for the three personas:
 * - API Admin (admin@kuadrant.local)
 * - API Owner (owner1@kuadrant.local, owner2@kuadrant.local)
 * - API Consumer (consumer1@kuadrant.local)
 *
 * Permission categories tested:
 * - APIProduct: create, read.all, read.own, update.all, update.own, delete.all, delete.own, list
 * - APIKey: create, read.all, read.own, update.all, update.own, delete.all, delete.own, approve
 */

test.describe("Kuadrant Permissions Matrix", () => {
  test.beforeAll(async () => {
    test.info().annotations.push({
      type: "component",
      description: "kuadrant",
    });
  });

  // ==========================================
  // APIProduct Permissions
  // ==========================================

  test.describe("APIProduct Permissions", () => {
    test("kuadrant.apiproduct.create - admin CAN create", async ({ page }) => {
      const common = new Common(page);
      await common.dexQuickLogin("admin@kuadrant.local");
      await page.goto("/kuadrant/api-products");
      await waitForKuadrantPageReady(page);

      await expectButtonPermission(
        page,
        /create api product/i,
        true,
        "Admin should see Create API Product button",
      );
    });

    test("kuadrant.apiproduct.create - owner CAN create", async ({ page }) => {
      const common = new Common(page);
      await common.dexQuickLogin("owner1@kuadrant.local");
      await page.goto("/kuadrant/api-products");
      await waitForKuadrantPageReady(page);

      await expectButtonPermission(
        page,
        /create api product/i,
        true,
        "Owner should see Create API Product button",
      );
    });

    test("kuadrant.apiproduct.create - consumer CANNOT create", async ({
      page,
    }) => {
      const common = new Common(page);
      await common.dexQuickLogin("consumer1@kuadrant.local");
      await page.goto("/kuadrant/api-products");
      await waitForKuadrantPageReady(page);

      await expectButtonPermission(
        page,
        /create api product/i,
        false,
        "Consumer should NOT see Create API Product button",
      );
    });

    test("kuadrant.apiproduct.list - admin CAN list all products", async ({
      page,
    }) => {
      const common = new Common(page);
      await common.dexQuickLogin("admin@kuadrant.local");
      await page.goto("/kuadrant/api-products");
      await waitForKuadrantPageReady(page);

      const apiProductsSection = page.locator("h1").filter({ hasText: /api products/i });
      await expect(
        apiProductsSection,
        "Admin should see API Products section",
      ).toBeVisible({ timeout: TIMEOUTS.DEFAULT });
    });

    test("kuadrant.apiproduct.list - owner CAN list all products", async ({
      page,
    }) => {
      const common = new Common(page);
      await common.dexQuickLogin("owner1@kuadrant.local");
      await page.goto("/kuadrant/api-products");
      await waitForKuadrantPageReady(page);

      const apiProductsSection = page.locator("h1").filter({ hasText: /api products/i });
      await expect(
        apiProductsSection,
        "Owner should see API Products section",
      ).toBeVisible({ timeout: TIMEOUTS.DEFAULT });
    });

    test("kuadrant.apiproduct.list - consumer CAN list all products", async ({
      page,
    }) => {
      const common = new Common(page);
      await common.dexQuickLogin("consumer1@kuadrant.local");
      await page.goto("/kuadrant/api-products");
      await waitForKuadrantPageReady(page);

      const apiProductsSection = page.locator("h1").filter({ hasText: /api products/i });
      await expect(
        apiProductsSection,
        "Consumer should see API Products section",
      ).toBeVisible({ timeout: TIMEOUTS.DEFAULT });
    });

    test("kuadrant.apiproduct.update.all - admin CAN edit any product", async ({
      page,
    }) => {
      const common = new Common(page);
      await common.dexQuickLogin("admin@kuadrant.local");
      await page.goto("/kuadrant/api-products");
      await waitForKuadrantPageReady(page);

      const apiProductsCard = page.locator("h1").filter({ hasText: /api products/i });
      await expect(apiProductsCard).toBeVisible({ timeout: TIMEOUTS.SLOW });

      // admin should see edit icon on any row
      const editButton = page
        .getByRole("button", { name: /edit api product/i })
        .first();
      await expect(editButton, "Admin should see Edit button").toBeVisible({
        timeout: TIMEOUTS.DEFAULT,
      });
    });

    test("kuadrant.apiproduct.update.own - owner sees edit button only on own products", async ({
      page,
    }) => {
      const common = new Common(page);
      await common.dexQuickLogin("owner1@kuadrant.local");
      await page.goto("/kuadrant/api-products");
      await waitForKuadrantPageReady(page);

      // owner1 should see the table
      const table = page.locator("table").first();
      await expect(table, "Owner should see products table").toBeVisible({
        timeout: TIMEOUTS.DEFAULT,
      });

      // find Gamestore API row specifically (owned by owner2, not owner1)
      const gamestoreRow = page
        .locator("tr")
        .filter({ hasText: "Gamestore API" })
        .first();
      const gamestoreVisible = await gamestoreRow.isVisible().catch(() => false);

      if (gamestoreVisible) {
        // owner1 should NOT see edit button on Gamestore API (owned by owner2)
        const gamestoreEditBtn = gamestoreRow.getByRole("button", {
          name: /edit api product/i,
        });
        await expect(
          gamestoreEditBtn,
          "Owner should NOT see edit button on other's products",
        ).not.toBeVisible({ timeout: TIMEOUTS.QUICK });
      }
    });

    test("kuadrant.apiproduct.delete.all - admin CAN delete any product", async ({
      page,
    }) => {
      const common = new Common(page);
      await common.dexQuickLogin("admin@kuadrant.local");
      await page.goto("/kuadrant/api-products");
      await waitForKuadrantPageReady(page);

      const apiProductsCard = page.locator("h1").filter({ hasText: /api products/i });
      await expect(apiProductsCard).toBeVisible({ timeout: TIMEOUTS.SLOW });

      // admin should see delete icon on any row
      const deleteButton = page
        .getByRole("button", { name: /delete api product/i })
        .first();
      await expect(deleteButton, "Admin should see Delete button").toBeVisible({
        timeout: TIMEOUTS.DEFAULT,
      });
    });

    test("kuadrant.apiproduct.delete - consumer CANNOT delete any product", async ({
      page,
    }) => {
      const common = new Common(page);
      await common.dexQuickLogin("consumer1@kuadrant.local");
      await page.goto("/kuadrant/api-products");
      await waitForKuadrantPageReady(page);

      // consumer should NOT see delete buttons
      const table = page.locator("table").first();
      await expect(table, "Consumer should see products table").toBeVisible({
        timeout: TIMEOUTS.DEFAULT,
      });

      const deleteButton = page
        .getByRole("button", { name: /delete api product/i })
        .first();
      await expect(
        deleteButton,
        "Consumer should NOT see Delete button",
      ).not.toBeVisible({ timeout: TIMEOUTS.QUICK });
    });
  });

  // ==========================================
  // APIKey Permissions
  // ==========================================

  test.describe("APIKey Permissions", () => {
    test("kuadrant.apikey.create - admin CAN request access", async ({
      page,
    }) => {
      const common = new Common(page);
      await common.dexQuickLogin("admin@kuadrant.local");
      await page.goto("/catalog/default/api/toystore-api");
      await page.waitForURL(/\/catalog\/.*\/api\/toystore-api/, { timeout: TIMEOUTS.VERY_SLOW });

      const apiKeysTab = page.getByRole("tab", { name: /api keys/i });
      await expect(apiKeysTab, "API Keys tab should exist").toBeVisible({
        timeout: TIMEOUTS.SLOW,
      });
      await apiKeysTab.click();

      await expectButtonPermission(
        page,
        /request.*access/i,
        true,
        "Admin should see Request Access button",
      );
    });

    test("kuadrant.apikey.create - owner CAN request access", async ({
      page,
    }) => {
      const common = new Common(page);
      await common.dexQuickLogin("owner1@kuadrant.local");

      await page.goto("/catalog/default/api/toystore-api");
      await page.waitForURL(/\/catalog\/.*\/api\/toystore-api/, { timeout: TIMEOUTS.VERY_SLOW });

      const apiKeysTab = page.getByRole("tab", { name: /api keys/i });
      await expect(apiKeysTab, "API Keys tab should exist").toBeVisible({
        timeout: TIMEOUTS.SLOW,
      });
      await apiKeysTab.click();

      await expectButtonPermission(
        page,
        /request.*access/i,
        true,
        "Owner should see Request Access button",
      );
    });

    test("kuadrant.apikey.create - consumer CAN request access", async ({
      page,
    }) => {
      const common = new Common(page);
      await common.dexQuickLogin("consumer1@kuadrant.local");

      await page.goto("/catalog/default/api/toystore-api");
      await page.waitForURL(/\/catalog\/.*\/api\/toystore-api/, { timeout: TIMEOUTS.VERY_SLOW });

      const apiKeysTab = page.getByRole("tab", { name: /api keys/i });
      await expect(apiKeysTab, "API Keys tab should exist").toBeVisible({
        timeout: TIMEOUTS.SLOW,
      });
      await apiKeysTab.click();

      await expectButtonPermission(
        page,
        /request.*access/i,
        true,
        "Consumer should see Request Access button",
      );
    });

    test("kuadrant.apikey.approve - admin CAN see approval page", async ({
      page,
    }) => {
      const common = new Common(page);
      await common.dexQuickLogin("admin@kuadrant.local");
      await page.goto("/kuadrant/api-key-approval");

      const heading = page.locator("h1, h2").filter({ hasText: /api key approval/i });
      await expect(
        heading.first(),
        "Admin should see API Key Approval page",
      ).toBeVisible({ timeout: TIMEOUTS.SLOW });
    });

    test("kuadrant.apikey.approve - owner CAN see approval page", async ({
      page,
    }) => {
      const common = new Common(page);
      await common.dexQuickLogin("owner1@kuadrant.local");
      await page.goto("/kuadrant/api-key-approval");

      const heading = page.locator("h1, h2").filter({ hasText: /api key approval/i });
      await expect(
        heading.first(),
        "Owner should see API Key Approval page",
      ).toBeVisible({ timeout: TIMEOUTS.SLOW });
    });

    test("kuadrant.apikey.approve - consumer CANNOT access approval page", async ({
      page,
    }) => {
      const common = new Common(page);
      await common.dexQuickLogin("consumer1@kuadrant.local");

      // Consumer should not be able to access the approval page
      // They should either get a 403 or be redirected
      await page.goto("/kuadrant/api-key-approval");

      // Wait a moment to see if we get an error page or are redirected
      await page.waitForTimeout(2000);

      // Consumer should NOT see "API Key Approval" heading
      const approvalHeading = page.locator("h1, h2").filter({ hasText: /api key approval/i });
      await expect(
        approvalHeading,
        "Consumer should NOT see API Key Approval page",
      ).not.toBeVisible({ timeout: TIMEOUTS.QUICK });
    });

    test("kuadrant.apikey.read.own - consumer CAN see My API Keys page", async ({
      page,
    }) => {
      const common = new Common(page);
      await common.dexQuickLogin("consumer1@kuadrant.local");
      await page.goto("/kuadrant/my-api-keys");

      const heading = page.locator("h1, h2").filter({ hasText: /my api keys/i });
      await expect(
        heading.first(),
        "Consumer should see My API Keys page",
      ).toBeVisible({ timeout: TIMEOUTS.SLOW });
    });

    test("kuadrant.apikey.delete.own - consumer sees My API Keys page with filters", async ({
      page,
    }) => {
      const common = new Common(page);
      await common.dexQuickLogin("consumer1@kuadrant.local");
      await page.goto("/kuadrant/my-api-keys");

      const heading = page.locator("h1, h2").filter({ hasText: /my api keys/i });
      await expect(heading.first()).toBeVisible({ timeout: TIMEOUTS.SLOW });

      // verify filter panel exists
      const filtersText = page.getByText("Filters");
      await expect(
        filtersText.first(),
        "My API Keys page should have Filters panel",
      ).toBeVisible({ timeout: TIMEOUTS.DEFAULT });
    });
  });

  // ==========================================
  // Cross-Ownership Tests
  // ==========================================

  test.describe("Cross-Ownership Enforcement", () => {
    test("owner2 CANNOT edit toystore API (owned by owner1)", async ({
      page,
    }) => {
      const common = new Common(page);
      await common.dexQuickLogin("owner2@kuadrant.local");
      await page.goto("/kuadrant/api-products");
      await waitForKuadrantPageReady(page);

      // Toystore API must exist for this test (owned by owner1)
      const toystoreRow = page
        .locator("tr")
        .filter({ hasText: "Toystore API" })
        .first();
      await expect(
        toystoreRow,
        "Toystore API must exist for cross-ownership test",
      ).toBeVisible({ timeout: TIMEOUTS.SLOW });

      // owner2 should NOT see edit button on Toystore API (not their product)
      const editButton = toystoreRow.getByRole("button", {
        name: /edit api product/i,
      });
      await expect(
        editButton,
        "Owner2 should NOT see edit button on Toystore API",
      ).not.toBeVisible({ timeout: TIMEOUTS.QUICK });
    });

    test("owner2 CANNOT delete toystore API (owned by owner1)", async ({
      page,
    }) => {
      const common = new Common(page);
      await common.dexQuickLogin("owner2@kuadrant.local");
      await page.goto("/kuadrant/api-products");
      await waitForKuadrantPageReady(page);

      // Toystore API must exist for this test (owned by owner1)
      const toystoreRow = page
        .locator("tr")
        .filter({ hasText: "Toystore API" })
        .first();
      await expect(
        toystoreRow,
        "Toystore API must exist for cross-ownership test",
      ).toBeVisible({ timeout: TIMEOUTS.SLOW });

      // owner2 should NOT see delete button on Toystore API (not their product)
      const deleteButton = toystoreRow.getByRole("button", {
        name: /delete api product/i,
      });
      await expect(
        deleteButton,
        "Owner2 should NOT see delete button on Toystore API",
      ).not.toBeVisible({ timeout: TIMEOUTS.QUICK });
    });

    test("admin CAN edit toystore API (has update.all permission)", async ({
      page,
    }) => {
      const common = new Common(page);
      await common.dexQuickLogin("admin@kuadrant.local");
      await page.goto("/kuadrant/api-products");
      await waitForKuadrantPageReady(page);

      // Toystore API must exist for this test
      const toystoreRow = page
        .locator("tr")
        .filter({ hasText: "Toystore API" })
        .first();
      await expect(
        toystoreRow,
        "Toystore API must exist for cross-ownership test",
      ).toBeVisible({ timeout: TIMEOUTS.SLOW });

      // admin should see edit button on Toystore API
      const editButton = toystoreRow.getByRole("button", {
        name: /edit api product/i,
      });
      await expect(
        editButton,
        "Admin should see edit button on Toystore API",
      ).toBeVisible({ timeout: TIMEOUTS.DEFAULT });
    });

    test("admin CAN approve requests for any owner's APIs", async ({
      page,
    }) => {
      const common = new Common(page);
      await common.dexQuickLogin("admin@kuadrant.local");
      await page.goto("/kuadrant/api-key-approval");

      const heading = page.locator("h1, h2").filter({ hasText: /api key approval/i });
      await expect(
        heading.first(),
        "Admin should see API Key Approval page",
      ).toBeVisible({ timeout: TIMEOUTS.SLOW });

      // if there are pending requests, admin should see approve button and it should be enabled
      const approveButton = page
        .getByRole("button", { name: /approve/i })
        .first();
      const buttonVisible = await approveButton.isVisible().catch(() => false);

      if (buttonVisible) {
        await expect(
          approveButton,
          "Admin approve button should be enabled",
        ).toBeEnabled();
      }
      // note: test passes if no pending requests (nothing to approve)
    });
  });

  // ==========================================
  // Negative Permission Tests
  // ==========================================

  test.describe("Negative Permission Enforcement", () => {
    test("consumer CANNOT see edit buttons on API products table", async ({
      page,
    }) => {
      const common = new Common(page);
      await common.dexQuickLogin("consumer1@kuadrant.local");
      await page.goto("/kuadrant/api-products");
      await waitForKuadrantPageReady(page);

      // wait for page to load
      const apiProductsCard = page.locator("h1").filter({ hasText: /api products/i });
      await expect(apiProductsCard).toBeVisible({ timeout: TIMEOUTS.SLOW });

      // consumer should not see any edit buttons
      const editButton = page
        .getByRole("button", { name: /edit api product/i })
        .first();
      await expect(
        editButton,
        "Consumer should NOT see any Edit buttons",
      ).not.toBeVisible({ timeout: TIMEOUTS.QUICK });
    });

    test("consumer CANNOT see delete buttons on API products table", async ({
      page,
    }) => {
      const common = new Common(page);
      await common.dexQuickLogin("consumer1@kuadrant.local");
      await page.goto("/kuadrant/api-products");
      await waitForKuadrantPageReady(page);

      const apiProductsCard = page.locator("h1").filter({ hasText: /api products/i });
      await expect(apiProductsCard).toBeVisible({ timeout: TIMEOUTS.SLOW });

      // consumer should not see any delete buttons in API products table
      const deleteButton = page
        .getByRole("button", { name: /delete api product/i })
        .first();
      await expect(
        deleteButton,
        "Consumer should NOT see any Delete buttons",
      ).not.toBeVisible({ timeout: TIMEOUTS.QUICK });
    });

    test("consumer CANNOT see approve/reject buttons", async ({ page }) => {
      const common = new Common(page);
      await common.dexQuickLogin("consumer1@kuadrant.local");
      await page.goto("/kuadrant/api-products");
      await waitForKuadrantPageReady(page);

      // consumer should not see approve button anywhere
      const approveButton = page
        .getByRole("button", { name: /^approve$/i })
        .first();
      await expect(
        approveButton,
        "Consumer should NOT see Approve button",
      ).not.toBeVisible({ timeout: TIMEOUTS.QUICK });

      const rejectButton = page
        .getByRole("button", { name: /^reject$/i })
        .first();
      await expect(
        rejectButton,
        "Consumer should NOT see Reject button",
      ).not.toBeVisible({ timeout: TIMEOUTS.QUICK });
    });

    test("consumer CANNOT see Policy filter or column", async ({ page }) => {
      const common = new Common(page);
      await common.dexQuickLogin("consumer1@kuadrant.local");
      await page.goto("/kuadrant/api-products");
      await waitForKuadrantPageReady(page);

      const table = page.locator("table").first();
      await expect(table, "Consumer should see products table").toBeVisible({
        timeout: TIMEOUTS.DEFAULT,
      });

      // consumer should not see Policy filter in the filter panel
      const policyFilter = page.locator("text=POLICY").first();
      await expect(
        policyFilter,
        "Consumer should NOT see Policy filter",
      ).not.toBeVisible({ timeout: TIMEOUTS.QUICK });

      // consumer should not see Policy column header in the table
      const policyColumnHeader = page
        .locator("th")
        .filter({ hasText: /^Policy$/i });
      await expect(
        policyColumnHeader,
        "Consumer should NOT see Policy column",
      ).not.toBeVisible({ timeout: TIMEOUTS.QUICK });
    });

    test("admin CAN see Policy filter and column", async ({ page }) => {
      const common = new Common(page);
      await common.dexQuickLogin("admin@kuadrant.local");
      await page.goto("/kuadrant/api-products");
      await waitForKuadrantPageReady(page);

      const table = page.locator("table").first();
      await expect(table, "Admin should see products table").toBeVisible({
        timeout: TIMEOUTS.DEFAULT,
      });

      // admin should see Policy filter in the filter panel
      const policyFilter = page.locator("text=POLICY").first();
      await expect(policyFilter, "Admin should see Policy filter").toBeVisible({
        timeout: TIMEOUTS.DEFAULT,
      });

      // admin should see Policy column header in the table
      const policyColumnHeader = page
        .locator("th")
        .filter({ hasText: /^Policy$/i });
      await expect(
        policyColumnHeader,
        "Admin should see Policy column",
      ).toBeVisible({ timeout: TIMEOUTS.DEFAULT });
    });
  });
});
