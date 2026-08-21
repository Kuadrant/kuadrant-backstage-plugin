import { test, expect, Page } from "@playwright/test";
import { Common } from "../utils/common";
import { TIMEOUTS } from "../utils/kuadrant-helpers";

// The read-only Gateway detail view (issue #369) is reached by clicking a
// Gateway name in the MCP Gateways table (#355). The table Name column links to
// /kuadrant/gateways/:namespace/:name and the page reads its data via
// kuadrantApi.getGateway (backed by the gateway read endpoint). Rather than
// hardcode which oinc-seeded demo gateway is present, these tests click through
// from the first Gateway row in the table.

async function waitForMcpPageReady(page: Page): Promise<void> {
  await page.waitForURL(/\/kuadrant\/mcp-management/, {
    timeout: TIMEOUTS.VERY_SLOW,
  });
  await page.waitForLoadState("load").catch(() => {});
  await expect(async () => {
    const spinner = page.locator('[role="progressbar"]:visible');
    await expect(spinner).toHaveCount(0);
    const heading = page.locator("h1").filter({ hasText: /mcp management/i });
    await expect(heading).toBeVisible();
  }).toPass({ timeout: TIMEOUTS.VERY_SLOW, intervals: [500, 1000, 2000] });
}

async function waitForGatewayDetailReady(page: Page): Promise<void> {
  await page.waitForURL(/\/kuadrant\/gateways\/.+\/.+/, {
    timeout: TIMEOUTS.VERY_SLOW,
  });
  await page.waitForLoadState("load").catch(() => {});
  await expect(async () => {
    const spinner = page.locator('[role="progressbar"]:visible');
    await expect(spinner).toHaveCount(0);
  }).toPass({ timeout: TIMEOUTS.VERY_SLOW, intervals: [500, 1000, 2000] });
}

test.describe("Kuadrant Gateway detail view", () => {
  let common: Common;

  test.beforeAll(async () => {
    test.info().annotations.push({
      type: "component",
      description: "plugins",
    });
  });

  test.beforeEach(async ({ page }) => {
    common = new Common(page);
    await common.loginAsGuest();
  });

  test("navigates from the MCP Gateways table and shows Details and YAML tabs", async ({
    page,
  }) => {
    await page.goto("/kuadrant/mcp-management");
    await waitForMcpPageReady(page);

    // the Gateways table Name column links to the read-only detail view
    const gatewayLink = page
      .locator('a[href^="/kuadrant/gateways/"]')
      .first();
    await expect(gatewayLink).toBeVisible({ timeout: TIMEOUTS.SLOW });
    const gatewayName = (await gatewayLink.textContent())?.trim() || "";

    await gatewayLink.click();
    await waitForGatewayDetailReady(page);

    // breadcrumb back to the gateways list
    await expect(
      page.locator("nav[aria-label='breadcrumb']").getByText("Gateways"),
    ).toBeVisible({ timeout: TIMEOUTS.DEFAULT });

    // Details tab is the default and shows the gateway name
    await expect(page.getByRole("tab", { name: "Details" })).toBeVisible();
    if (gatewayName) {
      await expect(page.getByText(gatewayName).first()).toBeVisible();
    }

    // switching to the YAML tab renders the manifest
    await page.getByRole("tab", { name: "YAML" }).click();
    await expect(page.getByText("apiVersion").first()).toBeVisible({
      timeout: TIMEOUTS.DEFAULT,
    });
  });
});
