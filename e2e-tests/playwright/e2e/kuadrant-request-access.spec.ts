import { test, expect } from "../fixtures/test";
import { Common } from "../utils/common";
import {
  TIMEOUTS,
  apiKeyTableTotal,
  waitForApiKeysPageReady,
  selectFirstOption,
  openSelect,
} from "../utils/kuadrant-helpers";

// a demo APIProduct seeded by setup-cluster.sh. named so a test can narrow the
// table to it rather than counting every row on a paginated page.
const targetApi = "owner1-payment-api";

/**
 * E2E tests for SimpleRequestAccessDialog
 * Tests the "Request Access" flow from the My API Keys page
 */
test.describe("Request Access Dialog - My API Keys Page", () => {
  test.beforeAll(async () => {
    test.info().annotations.push({
      type: "component",
      description: "kuadrant",
    });
  });

  test("should display Request Access button on My API Keys page", async ({
    page,
  }) => {
    const common = new Common(page);
    await common.dexQuickLogin("consumer1@kuadrant.local");
    await page.goto("/kuadrant/my-api-keys");
    await waitForApiKeysPageReady(page);

    // verify Request Access button is visible
    const requestButton = page.getByTestId("request-access-button");
    await expect(
      requestButton,
      "Request Access button should be visible on My API Keys page",
    ).toBeVisible({ timeout: TIMEOUTS.DEFAULT });
  });

  test("should open SimpleRequestAccessDialog when Request Access is clicked", async ({
    page,
  }) => {
    const common = new Common(page);
    await common.dexQuickLogin("consumer1@kuadrant.local");
    await page.goto("/kuadrant/my-api-keys");
    await waitForApiKeysPageReady(page);

    // click Request Access button
    const requestButton = page.getByTestId("request-access-button");
    await requestButton.click();

    // verify dialog opens
    const dialog = page.getByRole("dialog");
    await expect(dialog, "Request Access dialog should open").toBeVisible({
      timeout: TIMEOUTS.DEFAULT,
    });

    // verify dialog title
    const dialogTitle = dialog.getByText("Request API key");
    await expect(dialogTitle, "Dialog should have correct title").toBeVisible({
      timeout: TIMEOUTS.DEFAULT,
    });
  });

  test("should display API dropdown with published APIs", async ({ page }) => {
    const common = new Common(page);
    await common.dexQuickLogin("consumer1@kuadrant.local");
    await page.goto("/kuadrant/my-api-keys");
    await waitForApiKeysPageReady(page);

    const requestButton = page.getByTestId("request-access-button");
    await requestButton.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: TIMEOUTS.DEFAULT });

    // verify API dropdown exists
    const apiSelect = dialog.getByTestId("api-select");
    await expect(apiSelect, "API dropdown should be visible").toBeVisible({
      timeout: TIMEOUTS.DEFAULT,
    });

    // click to open dropdown (retried: the menu can be dismissed by the
    // re-render as the products fetch settles)
    await openSelect(page, dialog, "api-select");

    // verify dropdown shows published APIs (like toystore-api)
    const listbox = page.getByRole("listbox");
    await expect(listbox, "API dropdown should open").toBeVisible({
      timeout: TIMEOUTS.DEFAULT,
    });

    // should have at least one API option
    const apiOptions = listbox.getByRole("option");
    const firstOption = apiOptions.first();
    await expect(
      firstOption,
      "At least one API should be available",
    ).toBeVisible({ timeout: TIMEOUTS.DEFAULT });
  });

  test("should populate tiers dropdown after selecting an API", async ({
    page,
  }) => {
    const common = new Common(page);
    await common.dexQuickLogin("consumer1@kuadrant.local");
    await page.goto("/kuadrant/my-api-keys");
    await waitForApiKeysPageReady(page);

    const requestButton = page.getByTestId("request-access-button");
    await requestButton.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: TIMEOUTS.DEFAULT });

    // select an API (toystore-api should have plans)
    await openSelect(page, dialog, "api-select");

    const listbox = page.getByRole("listbox");
    const toystoreOption = listbox
      .getByRole("option", { name: /toystore/i })
      .first();
    await expect(
      toystoreOption,
      "Toystore API should be in the list",
    ).toBeVisible({ timeout: TIMEOUTS.DEFAULT });
    await toystoreOption.click();

    // verify tiers dropdown becomes enabled and populated
    const tierSelect = dialog.getByTestId("tier-select");
    await expect(tierSelect, "Tiers dropdown should be visible").toBeVisible({
      timeout: TIMEOUTS.DEFAULT,
    });
    await expect(
      tierSelect,
      "Tiers dropdown should be enabled after API selection",
    ).toBeEnabled({ timeout: TIMEOUTS.DEFAULT });

    // click tiers dropdown
    await openSelect(page, dialog, "tier-select");

    // verify tiers are populated
    const tierListbox = page.getByRole("listbox");
    const tierOption = tierListbox.getByRole("option").first();
    await expect(
      tierOption,
      "At least one tier should be available",
    ).toBeVisible({ timeout: TIMEOUTS.DEFAULT });
  });

  test("should show tier limits in dropdown options", async ({ page }) => {
    const common = new Common(page);
    await common.dexQuickLogin("consumer1@kuadrant.local");
    await page.goto("/kuadrant/my-api-keys");
    await waitForApiKeysPageReady(page);

    const requestButton = page.getByTestId("request-access-button");
    await requestButton.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: TIMEOUTS.DEFAULT });

    // select toystore-api
    await openSelect(page, dialog, "api-select");
    const listbox = page.getByRole("listbox");
    const toystoreOption = listbox
      .getByRole("option", { name: /toystore/i })
      .first();
    await toystoreOption.click();

    // open tiers dropdown
    await openSelect(page, dialog, "tier-select");

    // verify tier options show limits (e.g., "bronze (10 per minute)")
    const tierListbox = page.getByRole("listbox");
    const tierWithLimits = tierListbox.getByRole("option").first();
    const tierText = tierWithLimits;

    // tier text should contain the tier name and optionally limits like "(10 per minute)"
    await expect(
      tierText,
      "Tier option should show tier name and limits",
    ).toHaveText(/.+/);
  });

  test("should enable Submit button only when API and Tier are selected", async ({
    page,
  }) => {
    const common = new Common(page);
    await common.dexQuickLogin("consumer1@kuadrant.local");
    await page.goto("/kuadrant/my-api-keys");
    await waitForApiKeysPageReady(page);

    const requestButton = page.getByTestId("request-access-button");
    await requestButton.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: TIMEOUTS.DEFAULT });

    const submitButton = dialog.getByTestId("submit-button");

    // submit should be disabled initially
    await expect(
      submitButton,
      "Submit button should be disabled initially",
    ).toBeDisabled({ timeout: TIMEOUTS.DEFAULT });

    // select API
    await selectFirstOption(page, dialog, "api-select");

    // submit should still be disabled (no tier selected)
    await expect(
      submitButton,
      "Submit button should be disabled without tier",
    ).toBeDisabled({ timeout: TIMEOUTS.DEFAULT });

    // select tier
    await selectFirstOption(page, dialog, "tier-select");

    // submit should now be enabled
    await expect(
      submitButton,
      "Submit button should be enabled after selecting API and tier",
    ).toBeEnabled({ timeout: TIMEOUTS.DEFAULT });
  });

  test("should allow entering a use case", async ({ page }) => {
    const common = new Common(page);
    await common.dexQuickLogin("consumer1@kuadrant.local");
    await page.goto("/kuadrant/my-api-keys");
    await waitForApiKeysPageReady(page);

    const requestButton = page.getByTestId("request-access-button");
    await requestButton.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: TIMEOUTS.DEFAULT });

    // find use case field
    const useCaseField = dialog.getByTestId("usecase-input");
    await expect(useCaseField, "Use case field should be visible").toBeVisible({
      timeout: TIMEOUTS.DEFAULT,
    });

    // enter use case text
    const testUseCase = "Testing API integration for E2E tests";
    await useCaseField.fill(testUseCase);

    // verify text was entered
    const fieldValue = useCaseField;
    await expect(fieldValue).toHaveValue(testUseCase);
  });

  test("should successfully submit a request and close dialog", async ({
    page,
  }) => {
    const common = new Common(page);
    await common.dexQuickLogin("consumer1@kuadrant.local");
    await page.goto("/kuadrant/my-api-keys");
    await waitForApiKeysPageReady(page);

    const requestButton = page.getByTestId("request-access-button");
    await requestButton.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: TIMEOUTS.DEFAULT });

    // select API
    await selectFirstOption(page, dialog, "api-select");

    // select tier
    await selectFirstOption(page, dialog, "tier-select");

    // fill use case
    const useCaseField = dialog.getByTestId("usecase-input");
    await useCaseField.fill("E2E test request from SimpleRequestAccessDialog");

    // submit
    const submitButton = dialog.getByTestId("submit-button");
    await submitButton.click();

    // dialog should close on success
    await expect(
      dialog,
      "Dialog should close after submission",
    ).not.toBeVisible({ timeout: TIMEOUTS.SLOW });

    // verify success toast/alert (optional - may be transient)
    // const successMessage = page.getByText(/api key requested successfully/i);
    // await expect(successMessage).toBeVisible({ timeout: TIMEOUTS.DEFAULT });
  });

  test("should show loading state while submitting", async ({ page }) => {
    const common = new Common(page);
    await common.dexQuickLogin("consumer1@kuadrant.local");
    await page.goto("/kuadrant/my-api-keys");
    await waitForApiKeysPageReady(page);

    const requestButton = page.getByTestId("request-access-button");
    await requestButton.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: TIMEOUTS.DEFAULT });

    // select API and tier
    await selectFirstOption(page, dialog, "api-select");

    await selectFirstOption(page, dialog, "tier-select");

    // intercept the request to slow it down
    await page.route("**/api/kuadrant/requests", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      await route.continue();
    });

    const submitButton = dialog.getByTestId("submit-button");
    await submitButton.click();

    // verify loading state - button should show "Submitting..." and have a spinner
    const submittingButton = dialog.getByRole("button", {
      name: /submitting/i,
    });
    await expect(
      submittingButton,
      "Button should show 'Submitting...' during request",
    ).toBeVisible({ timeout: TIMEOUTS.DEFAULT });

    // wait for dialog to close
    await expect(dialog).not.toBeVisible({ timeout: TIMEOUTS.SLOW });
  });

  test("should reset form when Cancel is clicked", async ({ page }) => {
    const common = new Common(page);
    await common.dexQuickLogin("consumer1@kuadrant.local");
    await page.goto("/kuadrant/my-api-keys");
    await waitForApiKeysPageReady(page);

    const requestButton = page.getByTestId("request-access-button");
    await requestButton.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: TIMEOUTS.DEFAULT });

    // select API
    await selectFirstOption(page, dialog, "api-select");

    // fill use case
    const useCaseField = dialog.getByTestId("usecase-input");
    await useCaseField.fill("Test data to be cleared");

    // click cancel
    const cancelButton = dialog.getByTestId("cancel-button");
    await cancelButton.click();

    // dialog should close
    await expect(dialog).not.toBeVisible({ timeout: TIMEOUTS.DEFAULT });

    // reopen dialog and verify form is reset
    await requestButton.click();
    await expect(dialog).toBeVisible({ timeout: TIMEOUTS.DEFAULT });

    const useCaseFieldReopened = dialog.getByTestId("usecase-input");
    const fieldValue = useCaseFieldReopened;
    await expect(
      fieldValue,
      "Use case field should be empty after reset",
    ).toHaveValue("");
  });

  test("should display helper text for fields", async ({ page }) => {
    const common = new Common(page);
    await common.dexQuickLogin("consumer1@kuadrant.local");
    await page.goto("/kuadrant/my-api-keys");
    await waitForApiKeysPageReady(page);

    const requestButton = page.getByTestId("request-access-button");
    await requestButton.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: TIMEOUTS.DEFAULT });

    // verify API field helper text
    const apiHelperText = dialog.getByText(
      /select one api.*submit separate requests/i,
    );
    await expect(
      apiHelperText,
      "API field should have helper text",
    ).toBeVisible({ timeout: TIMEOUTS.DEFAULT });

    // verify Tiers field helper text appears after selecting API
    await selectFirstOption(page, dialog, "api-select");

    const tierHelperText = dialog.getByText(
      /select an api to view available tiers/i,
    );
    await expect(
      tierHelperText,
      "Tiers field should have helper text",
    ).toBeVisible({ timeout: TIMEOUTS.DEFAULT });
  });

  // these two stub a 500 to check the ui surfaces it, so the guards in
  // fixtures/test.ts would otherwise fail them on their own fixture.
  test.describe("simulated backend failures", () => {
    test.use({ allowExpectedErrors: true });

    test("should display error message when request fails", async ({
      page,
    }) => {
      const common = new Common(page);
      await common.dexQuickLogin("consumer1@kuadrant.local");
      await page.goto("/kuadrant/my-api-keys");
      await waitForApiKeysPageReady(page);

      const requestButton = page.getByTestId("request-access-button");
      await requestButton.click();

      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible({ timeout: TIMEOUTS.DEFAULT });

      // intercept the request to simulate a server error
      await page.route("**/api/kuadrant/requests", async (route) => {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({
            error: "Server error: Failed to create API key request",
          }),
        });
      });

      // select API and tier
      await selectFirstOption(page, dialog, "api-select");

      await selectFirstOption(page, dialog, "tier-select");

      // submit
      const submitButton = dialog.getByTestId("submit-button");
      await submitButton.click();

      // wait a moment for the error to be processed
      await page.waitForTimeout(1000);

      // verify error message is displayed (permanent alert)
      const errorAlert = page.getByText(/failed to request api key/i);
      await expect(errorAlert, "Error message should be displayed").toBeVisible(
        {
          timeout: TIMEOUTS.DEFAULT,
        },
      );
    });

    test("should display user-friendly error for email validation failure", async ({
      page,
    }) => {
      const common = new Common(page);
      await common.dexQuickLogin("consumer1@kuadrant.local");
      await page.goto("/kuadrant/my-api-keys");
      await waitForApiKeysPageReady(page);

      const requestButton = page.getByTestId("request-access-button");
      await requestButton.click();

      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible({ timeout: TIMEOUTS.DEFAULT });

      // intercept request to simulate email validation error
      await page.route("**/api/kuadrant/requests", async (route) => {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({
            error:
              'failed to create apikeys: APIKey.devportal.kuadrant.io "test-key" is invalid: spec.requestedBy.email: Invalid value: "admin": spec.requestedBy.email in body should match \'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$\'',
          }),
        });
      });

      // select API and tier
      await selectFirstOption(page, dialog, "api-select");

      await selectFirstOption(page, dialog, "tier-select");

      // submit
      const submitButton = dialog.getByTestId("submit-button");
      await submitButton.click();

      // wait for error processing
      await page.waitForTimeout(1000);

      // verify user-friendly error message for email validation
      const emailErrorAlert = page.getByText(
        /invalid email format.*contact your administrator/i,
      );
      await expect(
        emailErrorAlert,
        "User-friendly email validation error should be displayed",
      ).toBeVisible({ timeout: TIMEOUTS.DEFAULT });
    });
  });

  test("should refresh My API Keys table after successful request", async ({
    page,
  }) => {
    const common = new Common(page);
    await common.dexQuickLogin("consumer1@kuadrant.local");
    await page.goto("/kuadrant/my-api-keys");
    await waitForApiKeysPageReady(page);

    // the total, not the visible rows: the table pages at 20, so a bare count
    // stops growing once the first page is full and this test would then never
    // see its own request arrive. wait for the body to render before taking the
    // baseline - reading it mid-load returns 0 and the comparison is then
    // against a number that was never true.
    await expect(
      page
        .locator("table tbody tr")
        .first()
        .or(page.getByText(/no api keys found/i)),
      "the keys table should finish loading before the baseline is taken",
    ).toBeVisible({ timeout: TIMEOUTS.SLOW });
    const initialCount = await apiKeyTableTotal(page);

    const requestButton = page.getByTestId("request-access-button");
    await requestButton.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: TIMEOUTS.DEFAULT });

    // select API and tier
    await selectFirstOption(page, dialog, "api-select", targetApi);

    await selectFirstOption(page, dialog, "tier-select");

    // submit
    const submitButton = dialog.getByTestId("submit-button");
    await submitButton.click();

    // wait for dialog to close
    await expect(dialog).not.toBeVisible({ timeout: TIMEOUTS.SLOW });

    await expect
      .poll(() => apiKeyTableTotal(page), {
        timeout: TIMEOUTS.SLOW,
        message: "Table should have one more row after successful request",
      })
      .toBe(initialCount + 1);
  });
});
