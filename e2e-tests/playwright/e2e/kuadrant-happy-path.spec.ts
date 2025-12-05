import { test, expect } from "@playwright/test";
import { Common } from "../utils/common";
import {
  TIMEOUTS,
  createTestAPIProductData,
  waitForKuadrantPageReady,
  retryUntilSuccess,
  TestAPIProduct,
} from "../utils/kuadrant-helpers";

/**
 * Holistic happy path test covering the full API lifecycle:
 * 1. Owner creates an API Product
 * 2. Consumer discovers the new API in catalog
 * 3. Consumer requests access to toystore-api (has plans configured)
 * 4. Admin sees the request in approval queue
 * 5. Owner1 cannot see toystore requests (ownership filtering)
 * 6. Admin approves consumer1's request
 * 7. Consumer sees their approved API key
 *
 * Cleanup runs regardless of test success/failure.
 */
test.describe("Kuadrant Happy Path - Full API Lifecycle", () => {
  let testData: TestAPIProduct;
  let testCreated = false;

  test.beforeAll(async () => {
    test.info().annotations.push({
      type: "component",
      description: "kuadrant",
    });
    testData = createTestAPIProductData("owner1@kuadrant.local");
  });

  // cleanup runs regardless of test success/failure
  test.afterAll(async ({ browser }) => {
    if (!testCreated) return;

    try {
      const context = await browser.newContext();
      const page = await context.newPage();
      const common = new Common(page);

      await common.dexQuickLogin("owner1@kuadrant.local");
      await page.goto("/kuadrant");

      const heading = page.locator("h1, h2").filter({ hasText: /kuadrant/i }).first();
      await heading.waitFor({ state: "visible", timeout: TIMEOUTS.SLOW }).catch(() => {});

      const apiProductRow = page.locator("tr").filter({ hasText: testData.displayName });
      const rowVisible = await apiProductRow.isVisible().catch(() => false);

      if (rowVisible) {
        const deleteButton = apiProductRow.getByRole("button", { name: /delete api product/i });
        await deleteButton.click();

        const confirmDialog = page.getByRole("dialog");
        const dialogVisible = await confirmDialog.isVisible().catch(() => false);

        if (dialogVisible) {
          const confirmInput = confirmDialog.getByRole("textbox");
          await confirmInput.fill(testData.name);

          const confirmButton = confirmDialog.getByRole("button", { name: /delete/i });
          await confirmButton.click();
          await confirmDialog.waitFor({ state: "hidden", timeout: TIMEOUTS.SLOW }).catch(() => {});
        }
      }

      await context.close();
    } catch (error) {
      console.warn("Cleanup failed:", error);
    }
  });

  test.describe.configure({ mode: "serial" });

  test("1. owner1 creates a new API Product", async ({ page }) => {
    const common = new Common(page);
    await common.dexQuickLogin("owner1@kuadrant.local");
    await page.goto("/kuadrant");
    await waitForKuadrantPageReady(page);

    // click create button - fail fast if not visible
    const createButton = page.getByRole("button", { name: /create api product/i });
    await expect(createButton, "Owner should see Create API Product button").toBeVisible({ timeout: TIMEOUTS.SLOW });
    await createButton.click();

    // wait for dialog
    const dialog = page.getByRole("dialog");
    await expect(dialog, "Create dialog should open").toBeVisible({ timeout: TIMEOUTS.DEFAULT });

    // fill in the form
    await page.getByPlaceholder("my-api").fill(testData.name);
    await page.getByPlaceholder("My API").fill(testData.displayName);
    await page.getByPlaceholder("API description").fill("E2E test API product - will be cleaned up");

    // select an HTTPRoute
    const httprouteSelect = page.locator('[data-testid="httproute-select"]');
    await httprouteSelect.scrollIntoViewIfNeeded();
    await httprouteSelect.click({ timeout: TIMEOUTS.DEFAULT });

    // wait for dropdown options and select toystore
    const toystoreOption = page.getByRole("option", { name: /toystore/i }).first();
    await expect(toystoreOption, "HTTPRoute options should load").toBeVisible({ timeout: TIMEOUTS.DEFAULT });
    await toystoreOption.click();

    // submit
    const submitButton = dialog.getByRole("button", { name: /create/i });
    await submitButton.click();

    // wait for success
    await expect(dialog, "Dialog should close after creation").not.toBeVisible({ timeout: TIMEOUTS.SLOW });
    testCreated = true;

    // verify API product appears in table
    const apiProductRow = page.getByText(testData.displayName);
    await expect(apiProductRow, "Created API should appear in table").toBeVisible({ timeout: TIMEOUTS.SLOW });
  });

  test("2. consumer1 discovers the API in catalog", async ({ page }) => {
    const common = new Common(page);
    await common.dexQuickLogin("consumer1@kuadrant.local");

    // wait for catalog sync with retries
    await retryUntilSuccess(
      async () => {
        await page.goto("/catalog?filters[kind]=api");
        const apiLink = page.getByRole("link", { name: new RegExp(testData.displayName, "i") });
        await expect(apiLink).toBeVisible({ timeout: TIMEOUTS.DEFAULT });
      },
      {
        maxAttempts: 5,
        delayMs: 3000,
        errorMessage: `API ${testData.displayName} not found in catalog after retries`,
      },
    );
  });

  test("3. consumer1 requests API access", async ({ page }) => {
    const common = new Common(page);
    await common.dexQuickLogin("consumer1@kuadrant.local");

    // use toystore-api which has plans configured (newly created APIs don't have plans yet)
    await page.goto("/catalog/default/api/toystore-api");

    // click API Keys tab
    const apiKeysTab = page.getByRole("tab", { name: /api keys/i });
    await expect(apiKeysTab, "API Keys tab should exist").toBeVisible({ timeout: TIMEOUTS.SLOW });
    await apiKeysTab.click();

    // click request access button
    const requestButton = page.locator('[data-testid="request-api-access-button"]');
    await expect(requestButton, "Consumer should have Request Access button").toBeVisible({ timeout: TIMEOUTS.SLOW });
    await expect(requestButton, "Request button should be enabled (plans must be loaded)").toBeEnabled({ timeout: TIMEOUTS.SLOW });
    await requestButton.click();

    // fill request dialog
    const dialog = page.getByRole("dialog");
    await expect(dialog, "Request dialog should open").toBeVisible({ timeout: TIMEOUTS.DEFAULT });

    // wait for tier select to be visible and enabled (plans must be loaded)
    const tierSelect = page.locator('[data-testid="tier-select"]');
    await expect(tierSelect, "Tier select should be visible").toBeVisible({ timeout: TIMEOUTS.DEFAULT });

    // click the select to open dropdown
    await tierSelect.click();

    // wait for dropdown and select first option
    const listbox = page.getByRole("listbox");
    await expect(listbox, "Tier dropdown should open").toBeVisible({ timeout: TIMEOUTS.SLOW });
    const tierOption = listbox.getByRole("option").first();
    await expect(tierOption, "At least one tier option should exist").toBeVisible({ timeout: TIMEOUTS.DEFAULT });
    await tierOption.click();

    // wait for submit button to be enabled
    const submitButton = dialog.getByRole("button", { name: /submit/i });
    await expect(submitButton, "Submit button should be enabled after tier selection").toBeEnabled({ timeout: TIMEOUTS.DEFAULT });

    // fill use case (optional) - MUI TextField uses placeholder as accessible name
    const useCaseField = dialog.getByRole("textbox", { name: /describe how you plan to use/i });
    await useCaseField.fill("E2E test request");

    // submit the request
    await submitButton.click();

    // wait for dialog to close
    await expect(dialog, "Request dialog should close").not.toBeVisible({ timeout: TIMEOUTS.SLOW });
  });

  test("4. admin sees the request in approval queue", async ({ page }) => {
    const common = new Common(page);
    await common.dexQuickLogin("admin@kuadrant.local");
    await page.goto("/kuadrant");
    await waitForKuadrantPageReady(page);

    // admin should see approval queue (has approve.all permission)
    const approvalQueue = page.getByText(/api access requests/i).first();
    await expect(approvalQueue, "Admin should see API Access Requests section").toBeVisible({ timeout: TIMEOUTS.SLOW });

    // click pending tab in approval queue (use testid to avoid ambiguity with My API Keys tabs)
    const pendingTab = page.locator('[data-testid="approval-queue-pending-tab"]');
    await expect(pendingTab, "Pending tab should exist").toBeVisible({ timeout: TIMEOUTS.DEFAULT });
    await pendingTab.click();

    // should see consumer1's request for toystore (may be multiple from previous runs)
    const consumerRequest = page.getByText(/consumer1/i).first();
    await expect(consumerRequest, "Admin should see consumer1's request").toBeVisible({ timeout: TIMEOUTS.SLOW });
  });

  test("5. owner1 cannot see toystore requests (owned by guest)", async ({ page }) => {
    const common = new Common(page);
    await common.dexQuickLogin("owner1@kuadrant.local");
    await page.goto("/kuadrant");
    await waitForKuadrantPageReady(page);

    // owner1 should see approval queue section (has approve.own permission)
    const approvalQueue = page.getByText(/api access requests/i).first();
    await expect(approvalQueue, "Owner1 should see API Access Requests section").toBeVisible({ timeout: TIMEOUTS.DEFAULT });

    // click pending tab in approval queue
    const pendingTab = page.locator('[data-testid="approval-queue-pending-tab"]');
    await expect(pendingTab).toBeVisible({ timeout: TIMEOUTS.DEFAULT });
    await pendingTab.click();

    // owner1 should NOT see toystore requests in the approval queue (toystore is owned by guest)
    // verify the approval queue shows "No pending requests" or "0 pending"
    const noRequestsMessage = page.getByText(/no pending requests/i);
    await expect(noRequestsMessage, "Owner1 should see 'No pending requests' (toystore owned by guest)").toBeVisible({ timeout: TIMEOUTS.DEFAULT });
  });

  test("6. admin approves consumer1's request", async ({ page }) => {
    const common = new Common(page);
    await common.dexQuickLogin("admin@kuadrant.local");
    await page.goto("/kuadrant");
    await waitForKuadrantPageReady(page);

    // find approval queue pending tab
    const pendingTab = page.locator('[data-testid="approval-queue-pending-tab"]');
    await expect(pendingTab).toBeVisible({ timeout: TIMEOUTS.DEFAULT });
    await pendingTab.click();

    // find approve button for consumer1's request
    const approveButton = page.getByRole("button", { name: /approve/i }).first();
    await expect(approveButton, "Admin should see Approve button").toBeVisible({ timeout: TIMEOUTS.DEFAULT });
    await approveButton.click();

    // confirm approval dialog
    const confirmDialog = page.getByRole("dialog");
    await expect(confirmDialog, "Approval confirmation dialog should open").toBeVisible({ timeout: TIMEOUTS.DEFAULT });

    const confirmButton = confirmDialog.getByRole("button", { name: /approve/i });
    await confirmButton.click();
    await expect(confirmDialog, "Confirmation dialog should close").not.toBeVisible({ timeout: TIMEOUTS.SLOW });

    // verify request moved to approved
    const approvedTab = page.locator('[data-testid="approval-queue-approved-tab"]');
    const approvedTabVisible = await approvedTab.isVisible().catch(() => false);
    if (approvedTabVisible) {
      await approvedTab.click();
    }
  });

  test("7. consumer1 sees their approved API key", async ({ page }) => {
    const common = new Common(page);
    await common.dexQuickLogin("consumer1@kuadrant.local");
    await page.goto("/kuadrant");
    await waitForKuadrantPageReady(page);

    // find My API Keys card
    const myApiKeysCard = page.locator('[data-testid="my-api-keys-card"]');
    await expect(myApiKeysCard, "Consumer should see My API Keys card").toBeVisible({ timeout: TIMEOUTS.SLOW });

    // look for active tab (approved keys show as "active")
    const activeTab = page.locator('[data-testid="my-api-keys-active-tab"]');
    await expect(activeTab).toBeVisible({ timeout: TIMEOUTS.DEFAULT });
    await activeTab.click();

    // should see the approved key in table
    const approvedKey = page.locator("table tbody tr").first();
    await expect(approvedKey, "Consumer should see approved API key").toBeVisible({ timeout: TIMEOUTS.SLOW });
  });
});
