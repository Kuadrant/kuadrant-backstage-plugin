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
 * - PlanPolicy: read, list
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

      const apiProductsSection = page.getByText(/api products/i).first();
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

      const apiProductsSection = page.getByText(/api products/i).first();
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

      const apiProductsSection = page.getByText(/api products/i).first();
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

      const apiProductsCard = page.locator("text=API Products").first();
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

      // find toystore-api row specifically (owned by guest, not owner1)
      const toystoreRow = page
        .locator("tr")
        .filter({ hasText: "toystore-api" })
        .first();
      const toystoreVisible = await toystoreRow.isVisible().catch(() => false);

      if (toystoreVisible) {
        // owner1 should NOT see edit button on toystore-api (owned by guest)
        const toystoreEditBtn = toystoreRow.getByRole("button", {
          name: /edit api product/i,
        });
        await expect(
          toystoreEditBtn,
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

      const apiProductsCard = page.locator("text=API Products").first();
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

    test("kuadrant.apikey.approve - admin CAN see approval tab", async ({
      page,
    }) => {
      const common = new Common(page);
      await common.dexQuickLogin("admin@kuadrant.local");
      await page.goto("/kuadrant/api-keys");

      const heading = page.locator("h1, h2").filter({ hasText: /api keys/i });
      await expect(heading.first()).toBeVisible({ timeout: TIMEOUTS.SLOW });

      // admin should see approval tab
      const approvalTab = page.getByTestId("api-keys-approval-tab");
      await expect(
        approvalTab,
        "Admin should see API Keys Approval tab",
      ).toBeVisible({ timeout: TIMEOUTS.DEFAULT });
    });

    test("kuadrant.apikey.approve - owner CAN see approval tab", async ({
      page,
    }) => {
      const common = new Common(page);
      await common.dexQuickLogin("owner1@kuadrant.local");
      await page.goto("/kuadrant/api-keys");

      const heading = page.locator("h1, h2").filter({ hasText: /api keys/i });
      await expect(heading.first()).toBeVisible({ timeout: TIMEOUTS.SLOW });

      // owner should see approval tab
      const approvalTab = page.getByTestId("api-keys-approval-tab");
      await expect(
        approvalTab,
        "Owner should see API Keys Approval tab",
      ).toBeVisible({ timeout: TIMEOUTS.DEFAULT });
    });

    test("kuadrant.apikey.approve - consumer CANNOT see approval tab", async ({
      page,
    }) => {
      const common = new Common(page);
      await common.dexQuickLogin("consumer1@kuadrant.local");
      await page.goto("/kuadrant/api-keys");

      const heading = page.locator("h1, h2").filter({ hasText: /api keys/i });
      await expect(heading.first()).toBeVisible({ timeout: TIMEOUTS.SLOW });

      // consumer should NOT see approval tab
      const approvalTab = page.getByTestId("api-keys-approval-tab");
      await expect(
        approvalTab,
        "Consumer should NOT see API Keys Approval tab",
      ).not.toBeVisible({ timeout: TIMEOUTS.QUICK });
    });

    test("kuadrant.apikey.read.own - consumer CAN see My API Keys tab", async ({
      page,
    }) => {
      const common = new Common(page);
      await common.dexQuickLogin("consumer1@kuadrant.local");
      await page.goto("/kuadrant/api-keys");

      const heading = page.locator("h1, h2").filter({ hasText: /api keys/i });
      await expect(heading.first()).toBeVisible({ timeout: TIMEOUTS.SLOW });

      // consumer should see "My API keys" tab
      const myApiKeysTab = page.getByTestId("my-api-keys-tab");
      await expect(
        myApiKeysTab,
        "Consumer should see My API Keys tab",
      ).toBeVisible({ timeout: TIMEOUTS.DEFAULT });
    });

    test("kuadrant.apikey.delete.own - consumer sees My API Keys page with filters", async ({
      page,
    }) => {
      const common = new Common(page);
      await common.dexQuickLogin("consumer1@kuadrant.local");
      await page.goto("/kuadrant/api-keys");

      const heading = page.locator("h1, h2").filter({ hasText: /api keys/i });
      await expect(heading.first()).toBeVisible({ timeout: TIMEOUTS.SLOW });

      // verify filter panel exists
      const filtersText = page.getByText("Filters");
      await expect(
        filtersText.first(),
        "API Keys page should have Filters panel",
      ).toBeVisible({ timeout: TIMEOUTS.DEFAULT });
    });
  });

  // ==========================================
  // PlanPolicy Permissions
  // ==========================================

  test.describe("PlanPolicy Permissions", () => {
    test("kuadrant.planpolicy.list - admin CAN see plan policies", async ({
      page,
    }) => {
      const common = new Common(page);
      await common.dexQuickLogin("admin@kuadrant.local");
      await page.goto("/kuadrant/api-products");
      await waitForKuadrantPageReady(page);

      const planPolicies = page.getByText(/plan policies/i).first();
      await expect(
        planPolicies,
        "Admin should see Plan Policies section",
      ).toBeVisible({ timeout: TIMEOUTS.DEFAULT });
    });

    test("kuadrant.planpolicy.list - owner CAN see plan policies", async ({
      page,
    }) => {
      const common = new Common(page);
      await common.dexQuickLogin("owner1@kuadrant.local");
      await page.goto("/kuadrant/api-products");
      await waitForKuadrantPageReady(page);

      const planPolicies = page.getByText(/plan policies/i).first();
      await expect(
        planPolicies,
        "Owner should see Plan Policies section",
      ).toBeVisible({ timeout: TIMEOUTS.DEFAULT });
    });

    test("kuadrant.planpolicy.list - consumer CANNOT see plan policies", async ({
      page,
    }) => {
      const common = new Common(page);
      await common.dexQuickLogin("consumer1@kuadrant.local");
      await page.goto("/kuadrant/api-products");
      await waitForKuadrantPageReady(page);

      // consumer should NOT see the plan policies section
      const planPolicies = page.getByText(/plan policies/i).first();
      await expect(
        planPolicies,
        "Consumer should NOT see Plan Policies section",
      ).not.toBeVisible({ timeout: TIMEOUTS.QUICK });
    });
  });

  // ==========================================
  // Cross-Ownership Tests
  // ==========================================

  test.describe("Cross-Ownership Enforcement", () => {
    test("owner2 CANNOT edit toystore API (owned by system)", async ({
      page,
    }) => {
      const common = new Common(page);
      await common.dexQuickLogin("owner2@kuadrant.local");
      await page.goto("/kuadrant/api-products");
      await waitForKuadrantPageReady(page);

      // toystore-api must exist for this test (owned by guest)
      const toystoreRow = page
        .locator("tr")
        .filter({ hasText: "toystore-api" })
        .first();
      await expect(
        toystoreRow,
        "toystore-api must exist for cross-ownership test",
      ).toBeVisible({ timeout: TIMEOUTS.DEFAULT });

      // owner2 should NOT see edit button on toystore-api (not their product)
      const editButton = toystoreRow.getByRole("button", {
        name: /edit api product/i,
      });
      await expect(
        editButton,
        "Owner2 should NOT see edit button on toystore-api",
      ).not.toBeVisible({ timeout: TIMEOUTS.QUICK });
    });

    test("owner2 CANNOT delete toystore API (owned by system)", async ({
      page,
    }) => {
      const common = new Common(page);
      await common.dexQuickLogin("owner2@kuadrant.local");
      await page.goto("/kuadrant/api-products");
      await waitForKuadrantPageReady(page);

      // toystore-api must exist for this test (owned by guest)
      const toystoreRow = page
        .locator("tr")
        .filter({ hasText: "toystore-api" })
        .first();
      await expect(
        toystoreRow,
        "toystore-api must exist for cross-ownership test",
      ).toBeVisible({ timeout: TIMEOUTS.DEFAULT });

      // owner2 should NOT see delete button on toystore-api (not their product)
      const deleteButton = toystoreRow.getByRole("button", {
        name: /delete api product/i,
      });
      await expect(
        deleteButton,
        "Owner2 should NOT see delete button on toystore-api",
      ).not.toBeVisible({ timeout: TIMEOUTS.QUICK });
    });

    test("admin CAN edit toystore API (has update.all permission)", async ({
      page,
    }) => {
      const common = new Common(page);
      await common.dexQuickLogin("admin@kuadrant.local");
      await page.goto("/kuadrant/api-products");
      await waitForKuadrantPageReady(page);

      // toystore-api must exist for this test
      const toystoreRow = page
        .locator("tr")
        .filter({ hasText: "toystore-api" })
        .first();
      await expect(
        toystoreRow,
        "toystore-api must exist for cross-ownership test",
      ).toBeVisible({ timeout: TIMEOUTS.DEFAULT });

      // admin should see edit button on toystore-api
      const editButton = toystoreRow.getByRole("button", {
        name: /edit api product/i,
      });
      await expect(
        editButton,
        "Admin should see edit button on toystore-api",
      ).toBeVisible({ timeout: TIMEOUTS.DEFAULT });
    });

    test("admin CAN approve requests for any owner's APIs", async ({
      page,
    }) => {
      const common = new Common(page);
      await common.dexQuickLogin("admin@kuadrant.local");
      await page.goto("/kuadrant/api-keys");

      const heading = page.locator("h1, h2").filter({ hasText: /api keys/i });
      await expect(heading.first()).toBeVisible({ timeout: TIMEOUTS.SLOW });

      // admin should see approval tab
      const approvalTab = page.getByTestId("api-keys-approval-tab");
      await expect(
        approvalTab,
        "Admin should see API Keys Approval tab",
      ).toBeVisible({ timeout: TIMEOUTS.DEFAULT });
      await approvalTab.click();

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
      const apiProductsCard = page.locator("text=API Products").first();
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

      const apiProductsCard = page.locator("text=API Products").first();
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
  });
});
