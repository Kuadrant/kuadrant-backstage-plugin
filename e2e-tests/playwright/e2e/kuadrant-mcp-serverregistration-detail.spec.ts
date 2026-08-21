import { test, expect } from "@playwright/test";
import { Common } from "../utils/common";
import { TIMEOUTS, waitForMcpPageReady } from "../utils/kuadrant-helpers";

// the oinc demo fixture (oinc/manifests/mcp-demo.yaml) always registers this
// MCPServerRegistration in CI, so tests assert against it directly instead of
// skipping when the servers table happens to be empty.
const FIXTURE_NAMESPACE = "toystore";
const FIXTURE_NAME = "toystore-mcp-server";

test.describe("Kuadrant MCP Server Registration detail", () => {
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

  test("opens the detail page from the servers table", async ({ page }) => {
    // the server name is a link into the read-only detail view
    const serverLink = page.locator(
      `a[href="/kuadrant/mcp/serverregistrations/${FIXTURE_NAMESPACE}/${FIXTURE_NAME}"]`,
    );

    await expect(serverLink).toBeVisible({ timeout: TIMEOUTS.SLOW });

    await serverLink.click();

    await page.waitForURL(
      /\/kuadrant\/mcp\/serverregistrations\/[^/]+\/[^/]+/,
      { timeout: TIMEOUTS.VERY_SLOW },
    );

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
    const serverLink = page.locator(
      `a[href="/kuadrant/mcp/serverregistrations/${FIXTURE_NAMESPACE}/${FIXTURE_NAME}"]`,
    );

    await expect(serverLink).toBeVisible({ timeout: TIMEOUTS.SLOW });

    await serverLink.click();
    await page.waitForURL(
      /\/kuadrant\/mcp\/serverregistrations\/[^/]+\/[^/]+/,
      { timeout: TIMEOUTS.VERY_SLOW },
    );

    await page.getByRole("tab", { name: /yaml/i }).click();

    await expect(page.getByText("YAML Manifest").first()).toBeVisible({
      timeout: TIMEOUTS.SLOW,
    });
    // the manifest renders apiVersion of the MCPServerRegistration resource
    await expect(
      page.getByText(/apiVersion:\s*mcp\.kuadrant\.io/).first(),
    ).toBeVisible();
  });
});
