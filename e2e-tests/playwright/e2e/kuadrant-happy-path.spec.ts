import { test, expect } from "../fixtures/test";
import { Common } from "../utils/common";
import {
  TIMEOUTS,
  apiKeyTableTotal,
  createTestAPIProductData,
  waitForKuadrantPageReady,
  waitForApiKeysPageReady,
  retryUntilSuccess,
  TestAPIProduct,
} from "../utils/kuadrant-helpers";

/**
 * Holistic happy path test covering the full API lifecycle:
 * 1. Owner creates an API Product
 * 2. Consumer discovers the new API in catalog
 * 3. Consumer requests access to toystore-api (has plans configured)
 * 4. Admin sees the request in approval queue
 * 5. Owner2 cannot see toystore requests (ownership filtering)
 * 6. Admin approves consumer1's request
 * 7. Consumer sees their approved API key
 * 8. Consumer views API key detail page
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

    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      const common = new Common(page);

      await common.dexQuickLogin("owner1@kuadrant.local");
      await page.goto("/kuadrant/api-products");

      // wait for the table, not just the heading: searching before the rows
      // arrive filters an empty table and finds nothing.
      await waitForKuadrantPageReady(page);

      // narrow before looking: the products table pages at 20, so past that the
      // row is simply not on screen and the old isVisible() check quietly
      // decided there was nothing to clean up. that is why a long-lived cluster
      // fills with leftover e2e-test-api-* products, which then pages the demo
      // products the other specs look for off their own first page.
      const search = page.getByRole("textbox", { name: "Search" });
      if (await search.count()) {
        await search.fill(testData.name);
      }

      // matched on the id, which both name and displayName carry: the search
      // indexes the resource name, but the row renders the display name.
      const apiProductRow = page
        .locator("tbody tr")
        .filter({ hasText: testData.id })
        .first();
      await apiProductRow.waitFor({ state: "visible", timeout: TIMEOUTS.SLOW });

      await apiProductRow
        .getByRole("button", { name: /delete api product/i })
        .click();

      const confirmDialog = page.getByRole("dialog");
      await confirmDialog.waitFor({
        state: "visible",
        timeout: TIMEOUTS.DEFAULT,
      });
      await confirmDialog.getByRole("textbox").fill(testData.name);
      await confirmDialog.getByRole("button", { name: /delete/i }).click();
      await confirmDialog.waitFor({ state: "hidden", timeout: TIMEOUTS.SLOW });
    } catch (error) {
      // a failed cleanup leaks a product into the cluster, so say so loudly
      // enough to be found in a log rather than filing it under "warning", and
      // fail the suite rather than let a leak pass silently.
      console.error(
        `Cleanup failed - ${testData.name} is still on the cluster:`,
        error,
      );
      throw error;
    } finally {
      await context.close();
    }
  });

  test.describe.configure({ mode: "serial" });

  test("1. owner1 creates a new API Product", async ({ page }) => {
    const common = new Common(page);
    await common.dexQuickLogin("owner1@kuadrant.local");
    await page.goto("/kuadrant/api-products");
    await waitForKuadrantPageReady(page);

    // click create button - fail fast if not visible
    const createButton = page.getByRole("button", {
      name: /create api product/i,
    });
    await expect(
      createButton,
      "Owner should see Create API Product button",
    ).toBeVisible({ timeout: TIMEOUTS.SLOW });
    await createButton.click();

    // wait for dialog
    const dialog = page.getByRole("dialog");
    await expect(dialog, "Create dialog should open").toBeVisible({
      timeout: TIMEOUTS.DEFAULT,
    });

    // fill in the form
    await page.getByPlaceholder("my-api").fill(testData.name);
    await page.getByPlaceholder("My API").fill(testData.displayName);
    await page
      .getByPlaceholder("API description")
      .fill("E2E test API product - will be cleaned up");

    // select an HTTPRoute
    const httprouteSelect = page.locator('[data-testid="httproute-select"]');
    await httprouteSelect.scrollIntoViewIfNeeded();
    // disabled while the routes load, and a click on a disabled MUI Select is
    // swallowed - the failure then reads as "options never appeared". the open
    // is retried because a re-render as the fetch settles can dismiss the menu.
    await expect(httprouteSelect).toBeEnabled({ timeout: TIMEOUTS.SLOW });
    await expect(async () => {
      await httprouteSelect.click({ timeout: TIMEOUTS.DEFAULT });
      await expect(
        page.getByRole("listbox").getByRole("option").first(),
      ).toBeVisible({ timeout: TIMEOUTS.QUICK });
    }).toPass({ timeout: TIMEOUTS.SLOW, intervals: [250, 500, 1000] });

    // wait for dropdown options and select toystore
    const toystoreOption = page
      .getByRole("option", { name: /toystore/i })
      .first();
    await expect(toystoreOption, "HTTPRoute options should load").toBeVisible({
      timeout: TIMEOUTS.DEFAULT,
    });
    await toystoreOption.click();

    // submit
    const submitButton = dialog.getByRole("button", { name: /create/i });
    await submitButton.click();

    // wait for success
    await expect(dialog, "Dialog should close after creation").not.toBeVisible({
      timeout: TIMEOUTS.SLOW,
    });
    testCreated = true;

    // verify API product appears in table (scope to table to avoid matching
    // toast). narrowed first: the table pages at 20, so a newly created product
    // is not necessarily on the visible page.
    const search = page.getByRole("textbox", { name: "Search" });
    if (await search.count()) {
      await search.fill(testData.name);
    }
    const table = page.locator("table");
    const apiProductRow = table.getByRole("link", {
      name: testData.displayName,
    });
    await expect(
      apiProductRow,
      "Created API should appear in table",
    ).toBeVisible({ timeout: TIMEOUTS.SLOW });
  });

  test("2. consumer1 discovers the API in catalog", async ({ page }) => {
    const common = new Common(page);
    await common.dexQuickLogin("consumer1@kuadrant.local");

    await retryUntilSuccess(
      async () => {
        await page.goto("/catalog?filters[kind]=api");
        const apiLink = page.getByRole("link", {
          name: new RegExp(testData.displayName, "i"),
        });
        await expect(apiLink).toBeVisible({ timeout: TIMEOUTS.DEFAULT });
      },
      {
        maxAttempts: 8,
        delayMs: 5000,
        errorMessage: `API ${testData.displayName} not found in catalog after retries`,
      },
    );
  });

  test("3. consumer1 requests API access", async ({ page }) => {
    const common = new Common(page);
    await common.dexQuickLogin("consumer1@kuadrant.local");

    await page.goto("/catalog/default/api/toystore-api");
    await page.waitForURL(/\/catalog\/.*\/api\/toystore-api/, {
      timeout: TIMEOUTS.VERY_SLOW,
    });

    // click API Keys tab
    const apiKeysTab = page.getByRole("tab", { name: /api keys/i });
    await expect(apiKeysTab, "API Keys tab should exist").toBeVisible({
      timeout: TIMEOUTS.SLOW,
    });
    await apiKeysTab.click();

    // click request access button
    const requestButton = page.locator(
      '[data-testid="request-api-access-button"]',
    );
    await expect(
      requestButton,
      "Consumer should have Request Access button",
    ).toBeVisible({ timeout: TIMEOUTS.SLOW });
    await expect(
      requestButton,
      "Request button should be enabled (plans must be loaded)",
    ).toBeEnabled({ timeout: TIMEOUTS.SLOW });
    await requestButton.click();

    // fill request dialog
    const dialog = page.getByRole("dialog");
    await expect(dialog, "Request dialog should open").toBeVisible({
      timeout: TIMEOUTS.DEFAULT,
    });

    // wait for tier select to be visible and enabled (plans must be loaded)
    const tierSelect = page.locator('[data-testid="tier-select"]');
    await expect(tierSelect, "Tier select should be visible").toBeVisible({
      timeout: TIMEOUTS.DEFAULT,
    });

    // click the select to open dropdown, once the plans have loaded
    await expect(tierSelect).toBeEnabled({ timeout: TIMEOUTS.SLOW });
    await tierSelect.click();

    // wait for dropdown and select first option
    const listbox = page.getByRole("listbox");
    await expect(listbox, "Tier dropdown should open").toBeVisible({
      timeout: TIMEOUTS.SLOW,
    });
    const tierOption = listbox.getByRole("option").first();
    await expect(
      tierOption,
      "At least one tier option should exist",
    ).toBeVisible({ timeout: TIMEOUTS.DEFAULT });
    await tierOption.click();

    // wait for submit button to be enabled
    const submitButton = dialog.getByRole("button", { name: /submit/i });
    await expect(
      submitButton,
      "Submit button should be enabled after tier selection",
    ).toBeEnabled({ timeout: TIMEOUTS.DEFAULT });

    // fill use case (optional) - MUI TextField uses placeholder as accessible name
    const useCaseField = dialog.getByRole("textbox", {
      name: /describe how you plan to use/i,
    });
    await useCaseField.fill("E2E test request");

    // submit the request
    await submitButton.click();

    // wait for dialog to close
    await expect(dialog, "Request dialog should close").not.toBeVisible({
      timeout: TIMEOUTS.SLOW,
    });
  });

  test("4. admin sees the request in approval queue", async ({ page }) => {
    const common = new Common(page);
    await common.dexQuickLogin("admin@kuadrant.local");
    await page.goto("/kuadrant/api-key-approval");
    await waitForApiKeysPageReady(page);

    // should see consumer1's request in the approval queue. narrowed to the api
    // step 3 requested against - toystore-api, not the product created in step
    // 1 - because the queue pages at 20 and on a reused cluster the newest
    // request is not reliably on the visible page.
    const search = page.getByRole("textbox", { name: "Search" });
    if (await search.count()) {
      await search.fill("toystore-api");
    }
    await expect(
      page
        .locator("tbody tr")
        .filter({ hasText: /consumer1/i })
        .first(),
      "Admin should see consumer1's request",
    ).toBeVisible({ timeout: TIMEOUTS.SLOW });
  });

  test("5. owner2 cannot see toystore requests (owned by owner1)", async ({
    page,
  }) => {
    const common = new Common(page);
    await common.dexQuickLogin("owner2@kuadrant.local");
    await page.goto("/kuadrant/api-key-approval");
    await waitForApiKeysPageReady(page);

    // owner2 should NOT see requests for owner1's api. the claim is about that
    // api, not about owner2's queue being empty overall - owner2 owns other
    // demo apis, so requests for those are legitimately there and asserting a
    // globally empty queue only held while nothing else had ever been
    // requested. narrow to owner1's product and assert nothing comes back.
    const search = page.getByRole("textbox", { name: "Search" });
    if (await search.count()) {
      await search.fill(testData.name);
    }
    await expect(
      page.locator("tbody tr").filter({ hasText: testData.name }),
      "Owner2 should see no requests for owner1's api",
    ).toHaveCount(0, { timeout: TIMEOUTS.DEFAULT });
    // and the page says so, rather than the count being zero because nothing
    // rendered: an empty queue shows "No API keys found", a search that matches
    // nothing shows the table's own "No records to display".
    await expect(
      page
        .getByText(/no api keys found/i)
        .or(page.getByText(/no records to display/i))
        .first(),
      "the queue should report nothing matching owner1's api",
    ).toBeVisible({ timeout: TIMEOUTS.DEFAULT });
  });

  test("6. admin approves consumer1's request", async ({ page }) => {
    const common = new Common(page);
    await common.dexQuickLogin("admin@kuadrant.local");
    await page.goto("/kuadrant/api-key-approval");
    await waitForApiKeysPageReady(page);

    // find approve button for consumer1's request
    const approveButton = page
      .getByRole("button", { name: /approve/i })
      .first();
    await expect(approveButton, "Admin should see Approve button").toBeVisible({
      timeout: TIMEOUTS.DEFAULT,
    });
    await approveButton.click();

    // confirm approval dialog
    const confirmDialog = page.getByRole("dialog");
    await expect(
      confirmDialog,
      "Approval confirmation dialog should open",
    ).toBeVisible({ timeout: TIMEOUTS.DEFAULT });

    const confirmButton = confirmDialog.getByRole("button", {
      name: /approve/i,
    });
    await confirmButton.click();
    await expect(
      confirmDialog,
      "Confirmation dialog should close",
    ).not.toBeVisible({ timeout: TIMEOUTS.SLOW });
  });

  test("7. consumer1 sees their approved API key", async ({ page }) => {
    const common = new Common(page);
    await common.dexQuickLogin("consumer1@kuadrant.local");
    await page.goto("/kuadrant/my-api-keys");
    await waitForApiKeysPageReady(page);

    // should see the approved key in table
    const approvedKey = page.locator("table tbody tr").first();
    await expect(
      approvedKey,
      "Consumer should see approved API key",
    ).toBeVisible({ timeout: TIMEOUTS.SLOW });
  });

  test("8. consumer1 views API key detail page", async ({ page }) => {
    const common = new Common(page);
    await common.dexQuickLogin("consumer1@kuadrant.local");
    await page.goto("/kuadrant/my-api-keys");
    await waitForApiKeysPageReady(page);

    // find view details button (eye icon) and click
    const viewDetailsButton = page
      .getByRole("button", { name: /view details/i })
      .first();
    await expect(
      viewDetailsButton,
      "View details button should be visible",
    ).toBeVisible({ timeout: TIMEOUTS.DEFAULT });
    await viewDetailsButton.click();

    // should navigate to detail page
    await page.waitForURL(/\/kuadrant\/api-keys\/[^/]+\/[^/]+/);

    // verify detail page loaded correctly
    const detailsCard = page.getByText("API Key Details");
    await expect(
      detailsCard.first(),
      "API Key Details card should be visible",
    ).toBeVisible({ timeout: TIMEOUTS.SLOW });

    // verify status chip is visible
    const statusChip = page.getByTestId("api-key-status-chip");
    await expect(statusChip, "Status chip should be visible").toBeVisible({
      timeout: TIMEOUTS.DEFAULT,
    });

    // verify View API button exists
    const viewApiButton = page.getByTestId("view-api-button");
    await expect(
      viewApiButton,
      "View API button should be visible",
    ).toBeVisible({ timeout: TIMEOUTS.DEFAULT });

    // verify breadcrumb navigation works
    const breadcrumbLink = page
      .getByRole("link", { name: /api keys/i })
      .first();
    await expect(
      breadcrumbLink,
      "Breadcrumb link should be visible",
    ).toBeVisible({ timeout: TIMEOUTS.DEFAULT });
  });

  test("9. consumer1 deletes their API key", async ({ page }) => {
    const common = new Common(page);
    await common.dexQuickLogin("consumer1@kuadrant.local");
    await page.goto("/kuadrant/my-api-keys");
    await waitForApiKeysPageReady(page);

    // rows for the same api product are indistinguishable in the dom, and the
    // table pages at 20 - so counting visible rows proves nothing once the
    // first page is full (deleting one just pulls the next row up), and
    // asserting the table ends up empty only held while this was consumer1's
    // only key ever. the pagination footer carries the real total, so use that
    // where it is rendered (material-table only pages past 10 rows).
    const totalKeys = () => apiKeyTableTotal(page);

    const rows = page.locator("table tbody tr");
    const firstRow = rows.first();
    await expect(
      firstRow,
      "Consumer should see at least one API key",
    ).toBeVisible({ timeout: TIMEOUTS.SLOW });
    const before = await totalKeys();

    // click the delete button in the Actions column
    const deleteButton = firstRow.getByRole("button", { name: /delete/i });
    await expect(deleteButton, "Delete button should be visible").toBeVisible({
      timeout: TIMEOUTS.DEFAULT,
    });
    await deleteButton.click();

    // confirm deletion in dialog
    const confirmDialog = page.getByRole("dialog");
    await expect(
      confirmDialog,
      "Delete confirmation dialog should open",
    ).toBeVisible({ timeout: TIMEOUTS.DEFAULT });

    // verify dialog has expected title
    const dialogTitle = confirmDialog.getByText(/delete api key/i);
    await expect(
      dialogTitle,
      "Dialog should have 'Delete API Key' title",
    ).toBeVisible({ timeout: TIMEOUTS.DEFAULT });

    // click confirm button
    const confirmButton = confirmDialog.getByRole("button", {
      name: /delete/i,
    });
    await confirmButton.click();

    // verify dialog closes
    await expect(
      confirmDialog,
      "Delete dialog should close after confirmation",
    ).not.toBeVisible({ timeout: TIMEOUTS.SLOW });

    // verify success message appeared
    const successMessage = page.getByText(/api key deleted/i);
    await expect(successMessage, "Success message should appear").toBeVisible({
      timeout: TIMEOUTS.DEFAULT,
    });

    // exactly one key fewer
    await expect
      .poll(totalKeys, {
        timeout: TIMEOUTS.SLOW,
        message: "Deleting one key should leave exactly one fewer",
      })
      .toBe(before - 1);
  });
});
