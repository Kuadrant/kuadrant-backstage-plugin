import { test, expect } from "@playwright/test";
import { Common } from "../utils/common";
import { TIMEOUTS, isElementVisible } from "../utils/kuadrant-helpers";

/**
 * Tests for auth scheme-specific UI behaviour.
 * Verifies correct display of OIDC vs API Key elements based on auth configuration.
 *
 * Test data:
 * - gamestore-api: OIDC only
 * - gamestore-admin: OIDC + API Key (mixed)
 * - toystore-api: API Key only
 */
test.describe("Auth Scheme UI Behaviour", () => {
  let common: Common;

  test.beforeAll(async () => {
    test.info().annotations.push({
      type: "component",
      description: "kuadrant",
    });
  });

  test.beforeEach(async ({ page }) => {
    common = new Common(page);
    await common.loginAsGuest();
  });

  test.describe("OIDC-only API (gamestore-api)", () => {
    const apiProductPath = "/kuadrant/api-products/gamestore/gamestore-api";

    test("should show OIDC tab", async ({ page }) => {
      await page.goto(apiProductPath);
      await page.waitForLoadState("networkidle").catch(() => {});

      const oidcTab = page.getByRole("tab", { name: "OIDC" });
      await expect(oidcTab).toBeVisible({ timeout: TIMEOUTS.SLOW });
    });

    test("should show OIDC Provider Discovery card in OIDC tab", async ({ page }) => {
      await page.goto(apiProductPath);
      await page.waitForLoadState("networkidle").catch(() => {});

      // click on OIDC tab
      const oidcTab = page.getByRole("tab", { name: "OIDC" });
      await oidcTab.click();

      const oidcCard = page.getByText("OIDC Provider Discovery");
      await expect(oidcCard).toBeVisible({ timeout: TIMEOUTS.SLOW });
    });

    test("should show identity provider URL in OIDC tab", async ({ page }) => {
      await page.goto(apiProductPath);
      await page.waitForLoadState("networkidle").catch(() => {});

      // click on OIDC tab
      const oidcTab = page.getByRole("tab", { name: "OIDC" });
      await oidcTab.click();

      const identityProvider = page.getByText("Identity Provider:");
      await expect(identityProvider).toBeVisible({ timeout: TIMEOUTS.SLOW });
    });

    test("should show token endpoint URL in OIDC tab", async ({ page }) => {
      await page.goto(apiProductPath);
      await page.waitForLoadState("networkidle").catch(() => {});

      // click on OIDC tab
      const oidcTab = page.getByRole("tab", { name: "OIDC" });
      await oidcTab.click();

      const tokenEndpoint = page.getByText("Token Endpoint:");
      await expect(tokenEndpoint).toBeVisible({ timeout: TIMEOUTS.SLOW });
    });

    test("should show curl example in OIDC tab", async ({ page }) => {
      await page.goto(apiProductPath);
      await page.waitForLoadState("networkidle").catch(() => {});

      // click on OIDC tab
      const oidcTab = page.getByRole("tab", { name: "OIDC" });
      await oidcTab.click();

      const curlExample = page.getByText("grant_type=client_credentials");
      await expect(curlExample).toBeVisible({ timeout: TIMEOUTS.SLOW });
    });

    test("should NOT show API Key Approval field", async ({ page }) => {
      await page.goto(apiProductPath);
      await page.waitForLoadState("networkidle").catch(() => {});

      // wait for page to load
      const productCard = page.getByText("API Product").first();
      await expect(productCard).toBeVisible({ timeout: TIMEOUTS.SLOW });

      // API Key Approval should not be visible
      const apiKeyApproval = page.getByText("API Key Approval");
      await expect(apiKeyApproval).not.toBeVisible({ timeout: TIMEOUTS.QUICK });
    });
  });

  test.describe("API Key-only API (toystore-api)", () => {
    const apiProductPath = "/kuadrant/api-products/toystore/toystore-api";

    test("should show API Key Approval field", async ({ page }) => {
      await page.goto(apiProductPath);
      await page.waitForLoadState("networkidle").catch(() => {});

      const apiKeyApproval = page.getByText("API Key Approval");
      await expect(apiKeyApproval).toBeVisible({ timeout: TIMEOUTS.SLOW });
    });

    test("should NOT show OIDC tab", async ({ page }) => {
      await page.goto(apiProductPath);
      await page.waitForLoadState("networkidle").catch(() => {});

      // wait for page to load
      const productCard = page.getByText("API Product").first();
      await expect(productCard).toBeVisible({ timeout: TIMEOUTS.SLOW });

      // OIDC tab should not be visible
      const oidcTab = page.getByRole("tab", { name: "OIDC" });
      const tabVisible = await isElementVisible(oidcTab, TIMEOUTS.DEFAULT);
      expect(tabVisible).toBe(false);
    });
  });

  test.describe("Mixed Auth API (gamestore-admin)", () => {
    const apiProductPath = "/kuadrant/api-products/gamestore/gamestore-admin";

    test("should show OIDC tab and API Key Approval", async ({ page }) => {
      await page.goto(apiProductPath);
      await page.waitForLoadState("networkidle").catch(() => {});

      // should show OIDC tab
      const oidcTab = page.getByRole("tab", { name: "OIDC" });
      await expect(oidcTab).toBeVisible({ timeout: TIMEOUTS.SLOW });

      // should also show API Key Approval on Overview
      const apiKeyApproval = page.getByText("API Key Approval");
      await expect(apiKeyApproval).toBeVisible({ timeout: TIMEOUTS.DEFAULT });
    });

    test("should show OIDC Provider Discovery when clicking OIDC tab", async ({ page }) => {
      await page.goto(apiProductPath);
      await page.waitForLoadState("networkidle").catch(() => {});

      // click on OIDC tab
      const oidcTab = page.getByRole("tab", { name: "OIDC" });
      await oidcTab.click();

      // should show OIDC card
      const oidcCard = page.getByText("OIDC Provider Discovery");
      await expect(oidcCard).toBeVisible({ timeout: TIMEOUTS.SLOW });
    });
  });

  test.describe("Catalog Entity Page - API Keys Tab", () => {
    test("OIDC-only API should NOT show API Keys tab", async ({ page }) => {
      await page.goto("/catalog/default/api/gamestore-api");
      await page.waitForLoadState("networkidle").catch(() => {});

      // wait for entity page to load
      const entityPage = page.locator("main");
      await expect(entityPage).toBeVisible({ timeout: TIMEOUTS.SLOW });

      // API Keys tab should not be visible
      const apiKeysTab = page.getByRole("tab", { name: /api keys/i });
      const tabVisible = await isElementVisible(apiKeysTab, TIMEOUTS.DEFAULT);
      expect(tabVisible).toBe(false);
    });

    test("API Key-enabled API should show API Keys tab", async ({ page }) => {
      await page.goto("/catalog/default/api/toystore-api");
      await page.waitForLoadState("networkidle").catch(() => {});

      // wait for entity page to load
      const entityPage = page.locator("main");
      await expect(entityPage).toBeVisible({ timeout: TIMEOUTS.SLOW });

      // API Keys tab should be visible
      const apiKeysTab = page.getByRole("tab", { name: /api keys/i });
      await expect(apiKeysTab).toBeVisible({ timeout: TIMEOUTS.DEFAULT });
    });

    test("Mixed auth API should show API Keys tab", async ({ page }) => {
      await page.goto("/catalog/default/api/gamestore-admin");
      await page.waitForLoadState("networkidle").catch(() => {});

      // wait for entity page to load
      const entityPage = page.locator("main");
      await expect(entityPage).toBeVisible({ timeout: TIMEOUTS.SLOW });

      // API Keys tab should be visible
      const apiKeysTab = page.getByRole("tab", { name: /api keys/i });
      await expect(apiKeysTab).toBeVisible({ timeout: TIMEOUTS.DEFAULT });
    });
  });

  test.describe("Catalog Entity Page - Kuadrant API Keys Card", () => {
    test("OIDC-only API should NOT show Kuadrant API Keys card on Overview", async ({ page }) => {
      await page.goto("/catalog/default/api/gamestore-api");
      await page.waitForLoadState("networkidle").catch(() => {});

      // wait for entity page to load
      const entityPage = page.locator("main");
      await expect(entityPage).toBeVisible({ timeout: TIMEOUTS.SLOW });

      // Kuadrant API Keys card should not be visible
      const apiKeysCard = page.getByText("Kuadrant API Keys");
      const cardVisible = await isElementVisible(apiKeysCard, TIMEOUTS.DEFAULT);
      expect(cardVisible).toBe(false);
    });

    test("API Key-enabled API should show Kuadrant API Keys card on Overview", async ({ page }) => {
      await page.goto("/catalog/default/api/toystore-api");
      await page.waitForLoadState("networkidle").catch(() => {});

      // wait for entity page to load
      const entityPage = page.locator("main");
      await expect(entityPage).toBeVisible({ timeout: TIMEOUTS.SLOW });

      // Kuadrant API Keys card should be visible
      const apiKeysCard = page.getByText("Kuadrant API Keys");
      await expect(apiKeysCard).toBeVisible({ timeout: TIMEOUTS.DEFAULT });
    });
  });
});
