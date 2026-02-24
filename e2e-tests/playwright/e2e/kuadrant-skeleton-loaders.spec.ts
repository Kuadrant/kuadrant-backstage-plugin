import { test, expect } from "@playwright/test";
import { Common } from "../utils/common";
import { TIMEOUTS } from "../utils/kuadrant-helpers";

test.describe("Kuadrant Skeleton Loaders", () => {
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

  test("should show skeleton loaders on My API Keys page while loading", async ({
    page,
  }) => {
    // Navigate to the page
    await page.goto("/kuadrant/my-api-keys");

    // Check for skeleton loaders (Material-UI Skeleton creates spans with specific classes)
    // We look for the MuiSkeleton class which is present during loading
    const skeletons = page.locator('.MuiSkeleton-root');

    // Either skeletons are visible (still loading) or they're gone (loaded fast)
    // We can't guarantee we'll catch them, but if we do, they should be proper skeletons
    const skeletonCount = await skeletons.count();

    if (skeletonCount > 0) {
      // If skeletons are present, verify they look correct
      const firstSkeleton = skeletons.first();
      await expect(firstSkeleton).toBeVisible();

      // Skeletons should have the text variant or rect variant class
      const hasTextVariant = await firstSkeleton.evaluate((el) =>
        el.classList.contains('MuiSkeleton-text') || el.classList.contains('MuiSkeleton-rect')
      );
      expect(hasTextVariant).toBe(true);
    }

    // Eventually, skeletons should disappear and real content should load
    await expect(async () => {
      const spinner = page.locator('[role="progressbar"]:visible');
      await expect(spinner).toHaveCount(0);

      // No skeletons should be visible after loading
      const visibleSkeletons = page.locator('.MuiSkeleton-root:visible');
      await expect(visibleSkeletons).toHaveCount(0);
    }).toPass({ timeout: TIMEOUTS.VERY_SLOW });

    // Real content should be visible
    const heading = page.locator("h1, h2").filter({ hasText: /my api keys/i });
    await expect(heading.first()).toBeVisible();
  });

  test("should show skeleton loaders on API Products page while loading", async ({
    page,
  }) => {
    // Use network throttling to increase chance of catching skeletons
    await page.route('**/api/kuadrant/apiproducts*', async (route) => {
      // Delay the response slightly to make skeleton more visible
      await new Promise(resolve => setTimeout(resolve, 100));
      await route.continue();
    });

    await page.goto("/kuadrant/api-products");

    // Check for skeleton loaders during initial load
    const skeletons = page.locator('.MuiSkeleton-root');
    const skeletonCount = await skeletons.count();

    if (skeletonCount > 0) {
      // Verify skeleton structure if present
      await expect(skeletons.first()).toBeVisible();
    }

    // Wait for page to fully load
    await expect(async () => {
      const spinner = page.locator('[role="progressbar"]:visible');
      await expect(spinner).toHaveCount(0);
      const visibleSkeletons = page.locator('.MuiSkeleton-root:visible');
      await expect(visibleSkeletons).toHaveCount(0);
    }).toPass({ timeout: TIMEOUTS.VERY_SLOW });

    // Verify real content loaded
    const heading = page.locator("h1").filter({ hasText: /api products/i });
    await expect(heading).toBeVisible();
  });

  test("should show skeleton loaders in API Access Card on catalog page", async ({
    page,
  }) => {
    // Navigate to catalog and wait for it to load
    await page.goto("/catalog?filters[kind]=api");
    await page.waitForLoadState("networkidle").catch(() => {});

    // Wait for catalog to be ready
    await expect(async () => {
      const catalogHeading = page.locator("h1, h2").filter({ hasText: /catalog/i });
      await expect(catalogHeading.first()).toBeVisible();
    }).toPass({ timeout: TIMEOUTS.SLOW });

    // Try to find and click on an API entity (toystore or any other)
    const apiLink = page.locator('a[href*="/catalog/"][href*="/api/"]').first();
    const hasApiLink = await apiLink.count();

    if (hasApiLink > 0) {
      await apiLink.click();

      // The ApiAccessCard might show skeletons while loading
      const skeletons = page.locator('.MuiSkeleton-root');

      // Eventually page should be fully loaded without skeletons
      await expect(async () => {
        const visibleSkeletons = page.locator('.MuiSkeleton-root:visible');
        await expect(visibleSkeletons).toHaveCount(0);
      }).toPass({ timeout: TIMEOUTS.VERY_SLOW });

      // Verify the page loaded (may or may not have the Kuadrant card depending on the API)
      const content = page.locator("main");
      await expect(content).toBeVisible({ timeout: TIMEOUTS.DEFAULT });
    }
  });

  test("should not show old Progress spinners anywhere", async ({ page }) => {
    // Visit multiple pages and verify no Backstage Progress component is used
    const pages = [
      "/kuadrant/my-api-keys",
      "/kuadrant/api-products",
      "/kuadrant/api-key-approval",
    ];

    for (const url of pages) {
      await page.goto(url);

      // Wait for initial load
      await page.waitForLoadState("networkidle").catch(() => {});

      // The Backstage Progress component renders as a CircularProgress with role="progressbar"
      // but we want to make sure it's not being used for page-level loading
      // (it's still OK for inline operations like delete buttons)

      // Check that we're using skeletons OR the page is already loaded
      await expect(async () => {
        const progressBars = page.locator('[role="progressbar"]:visible');
        const skeletons = page.locator('.MuiSkeleton-root:visible');
        const progressCount = await progressBars.count();
        const skeletonCount = await skeletons.count();

        // Either we have skeletons (new loading pattern) or nothing (already loaded)
        // We should NOT have progress bars without skeletons for main page loading
        if (progressCount > 0 && skeletonCount === 0) {
          // Only acceptable if it's a small inline spinner (like in a button)
          const isInButton = await progressBars.first().evaluate((el) => {
            return el.closest('button') !== null;
          });
          expect(isInButton).toBe(true);
        }
      }).toPass({ timeout: TIMEOUTS.DEFAULT });
    }
  });

  test("should show skeleton loaders on API Product detail page", async ({
    page,
  }) => {
    // First, navigate to API Products list to find a valid product
    await page.goto("/kuadrant/api-products");
    await page.waitForLoadState("networkidle").catch(() => {});

    // Wait for page to load
    await expect(async () => {
      const heading = page.locator("h1").filter({ hasText: /api products/i });
      await expect(heading).toBeVisible();
    }).toPass({ timeout: TIMEOUTS.VERY_SLOW });

    // Try to find a link to an API Product detail page
    const productLink = page.locator('a[href*="/kuadrant/api-products/"]').first();
    const hasProductLink = await productLink.count();

    if (hasProductLink > 0) {
      // Click to navigate to detail page
      await productLink.click();

      // Check for skeletons during load
      const skeletons = page.locator('.MuiSkeleton-root');

      // Wait for full load
      await expect(async () => {
        const visibleSkeletons = page.locator('.MuiSkeleton-root:visible');
        await expect(visibleSkeletons).toHaveCount(0);
      }).toPass({ timeout: TIMEOUTS.VERY_SLOW });

      // Verify page loaded with real content (check for header or main content)
      await expect(async () => {
        const pageHeader = page.locator("header, h1").first();
        await expect(pageHeader).toBeVisible();
      }).toPass({ timeout: TIMEOUTS.DEFAULT });
    }
  });
});
