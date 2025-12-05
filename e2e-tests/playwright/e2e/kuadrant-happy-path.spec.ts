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
 * 2. Consumer discovers and requests access
 * 3. Owner approves the request
 * 4. Consumer can see their approved key
 * 5. Cleanup (runs even if tests fail)
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
    await page.goto("/kuadrant");
    await waitForKuadrantPageReady(page);

    // find and click on the API product link
    const apiLink = page.getByRole("link", { name: new RegExp(testData.displayName, "i") }).first();
    await expect(apiLink, "Consumer should see API in list").toBeVisible({ timeout: TIMEOUTS.SLOW });
    await apiLink.click();

    // click API Keys tab
    const apiKeysTab = page.getByRole("tab", { name: /api keys/i });
    await expect(apiKeysTab, "API Keys tab should exist").toBeVisible({ timeout: TIMEOUTS.DEFAULT });
    await apiKeysTab.click();

    // click request access button
    const requestButton = page.getByRole("button", { name: /request.*access/i });
    await expect(requestButton, "Consumer should have Request Access button").toBeVisible({ timeout: TIMEOUTS.DEFAULT });
    await requestButton.click();

    // fill request dialog
    const dialog = page.getByRole("dialog");
    await expect(dialog, "Request dialog should open").toBeVisible({ timeout: TIMEOUTS.DEFAULT });

    // select a plan tier if available
    const tierSelect = page.getByLabel(/plan|tier/i);
    const tierVisible = await tierSelect.isVisible().catch(() => false);
    if (tierVisible) {
      await tierSelect.click();
      const bronzeOption = page.getByRole("option").first();
      await bronzeOption.click();
    }

    // fill use case
    const useCaseField = page.getByLabel(/use case/i);
    const useCaseVisible = await useCaseField.isVisible().catch(() => false);
    if (useCaseVisible) {
      await useCaseField.fill("E2E test request");
    }

    // submit request
    const submitButton = dialog.getByRole("button", { name: /request|submit/i });
    await submitButton.click();

    // wait for dialog to close
    await expect(dialog, "Request dialog should close").not.toBeVisible({ timeout: TIMEOUTS.SLOW });
  });

  test("4. owner1 sees the request in approval queue", async ({ page }) => {
    const common = new Common(page);
    await common.dexQuickLogin("owner1@kuadrant.local");
    await page.goto("/kuadrant");
    await waitForKuadrantPageReady(page);

    // owner should see approval queue
    const approvalQueue = page.getByText(/api access requests/i).first();
    await expect(approvalQueue, "Owner should see API Access Requests section").toBeVisible({ timeout: TIMEOUTS.SLOW });

    // click pending tab
    const pendingTab = page.getByRole("tab", { name: /pending/i });
    await expect(pendingTab, "Pending tab should exist").toBeVisible({ timeout: TIMEOUTS.DEFAULT });
    await pendingTab.click();

    // should see consumer1's request
    const consumerRequest = page.getByText(/consumer1/i);
    await expect(consumerRequest, "Owner should see consumer1's request").toBeVisible({ timeout: TIMEOUTS.SLOW });
  });

  test("5. owner2 cannot see owner1's requests in approval queue", async ({ page }) => {
    const common = new Common(page);
    await common.dexQuickLogin("owner2@kuadrant.local");
    await page.goto("/kuadrant");
    await waitForKuadrantPageReady(page);

    // owner2 should see approval queue section (has approve permission)
    const approvalQueue = page.getByText(/api access requests/i).first();
    await expect(approvalQueue, "Owner2 should see API Access Requests section").toBeVisible({ timeout: TIMEOUTS.DEFAULT });

    // click pending tab
    const pendingTab = page.getByRole("tab", { name: /pending/i });
    await expect(pendingTab).toBeVisible({ timeout: TIMEOUTS.DEFAULT });
    await pendingTab.click();

    // owner2 should NOT see requests for owner1's API
    const testApiRequest = page.locator(`text=${testData.displayName}`).first();
    await expect(testApiRequest, "Owner2 should NOT see owner1's API requests").not.toBeVisible({ timeout: TIMEOUTS.QUICK });
  });

  test("6. admin can see any request", async ({ page }) => {
    const common = new Common(page);
    await common.dexQuickLogin("admin@kuadrant.local");
    await page.goto("/kuadrant");
    await waitForKuadrantPageReady(page);

    // admin should see approval queue
    const approvalQueue = page.getByText(/api access requests/i).first();
    await expect(approvalQueue, "Admin should see API Access Requests section").toBeVisible({ timeout: TIMEOUTS.SLOW });

    // admin can see all pending requests
    const pendingTab = page.getByRole("tab", { name: /pending/i });
    await expect(pendingTab).toBeVisible({ timeout: TIMEOUTS.DEFAULT });
    await pendingTab.click();

    // admin should see approve buttons
    const approveButton = page.getByRole("button", { name: /approve/i }).first();
    await expect(approveButton, "Admin should see Approve button").toBeVisible({ timeout: TIMEOUTS.DEFAULT });
  });

  test("7. owner1 approves consumer1's request", async ({ page }) => {
    const common = new Common(page);
    await common.dexQuickLogin("owner1@kuadrant.local");
    await page.goto("/kuadrant");
    await waitForKuadrantPageReady(page);

    // find approval queue
    const pendingTab = page.getByRole("tab", { name: /pending/i });
    await expect(pendingTab).toBeVisible({ timeout: TIMEOUTS.DEFAULT });
    await pendingTab.click();

    // find approve button for consumer1's request
    const approveButton = page.getByRole("button", { name: /approve/i }).first();
    await expect(approveButton, "Owner should see Approve button").toBeVisible({ timeout: TIMEOUTS.DEFAULT });
    await approveButton.click();

    // confirm approval dialog
    const confirmDialog = page.getByRole("dialog");
    await expect(confirmDialog, "Approval confirmation dialog should open").toBeVisible({ timeout: TIMEOUTS.DEFAULT });

    const confirmButton = confirmDialog.getByRole("button", { name: /approve/i });
    await confirmButton.click();
    await expect(confirmDialog, "Confirmation dialog should close").not.toBeVisible({ timeout: TIMEOUTS.SLOW });

    // verify request moved to approved
    const approvedTab = page.getByRole("tab", { name: /approved/i });
    const approvedTabVisible = await approvedTab.isVisible().catch(() => false);
    if (approvedTabVisible) {
      await approvedTab.click();
    }
  });

  test("8. consumer1 sees their approved API key", async ({ page }) => {
    const common = new Common(page);
    await common.dexQuickLogin("consumer1@kuadrant.local");
    await page.goto("/kuadrant");
    await waitForKuadrantPageReady(page);

    // find My API Keys card
    const myApiKeysCard = page.getByText(/my api keys/i).first();
    await expect(myApiKeysCard, "Consumer should see My API Keys section").toBeVisible({ timeout: TIMEOUTS.SLOW });

    // look for approved tab
    const approvedTab = page.getByRole("tab", { name: /approved/i });
    await expect(approvedTab).toBeVisible({ timeout: TIMEOUTS.DEFAULT });
    await approvedTab.click();

    // should see the approved key
    const approvedKey = page.locator("table tbody tr").first();
    await expect(approvedKey, "Consumer should see approved API key").toBeVisible({ timeout: TIMEOUTS.SLOW });
  });
});
