import { test, expect, type Page } from "@playwright/test";
import { loginAs } from "../support/auth/login-as";
import { TIMEOUTS, waitForMcpPageReady } from "../utils/kuadrant-helpers";

// the host app has an "MCP Management" sidebar section; rhdh's dynamic menu
// config nests the mcp entries in the "Kuadrant" group instead
function mcpNavEntry(page: Page) {
  const nav = page.locator("nav");
  return nav
    .getByText("MCP Management")
    .or(nav.getByRole("button", { name: "Kuadrant" }))
    .first();
}

async function openMcpNav(page: Page) {
  const nav = page.locator("nav");
  await expect(mcpNavEntry(page)).toBeVisible({ timeout: TIMEOUTS.SLOW });
  const section = nav.getByText("MCP Management").first();
  if (await section.count()) await section.click();
  else await nav.getByRole("button", { name: "Kuadrant" }).click();
}

test.describe("Kuadrant MCP Management", () => {
  test.beforeAll(async () => {
    test.info().annotations.push({
      type: "component",
      description: "plugins",
    });
  });

  test.beforeEach(async ({ page }) => {
    await loginAs(page, "owner1@kuadrant.local");
  });

  test("should display MCP Management section in sidebar", async ({ page }) => {
    await expect(mcpNavEntry(page)).toBeVisible({ timeout: TIMEOUTS.SLOW });
  });

  test("should display MCP Overview sub-menu item", async ({ page }) => {
    await openMcpNav(page);

    const overviewLink = page.locator('nav a[href="/kuadrant/mcp-management"]');
    await expect(overviewLink).toBeVisible({ timeout: TIMEOUTS.DEFAULT });
  });

  test("should open the MCP Inspector empty state", async ({ page }) => {
    await page.goto("/kuadrant/mcp-inspector");

    await expect(
      page.getByRole("heading", { name: "MCP Inspector" }),
    ).toBeVisible({
      timeout: TIMEOUTS.SLOW,
    });
    await expect(
      page.getByLabel("Select an MCP gateway extension"),
    ).toBeVisible({
      timeout: TIMEOUTS.DEFAULT,
    });
    await expect(
      page.getByText("No connection", { exact: true }).first(),
    ).toBeVisible();
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
