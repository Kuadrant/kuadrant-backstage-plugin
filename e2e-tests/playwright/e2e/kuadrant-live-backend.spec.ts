import { test, expect, Page } from "../fixtures/test";
import { Common } from "../utils/common";
import { TIMEOUTS, waitForApiKeysPageReady } from "../utils/kuadrant-helpers";

/**
 * Specs that go all the way through to the real backend and the cluster.
 *
 * The rest of the dynamic set asserts that pages render, which a page can do
 * perfectly well while every request behind it fails: the approvals table
 * swallows a failed fetch into a transient alert and then draws the same empty
 * table it draws when the queue really is empty. These deliberately do not
 * page.route the kuadrant endpoints, and assert on the responses rather than
 * only on the DOM, so a 500 or a missing RBAC rule cannot pass as an empty
 * state.
 *
 * Serial: the copy test reads the key the request test creates.
 */
test.describe.serial("Kuadrant against the live backend", () => {
  // owner1-inventory-api is the demo's automatic-approval product
  // (kuadrant-dev-setup/demo/additional-demos.yaml), so requesting access
  // yields an Approved APIKey without a second persona to approve it.
  const autoApproveApi = "owner1-inventory-api";

  const requestsPath = "/api/kuadrant/requests";
  const isRequestsCall = (url: string, expected: string) =>
    new URL(url).pathname === expected;

  // make dynamic-up reuses a cluster, so the table carries rows from earlier
  // runs and from every other product. narrow to the rows this spec cares about
  // before picking one: the row that sorts first is as likely to be a stale
  // Pending one, and a key that is not Approved has no code examples card to
  // find. taking .first() of an already-narrowed set is fine - every row in it
  // satisfies what the assertion is about.
  const rowsForApi = (page: Page) =>
    page
      .getByRole("row")
      .filter({ has: page.getByRole("cell", { name: autoApproveApi }) });

  // the status column labels an Approved key "Active"
  const approvedRowsForApi = (page: Page) =>
    rowsForApi(page).filter({ has: page.getByText("Active", { exact: true }) });

  test.use({ permissions: ["clipboard-read", "clipboard-write"] });

  test.beforeAll(async ({}, testInfo) => {
    testInfo.annotations.push({
      type: "component",
      description: "kuadrant",
    });
  });

  // the keys table pages at 20 and a reused cluster accumulates rows, so the
  // row this spec is looking for is not reliably on the visible page. narrowing
  // is a no-op when the table is small enough not to render a search box.
  const narrowToApi = async (page: Page) => {
    const search = page.getByRole("textbox", { name: "Search" });
    if (await search.count()) {
      await search.fill(autoApproveApi);
    }
  };

  test.beforeEach(async ({ page }) => {
    const common = new Common(page);
    await common.dexQuickLogin("admin@kuadrant.local");
  });

  // guards the origin itself. on a non-secure origin these three are undefined,
  // which takes out requesting a key (crypto.randomUUID) and every copy button
  // (navigator.clipboard) while every page still renders.
  test("serves a secure context, so web crypto and clipboard exist", async ({
    page,
  }) => {
    await page.goto("/kuadrant/my-api-keys");
    await waitForApiKeysPageReady(page);

    const capabilities = await page.evaluate(() => ({
      secureContext: window.isSecureContext,
      randomUUID: typeof window.crypto?.randomUUID,
      subtle: typeof window.crypto?.subtle,
      clipboard: typeof navigator.clipboard?.writeText,
    }));

    expect(capabilities).toEqual({
      secureContext: true,
      randomUUID: "function",
      subtle: "object",
      clipboard: "function",
    });
  });

  test("approvals page loads the request queue from the backend", async ({
    page,
  }) => {
    // arm before navigating: the fetch goes out as the page mounts
    const requestsCall = page.waitForResponse(
      (response) =>
        isRequestsCall(response.url(), requestsPath) &&
        response.request().method() === "GET",
      { timeout: TIMEOUTS.VERY_SLOW },
    );

    await page.goto("/kuadrant/api-key-approval");

    // the assertion that matters: without rbac for apikeyrequests this is a
    // 500 and the table below still renders, empty and apparently fine.
    const response = await requestsCall;
    expect(response.status(), "GET /api/kuadrant/requests should succeed").toBe(
      200,
    );

    await waitForApiKeysPageReady(page);

    // the fetch failure surfaces only as this transient alert
    await expect(page.getByText(/failed to get resources/i)).toHaveCount(0);

    // the data region resolved to real content: either the queue table or the
    // explicit empty state, never a spinner or an error panel
    const dataRegion = page
      .locator("table")
      .or(page.getByText(/no api keys found/i));
    await expect(dataRegion.first()).toBeVisible({ timeout: TIMEOUTS.SLOW });
  });

  test("requesting access creates the request through the backend", async ({
    page,
  }) => {
    await page.goto("/kuadrant/my-api-keys");
    await waitForApiKeysPageReady(page);

    const dialog = page.getByRole("dialog");

    // fill the dialog, reopening it if the tiers are not there yet: they come
    // from the PlanPolicy's discovered plans, so they exist only once the
    // operator has reconciled it, and the dialog reads the products once when
    // it opens. reopening is what picks them up, so retry the whole thing
    // rather than racing the first paint.
    await expect(async () => {
      if (await dialog.isVisible()) {
        await dialog.getByTestId("cancel-button").click();
        await expect(dialog).not.toBeVisible({ timeout: TIMEOUTS.QUICK });
      }

      await page.getByTestId("request-access-button").click();
      await expect(dialog).toBeVisible({ timeout: TIMEOUTS.DEFAULT });

      // the testid sits on the MUI input wrapper; the thing that opens the
      // menu is the role=button inside it, so clicking the wrapper only
      // focuses it.
      await dialog.getByTestId("api-select").getByRole("button").click();
      await page
        .getByRole("listbox")
        .getByRole("option", { name: autoApproveApi, exact: true })
        .click();

      const tierSelect = dialog.getByTestId("tier-select").getByRole("button");
      await expect(tierSelect).toBeEnabled({ timeout: TIMEOUTS.QUICK });
      await tierSelect.click();

      const tierOption = page
        .getByRole("listbox")
        .getByRole("option")
        .filter({ hasNotText: /no tiers available/i })
        .first();
      await expect(tierOption).toBeVisible({ timeout: TIMEOUTS.QUICK });
      await tierOption.click();
    }).toPass({ timeout: TIMEOUTS.VERY_SLOW, intervals: [1000, 2000, 5000] });

    await dialog
      .getByTestId("usecase-input")
      .fill("e2e: request access against the live backend");

    // exercises crypto.randomUUID, which is undefined off a secure context
    const created = page.waitForResponse(
      (response) =>
        isRequestsCall(response.url(), requestsPath) &&
        response.request().method() === "POST",
      { timeout: TIMEOUTS.VERY_SLOW },
    );

    await dialog.getByTestId("submit-button").click();

    const response = await created;
    expect(
      response.status(),
      "POST /api/kuadrant/requests should create the request",
    ).toBe(201);

    await expect(dialog).not.toBeVisible({ timeout: TIMEOUTS.SLOW });

    // and it came back into the table the page refetched. the 201 above is what
    // proves this run created the request; what matters here is that the table
    // round-trip reaches the state the next test needs - an Approved key for
    // this api, which the automatic product yields without a reviewer. a row
    // that is merely present is not enough: a Pending one has no code examples
    // card, and on a reused cluster it is as likely to be the one found.
    await expect(async () => {
      await narrowToApi(page);
      await expect(approvedRowsForApi(page).first()).toBeVisible({
        timeout: TIMEOUTS.QUICK,
      });
    }).toPass({ timeout: TIMEOUTS.VERY_SLOW, intervals: [1000, 2000, 5000] });
  });

  test("copying a code example writes it to the clipboard", async ({
    page,
  }) => {
    await page.goto("/kuadrant/my-api-keys");
    await waitForApiKeysPageReady(page);

    // open an Approved key for the api the previous test requested. the row's
    // product cell links to the catalog entity, so go through the row action,
    // which is what opens the key detail page and its code examples card. the
    // card is rendered only for an Approved key, which the automatic product
    // yields without a reviewer - so scope to those rows rather than taking
    // whichever row happens to sort first, which on a reused cluster is as
    // likely to be Pending, leaving the card below to time out saying nothing.
    await narrowToApi(page);
    const approvedRow = approvedRowsForApi(page).first();
    await expect(approvedRow).toBeVisible({ timeout: TIMEOUTS.VERY_SLOW });
    await approvedRow.getByRole("button", { name: "View details" }).click();

    await page.waitForURL(/\/kuadrant\/api-keys\/[^/]+\/[^/]+/, {
      timeout: TIMEOUTS.SLOW,
    });

    // pick the tab by name: the assertion below is about the curl example, and
    // the tab order is the component's business, not this test's
    await page.getByRole("tab", { name: "cURL" }).click();

    const copyButton = page.getByRole("button", { name: /copy code/i });
    await expect(copyButton).toBeVisible({ timeout: TIMEOUTS.VERY_SLOW });
    await copyButton.click();

    await expect(page.getByText(/copied to clipboard/i).first()).toBeVisible({
      timeout: TIMEOUTS.DEFAULT,
    });

    // the snackbar fires whether or not the write landed, so read it back
    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboard).toContain("curl");
  });
});
