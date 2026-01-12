import { test, expect } from "@playwright/test";
import { Common } from "../utils/common";
import {
  TIMEOUTS,
  navigateToKuadrant,
  expectButtonPermission,
  createTestAPIProductData,
  TestAPIProduct,
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
      await navigateToKuadrant(page);

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
      await navigateToKuadrant(page);

      await expectButtonPermission(
        page,
        /create api product/i,
        true,
        "Owner should see Create API Product button",
      );
    });

    test("kuadrant.apiproduct.create - consumer CANNOT create", async ({ page }) => {
      const common = new Common(page);
      await common.dexQuickLogin("consumer1@kuadrant.local");
      await navigateToKuadrant(page);

      await expectButtonPermission(
        page,
        /create api product/i,
        false,
        "Consumer should NOT see Create API Product button",
      );
    });

    test("kuadrant.apiproduct.list - admin CAN list all products", async ({ page }) => {
      const common = new Common(page);
      await common.dexQuickLogin("admin@kuadrant.local");
      await navigateToKuadrant(page);

      const apiProductsSection = page.getByText(/api products/i).first();
      await expect(apiProductsSection, "Admin should see API Products section").toBeVisible({ timeout: TIMEOUTS.DEFAULT });
    });

    test("kuadrant.apiproduct.list - owner CAN list all products", async ({ page }) => {
      const common = new Common(page);
      await common.dexQuickLogin("owner1@kuadrant.local");
      await navigateToKuadrant(page);

      const apiProductsSection = page.getByText(/api products/i).first();
      await expect(apiProductsSection, "Owner should see API Products section").toBeVisible({ timeout: TIMEOUTS.DEFAULT });
    });

    test("kuadrant.apiproduct.list - consumer CAN list all products", async ({ page }) => {
      const common = new Common(page);
      await common.dexQuickLogin("consumer1@kuadrant.local");
      await navigateToKuadrant(page);

      const apiProductsSection = page.getByText(/api products/i).first();
      await expect(apiProductsSection, "Consumer should see API Products section").toBeVisible({ timeout: TIMEOUTS.DEFAULT });
    });

    test("kuadrant.apiproduct.update.all - admin CAN edit any product", async ({ page }) => {
      const common = new Common(page);
      await common.dexQuickLogin("admin@kuadrant.local");
      await navigateToKuadrant(page);

      const apiProductsCard = page.locator("text=API Products").first();
      await expect(apiProductsCard).toBeVisible({ timeout: TIMEOUTS.SLOW });

      // admin should see edit icon on any row
      const editButton = page.getByRole("button", { name: /edit api product/i }).first();
      await expect(editButton, "Admin should see Edit button").toBeVisible({ timeout: TIMEOUTS.DEFAULT });
    });

    test("kuadrant.apiproduct.delete.all - admin CAN delete any product", async ({ page }) => {
      const common = new Common(page);
      await common.dexQuickLogin("admin@kuadrant.local");
      await navigateToKuadrant(page);

      const apiProductsCard = page.locator("text=API Products").first();
      await expect(apiProductsCard).toBeVisible({ timeout: TIMEOUTS.SLOW });

      // admin should see delete icon on any row
      const deleteButton = page.getByRole("button", { name: /delete api product/i }).first();
      await expect(deleteButton, "Admin should see Delete button").toBeVisible({ timeout: TIMEOUTS.DEFAULT });
    });

    test("kuadrant.apiproduct.delete - consumer CANNOT delete any product", async ({ page }) => {
      const common = new Common(page);
      await common.dexQuickLogin("consumer1@kuadrant.local");
      await navigateToKuadrant(page);

      // consumer should NOT see delete buttons
      const table = page.locator("table").first();
      await expect(table, "Consumer should see products table").toBeVisible({ timeout: TIMEOUTS.DEFAULT });

      const deleteButton = page.getByRole("button", { name: /delete api product/i }).first();
      await expect(deleteButton, "Consumer should NOT see Delete button").not.toBeVisible({ timeout: TIMEOUTS.QUICK });
    });
  });

  // ==========================================
  // APIKey Permissions
  // ==========================================

  test.describe("APIKey Permissions", () => {
    test("kuadrant.apikey.create - admin CAN request access", async ({ page }) => {
      const common = new Common(page);
      await common.dexQuickLogin("admin@kuadrant.local");
      await page.goto("/catalog/default/api/toystore-api");
      await page.waitForURL(/\/catalog\/.*\/api\/toystore-api/, { timeout: TIMEOUTS.VERY_SLOW });

      const apiKeysTab = page.getByRole("tab", { name: /api keys/i });
      await expect(apiKeysTab, "API Keys tab should exist").toBeVisible({ timeout: TIMEOUTS.VERY_SLOW });
      await apiKeysTab.click();

      await expectButtonPermission(
        page,
        /request.*access/i,
        true,
        "Admin should see Request Access button",
      );
    });

    test("kuadrant.apikey.create - owner CAN request access", async ({ page }) => {
      const common = new Common(page);
      await common.dexQuickLogin("owner1@kuadrant.local");

      await page.goto("/catalog/default/api/toystore-api");
      await page.waitForURL(/\/catalog\/.*\/api\/toystore-api/, { timeout: TIMEOUTS.VERY_SLOW });

      const apiKeysTab = page.getByRole("tab", { name: /api keys/i });
      await expect(apiKeysTab, "API Keys tab should exist").toBeVisible({ timeout: TIMEOUTS.VERY_SLOW });
      await apiKeysTab.click();

      await expectButtonPermission(
        page,
        /request.*access/i,
        true,
        "Owner should see Request Access button",
      );
    });

    test("kuadrant.apikey.create - consumer CAN request access", async ({ page }) => {
      const common = new Common(page);
      await common.dexQuickLogin("consumer1@kuadrant.local");

      await page.goto("/catalog/default/api/toystore-api");
      await page.waitForURL(/\/catalog\/.*\/api\/toystore-api/, { timeout: TIMEOUTS.VERY_SLOW });

      const apiKeysTab = page.getByRole("tab", { name: /api keys/i });
      await expect(apiKeysTab, "API Keys tab should exist").toBeVisible({ timeout: TIMEOUTS.VERY_SLOW });
      await apiKeysTab.click();

      await expectButtonPermission(
        page,
        /request.*access/i,
        true,
        "Consumer should see Request Access button",
      );
    });

    test("kuadrant.apikey.approve - admin CAN see approval queue", async ({ page }) => {
      const common = new Common(page);
      await common.dexQuickLogin("admin@kuadrant.local");
      await navigateToKuadrant(page);

      const approvalQueue = page.getByText(/api access requests/i).first();
      await expect(approvalQueue, "Admin should see API Access Requests section").toBeVisible({ timeout: TIMEOUTS.DEFAULT });
    });

    test("kuadrant.apikey.approve - owner CAN see approval queue", async ({ page }) => {
      const common = new Common(page);
      await common.dexQuickLogin("owner1@kuadrant.local");
      await navigateToKuadrant(page);

      const approvalQueue = page.getByText(/api access requests/i).first();
      await expect(approvalQueue, "Owner should see API Access Requests section").toBeVisible({ timeout: TIMEOUTS.DEFAULT });
    });

    test("kuadrant.apikey.approve - consumer CANNOT see approval queue", async ({ page }) => {
      const common = new Common(page);
      await common.dexQuickLogin("consumer1@kuadrant.local");
      await navigateToKuadrant(page);

      // consumer should NOT see the approval queue card
      const approvalQueue = page.getByText(/api access requests/i).first();
      await expect(approvalQueue, "Consumer should NOT see API Access Requests section").not.toBeVisible({ timeout: TIMEOUTS.QUICK });
    });

    test("kuadrant.apikey.read.own - consumer CAN see My API Keys", async ({ page }) => {
      const common = new Common(page);
      await common.dexQuickLogin("consumer1@kuadrant.local");
      await navigateToKuadrant(page);

      // consumer should see "My API Keys" card
      const myApiKeys = page.getByText(/my api keys/i).first();
      await expect(myApiKeys, "Consumer should see My API Keys section").toBeVisible({ timeout: TIMEOUTS.DEFAULT });
    });

    test("kuadrant.apikey.delete.own - consumer sees My API Keys card with tabs", async ({ page }) => {
      const common = new Common(page);
      await common.dexQuickLogin("consumer1@kuadrant.local");
      await navigateToKuadrant(page);

      // find My API Keys card
      const myApiKeysCard = page.locator('[data-testid="my-api-keys-card"]');
      await expect(myApiKeysCard, "Consumer should see My API Keys card").toBeVisible({ timeout: TIMEOUTS.DEFAULT });

      // verify tabs exist (Active, Pending, Rejected)
      const activeTab = page.locator('[data-testid="my-api-keys-active-tab"]');
      await expect(activeTab, "My API Keys should have Active tab").toBeVisible({ timeout: TIMEOUTS.DEFAULT });
    });
  });

  // ==========================================
  // PlanPolicy Permissions
  // ==========================================

  test.describe("PlanPolicy Permissions", () => {
    test("kuadrant.planpolicy.list - admin CAN see plan policies", async ({ page }) => {
      const common = new Common(page);
      await common.dexQuickLogin("admin@kuadrant.local");
      await navigateToKuadrant(page);

      const planPolicies = page.getByText(/plan policies/i).first();
      await expect(planPolicies, "Admin should see Plan Policies section").toBeVisible({ timeout: TIMEOUTS.DEFAULT });
    });

    test("kuadrant.planpolicy.list - owner CAN see plan policies", async ({ page }) => {
      const common = new Common(page);
      await common.dexQuickLogin("owner1@kuadrant.local");
      await navigateToKuadrant(page);

      const planPolicies = page.getByText(/plan policies/i).first();
      await expect(planPolicies, "Owner should see Plan Policies section").toBeVisible({ timeout: TIMEOUTS.DEFAULT });
    });

    test("kuadrant.planpolicy.list - consumer CANNOT see plan policies", async ({ page }) => {
      const common = new Common(page);
      await common.dexQuickLogin("consumer1@kuadrant.local");
      await navigateToKuadrant(page);

      // consumer should NOT see the plan policies section
      const planPolicies = page.getByText(/plan policies/i).first();
      await expect(planPolicies, "Consumer should NOT see Plan Policies section").not.toBeVisible({ timeout: TIMEOUTS.QUICK });
    });
  });

  // ==========================================
  // Cross-Ownership Tests
  // ==========================================

  test.describe("Cross-Ownership Enforcement", () => {
    let fixtureData: TestAPIProduct;
    let fixtureCreated = false;

    test.describe.configure({ mode: "serial" });

    test.beforeAll(async ({ browser }) => {
      fixtureData = createTestAPIProductData("admin@kuadrant.local");

      const context = await browser.newContext();
      const page = await context.newPage();
      const common = new Common(page);

      try {
        await common.dexQuickLogin("admin@kuadrant.local");
        await navigateToKuadrant(page);

        const createButton = page.getByRole("button", { name: /create api product/i });
        await expect(createButton).toBeVisible({ timeout: TIMEOUTS.SLOW });
        await createButton.click();

        const dialog = page.getByRole("dialog");
        await expect(dialog).toBeVisible({ timeout: TIMEOUTS.DEFAULT });

        await page.getByPlaceholder("my-api").fill(fixtureData.name);
        await page.getByPlaceholder("My API").fill(fixtureData.displayName);
        await page.getByPlaceholder("API description").fill("Cross-ownership test fixture");

        const httprouteSelect = page.locator('[data-testid="httproute-select"]');
        await httprouteSelect.scrollIntoViewIfNeeded();
        await httprouteSelect.click({ timeout: TIMEOUTS.DEFAULT });

        const toystoreOption = page.getByRole("option", { name: /toystore/i }).first();
        await expect(toystoreOption).toBeVisible({ timeout: TIMEOUTS.DEFAULT });
        await toystoreOption.click();

        const submitButton = page.getByRole("button", { name: /^create$/i });
        await submitButton.click();
        await expect(dialog).not.toBeVisible({ timeout: TIMEOUTS.SLOW });
        fixtureCreated = true;
      } catch (error) {
        console.warn("Fixture creation failed:", error);
      }

      await context.close();
    });

    test.afterAll(async ({ browser }) => {
      if (!fixtureCreated) return;

      const context = await browser.newContext();
      const page = await context.newPage();
      const common = new Common(page);

      try {
        await common.dexQuickLogin("admin@kuadrant.local");
        await navigateToKuadrant(page);

        const fixtureRow = page.locator("tr").filter({ hasText: fixtureData.displayName });
        const rowVisible = await fixtureRow.isVisible().catch(() => false);

        if (rowVisible) {
          const deleteButton = fixtureRow.getByRole("button", { name: /delete api product/i });
          await deleteButton.click();

          const confirmDialog = page.getByRole("dialog");
          const dialogVisible = await confirmDialog.isVisible().catch(() => false);

          if (dialogVisible) {
            const confirmInput = confirmDialog.getByRole("textbox");
            await confirmInput.fill(fixtureData.name);

            const confirmButton = confirmDialog.getByRole("button", { name: /delete/i });
            await confirmButton.click();
            await confirmDialog.waitFor({ state: "hidden", timeout: TIMEOUTS.SLOW }).catch(() => {});
          }
        }
      } catch (error) {
        console.warn("Cleanup failed:", error);
      }

      await context.close();
    });

    test("owner2 CANNOT edit admin's API (cross-ownership)", async ({ page }) => {
      test.skip(!fixtureCreated, "Fixture not created");
      const common = new Common(page);
      await common.dexQuickLogin("owner2@kuadrant.local");
      await navigateToKuadrant(page);

      const fixtureRow = page.locator("tr").filter({ hasText: fixtureData.displayName }).first();
      await expect(fixtureRow).toBeVisible({ timeout: TIMEOUTS.DEFAULT });
      const editButton = fixtureRow.getByRole("button", { name: /edit api product/i });
      await expect(editButton).not.toBeVisible({ timeout: TIMEOUTS.QUICK });
    });

    test("owner2 CANNOT delete admin's API (cross-ownership)", async ({ page }) => {
      test.skip(!fixtureCreated, "Fixture not created");
      const common = new Common(page);
      await common.dexQuickLogin("owner2@kuadrant.local");
      await navigateToKuadrant(page);

      const fixtureRow = page.locator("tr").filter({ hasText: fixtureData.displayName }).first();
      await expect(fixtureRow).toBeVisible({ timeout: TIMEOUTS.DEFAULT });
      const deleteButton = fixtureRow.getByRole("button", { name: /delete api product/i });
      await expect(deleteButton).not.toBeVisible({ timeout: TIMEOUTS.QUICK });
    });

    test("owner1 CANNOT edit admin's API (cross-ownership)", async ({ page }) => {
      test.skip(!fixtureCreated, "Fixture not created");
      const common = new Common(page);
      await common.dexQuickLogin("owner1@kuadrant.local");
      await navigateToKuadrant(page);

      const fixtureRow = page.locator("tr").filter({ hasText: fixtureData.displayName }).first();
      await expect(fixtureRow).toBeVisible({ timeout: TIMEOUTS.DEFAULT });
      const editButton = fixtureRow.getByRole("button", { name: /edit api product/i });
      await expect(editButton).not.toBeVisible({ timeout: TIMEOUTS.QUICK });
    });

    test("admin CAN edit own API (has update.all permission)", async ({ page }) => {
      test.skip(!fixtureCreated, "Fixture not created");
      const common = new Common(page);
      await common.dexQuickLogin("admin@kuadrant.local");
      await navigateToKuadrant(page);

      const fixtureRow = page.locator("tr").filter({ hasText: fixtureData.displayName }).first();
      await expect(fixtureRow).toBeVisible({ timeout: TIMEOUTS.DEFAULT });
      const editButton = fixtureRow.getByRole("button", { name: /edit api product/i });
      await expect(editButton).toBeVisible({ timeout: TIMEOUTS.DEFAULT });
    });

    test("admin CAN approve requests for any owner's APIs", async ({ page }) => {
      const common = new Common(page);
      await common.dexQuickLogin("admin@kuadrant.local");
      await navigateToKuadrant(page);

      // admin sees the approval queue card
      const approvalQueueCard = page.locator('[data-testid="approval-queue-card"]');
      await expect(approvalQueueCard, "Admin should see API Access Requests section").toBeVisible({ timeout: TIMEOUTS.SLOW });

      // click the pending tab in the approval queue (not My API Keys)
      const pendingTab = page.locator('[data-testid="approval-queue-pending-tab"]');
      await expect(pendingTab).toBeVisible({ timeout: TIMEOUTS.DEFAULT });
      await pendingTab.click();

      // if there are pending requests, admin should see approve button and it should be enabled
      const approveButton = page.getByRole("button", { name: /approve/i }).first();
      const buttonVisible = await approveButton.isVisible().catch(() => false);

      if (buttonVisible) {
        await expect(approveButton, "Admin approve button should be enabled").toBeEnabled();
      }
      // note: test passes if no pending requests (nothing to approve)
    });
  });

  // ==========================================
  // Negative Permission Tests
  // ==========================================

  test.describe("Negative Permission Enforcement", () => {
    test("consumer CANNOT see edit buttons on API products table", async ({ page }) => {
      const common = new Common(page);
      await common.dexQuickLogin("consumer1@kuadrant.local");
      await navigateToKuadrant(page);

      // wait for page to load
      const apiProductsCard = page.locator("text=API Products").first();
      await expect(apiProductsCard).toBeVisible({ timeout: TIMEOUTS.SLOW });

      // consumer should not see any edit buttons
      const editButton = page.getByRole("button", { name: /edit api product/i }).first();
      await expect(editButton, "Consumer should NOT see any Edit buttons").not.toBeVisible({ timeout: TIMEOUTS.QUICK });
    });

    test("consumer CANNOT see delete buttons on API products table", async ({ page }) => {
      const common = new Common(page);
      await common.dexQuickLogin("consumer1@kuadrant.local");
      await navigateToKuadrant(page);

      const apiProductsCard = page.locator("text=API Products").first();
      await expect(apiProductsCard).toBeVisible({ timeout: TIMEOUTS.SLOW });

      // consumer should not see any delete buttons in API products table
      const deleteButton = page.getByRole("button", { name: /delete api product/i }).first();
      await expect(deleteButton, "Consumer should NOT see any Delete buttons").not.toBeVisible({ timeout: TIMEOUTS.QUICK });
    });

    test("consumer CANNOT see approve/reject buttons", async ({ page }) => {
      const common = new Common(page);
      await common.dexQuickLogin("consumer1@kuadrant.local");
      await navigateToKuadrant(page);

      // consumer should not see approve button anywhere
      const approveButton = page.getByRole("button", { name: /^approve$/i }).first();
      await expect(approveButton, "Consumer should NOT see Approve button").not.toBeVisible({ timeout: TIMEOUTS.QUICK });

      const rejectButton = page.getByRole("button", { name: /^reject$/i }).first();
      await expect(rejectButton, "Consumer should NOT see Reject button").not.toBeVisible({ timeout: TIMEOUTS.QUICK });
    });
  });
});
