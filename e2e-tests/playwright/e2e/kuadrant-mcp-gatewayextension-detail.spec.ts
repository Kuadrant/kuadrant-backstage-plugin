import { test, expect } from "@playwright/test";
import { Common } from "../utils/common";
import { TIMEOUTS, waitForMcpPageReady } from "../utils/kuadrant-helpers";

test.describe("Kuadrant MCP Gateway Extension detail", () => {
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
    await page.goto("/kuadrant/mcp-management");
    await waitForMcpPageReady(page);
  });

  test("opens the detail page from the extensions table", async ({ page }) => {
    // the extension name is a link into the read-only detail view; skip when the
    // cluster has no MCPGatewayExtensions to open (nothing to assert on)

    // wait for the extension link to appear (async data load from backend)
    const extensionLink = page
      .locator('a[href^="/kuadrant/mcp/gatewayextensions/"]')
      .first();

    try {
      await extensionLink.waitFor({
        state: "attached",
        timeout: TIMEOUTS.SLOW,
      });
    } catch {
      test.skip(true, "no MCPGatewayExtensions present in the cluster");
      return;
    }

    await extensionLink.click();

    await page.waitForURL(/\/kuadrant\/mcp\/gatewayextensions\/[^/]+\/[^/]+/, {
      timeout: TIMEOUTS.VERY_SLOW,
    });

    // Details and YAML tabs are the two read-only views described in the ticket
    await expect(page.getByRole("tab", { name: /details/i })).toBeVisible({
      timeout: TIMEOUTS.SLOW,
    });
    await expect(page.getByRole("tab", { name: /yaml/i })).toBeVisible();

    // details tab shows the resource fields
    await expect(page.getByText("Resource Details").first()).toBeVisible({
      timeout: TIMEOUTS.SLOW,
    });

    // breadcrumb links back to the overview
    const breadcrumb = page.locator('a[href="/kuadrant/mcp-management"]', {
      hasText: /mcp overview/i,
    });
    await expect(breadcrumb.first()).toBeVisible();
  });

  test("shows the read-only YAML manifest", async ({ page }) => {
    const extensionLink = page
      .locator('a[href^="/kuadrant/mcp/gatewayextensions/"]')
      .first();

    try {
      await extensionLink.waitFor({
        state: "attached",
        timeout: TIMEOUTS.SLOW,
      });
    } catch {
      test.skip(true, "no MCPGatewayExtensions present in the cluster");
      return;
    }

    await extensionLink.click();
    await page.waitForURL(/\/kuadrant\/mcp\/gatewayextensions\/[^/]+\/[^/]+/, {
      timeout: TIMEOUTS.VERY_SLOW,
    });

    await page.getByRole("tab", { name: /yaml/i }).click();

    await expect(page.getByText("YAML Manifest").first()).toBeVisible({
      timeout: TIMEOUTS.SLOW,
    });
    // the manifest renders apiVersion of the MCPGatewayExtension resource
    await expect(
      page.getByText(/apiVersion:\s*mcp\.kuadrant\.io/).first(),
    ).toBeVisible();
  });
});
