import { test, expect } from "@playwright/test";
import { Common } from "../utils/common";
import { TIMEOUTS, waitForMcpPageReady } from "../utils/kuadrant-helpers";

test.describe("Kuadrant MCP Management", () => {
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

  test("should display MCP Management section in sidebar", async ({ page }) => {
    const mcpSection = page.locator("nav").getByText("MCP Management");
    await expect(mcpSection.first()).toBeVisible({ timeout: TIMEOUTS.SLOW });
  });

  test("should display MCP Overview sub-menu item", async ({ page }) => {
    const mcpSection = page.locator("nav").getByText("MCP Management").first();
    await mcpSection.click();

    const overviewLink = page.locator('nav a[href="/kuadrant/mcp-management"]');
    await expect(overviewLink).toBeVisible({ timeout: TIMEOUTS.DEFAULT });
  });

  test("should display MCP management page header", async ({ page }) => {
    await page.goto("/kuadrant/mcp-management");
    await waitForMcpPageReady(page);

    const heading = page
      .locator("h1, h2")
      .filter({ hasText: /mcp management/i });
    await expect(heading.first()).toBeVisible({ timeout: TIMEOUTS.SLOW });

    const content = page.locator("main");
    await expect(content).toBeVisible();
  });

  test("should display the three MCP resource tables", async ({ page }) => {
    await page.goto("/kuadrant/mcp-management");
    await waitForMcpPageReady(page);

    await expect(page.getByText("MCP Gateways").first()).toBeVisible({
      timeout: TIMEOUTS.SLOW,
    });
    await expect(page.getByText("MCP Gateway Extensions").first()).toBeVisible({
      timeout: TIMEOUTS.DEFAULT,
    });
    await expect(page.getByText("MCP Servers").first()).toBeVisible({
      timeout: TIMEOUTS.DEFAULT,
    });
  });

  test("should be read-only (no create or delete actions)", async ({
    page,
  }) => {
    await page.goto("/kuadrant/mcp-management");
    await waitForMcpPageReady(page);

    // the MCP overview is read-only: no create button and no per-row actions
    // menu should be rendered anywhere in the resource tables
    await expect(page.getByRole("button", { name: /create/i })).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: /row actions/i }),
    ).toHaveCount(0);
  });
});
