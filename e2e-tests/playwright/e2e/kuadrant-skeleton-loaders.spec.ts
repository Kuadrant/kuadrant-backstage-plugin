import { test, expect, type Page } from "../fixtures/test";
import { loginAs } from "../support/auth/login-as";
import { TIMEOUTS } from "../utils/kuadrant-helpers";

// skeletons on screen in the page content, read in one evaluateAll(). they can go
// between separate calls, and an auto-waiting assertion on one that has gone fails
// at its timeout. returns the classes of any without the text or rect variant.
async function malformedSkeletons(page: Page): Promise<string[]> {
  return page
    .locator("main .MuiSkeleton-root:visible")
    .evaluateAll((els) =>
      els
        .filter(
          (el) =>
            !el.classList.contains("MuiSkeleton-text") &&
            !el.classList.contains("MuiSkeleton-rect"),
        )
        .map((el) => el.className),
    );
}

test.describe("Kuadrant Skeleton Loaders", () => {
  test.beforeAll(async () => {
    test.info().annotations.push({
      type: "component",
      description: "kuadrant",
    });
  });

  test.beforeEach(async ({ page }) => {
    await loginAs(page, "admin@kuadrant.local");
  });

  test("should show skeleton loaders on My API Keys page while loading", async ({
    page,
  }) => {
    // Navigate to the page
    await page.goto("/kuadrant/my-api-keys");

    // Check for skeleton loaders (Material-UI Skeleton creates spans with specific classes)
    // Either skeletons are visible (still loading) or they're gone (loaded fast)
    // We can't guarantee we'll catch them, but if we do, they should be proper skeletons
    expect(await malformedSkeletons(page)).toEqual([]);

    // Eventually, skeletons should disappear and real content should load
    await expect(async () => {
      const spinner = page.locator('main [role="progressbar"]:visible');
      await expect(spinner).toHaveCount(0);

      // No skeletons should be visible after loading
      const visibleSkeletons = page.locator(".MuiSkeleton-root:visible");
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
    await page.route("**/api/kuadrant/apiproducts*", async (route) => {
      // Delay the response slightly to make skeleton more visible
      await new Promise((resolve) => setTimeout(resolve, 100));
      await route.continue();
    });

    await page.goto("/kuadrant/api-products");

    // Check for skeleton loaders during initial load, and their structure if present
    expect(await malformedSkeletons(page)).toEqual([]);

    // Wait for page to fully load
    await expect(async () => {
      const spinner = page.locator('main [role="progressbar"]:visible');
      await expect(spinner).toHaveCount(0);
      const visibleSkeletons = page.locator(".MuiSkeleton-root:visible");
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
    await page.waitForLoadState("load").catch(() => {});

    // Wait for catalog to be ready
    await expect(async () => {
      const catalogHeading = page
        .locator("h1, h2")
        .filter({ hasText: /catalog/i });
      await expect(catalogHeading.first()).toBeVisible();
    }).toPass({ timeout: TIMEOUTS.SLOW });

    // the catalog is seeded with APIProducts by setup-cluster.sh, so an api
    // entity is expected rather than optional - the old `if (count > 0)` meant
    // an empty catalog passed this test without ever opening an entity page.
    const apiLink = page.locator('a[href*="/catalog/"][href*="/api/"]').first();
    await expect(
      apiLink,
      "catalog should list at least one api entity to open",
    ).toBeVisible({ timeout: TIMEOUTS.SLOW });
    await apiLink.click();

    // Eventually page should be fully loaded without skeletons
    await expect(async () => {
      const visibleSkeletons = page.locator(".MuiSkeleton-root:visible");
      await expect(visibleSkeletons).toHaveCount(0);
    }).toPass({ timeout: TIMEOUTS.VERY_SLOW });

    // Verify the page loaded (may or may not have the Kuadrant card depending on the API)
    const content = page.locator("main");
    await expect(content).toBeVisible({ timeout: TIMEOUTS.DEFAULT });
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

      // The Backstage Progress component renders as a CircularProgress with role="progressbar"
      // but we want to make sure it's not being used for page-level loading in Kuadrant components
      // (it's still OK for inline operations like delete buttons)

      // Check that we're using skeletons OR the page is already loaded
      await expect(async () => {
        // the app's own loaders show briefly after navigation. count them in one pass:
        // one can vanish between two calls, and evaluate() then waits out the timeout
        const pageSpinners = await page
          .locator('main [role="progressbar"]:visible')
          .evaluateAll(
            (els) => els.filter((el) => el.closest("button") === null).length,
          );
        const skeletonCount = await page
          .locator(".MuiSkeleton-root:visible")
          .count();

        // Either we have skeletons (new loading pattern) or nothing (already loaded)
        // We should NOT have progress bars without skeletons for main page loading
        if (skeletonCount === 0) {
          expect(pageSpinners).toBe(0);
        }
      }).toPass({ timeout: TIMEOUTS.DEFAULT });
    }
  });

  test("should show skeleton loaders on API Product detail page", async ({
    page,
  }) => {
    // First, navigate to API Products list to find a valid product
    await page.goto("/kuadrant/api-products");
    await page.waitForLoadState("load").catch(() => {});

    // Wait for page to load
    await expect(async () => {
      const heading = page.locator("h1").filter({ hasText: /api products/i });
      await expect(heading).toBeVisible();
    }).toPass({ timeout: TIMEOUTS.VERY_SLOW });

    // as above: the demo APIProducts are seeded, so a product link is expected.
    const productLink = page
      .locator('a[href*="/kuadrant/api-products/"]')
      .first();
    await expect(
      productLink,
      "api products list should link to at least one product",
    ).toBeVisible({ timeout: TIMEOUTS.SLOW });
    await productLink.click();

    // Wait for full load
    await expect(async () => {
      const visibleSkeletons = page.locator(".MuiSkeleton-root:visible");
      await expect(visibleSkeletons).toHaveCount(0);
    }).toPass({ timeout: TIMEOUTS.VERY_SLOW });

    // Verify page loaded with real content (check for header or main content)
    await expect(async () => {
      const pageHeader = page.locator("header, h1").first();
      await expect(pageHeader).toBeVisible();
    }).toPass({ timeout: TIMEOUTS.DEFAULT });
  });
});
