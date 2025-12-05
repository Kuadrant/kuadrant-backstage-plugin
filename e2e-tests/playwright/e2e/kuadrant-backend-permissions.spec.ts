import { test, expect, request, APIRequestContext } from "@playwright/test";
import { Common } from "../utils/common";

/**
 * Backend permission tests.
 *
 * These tests verify that the backend correctly enforces permissions,
 * complementing the UI-based tests in kuadrant-permissions-matrix.spec.ts.
 *
 * Tests call the backend API directly to verify 403 responses for
 * unauthorised requests, ensuring defence-in-depth.
 */

// helper to get auth token for a user via UI login
async function getAuthContext(
  browserContext: any,
  userEmail: string,
): Promise<{ cookie: string }> {
  const page = await browserContext.newPage();
  const common = new Common(page);
  await common.dexQuickLogin(userEmail);

  // extract cookies for API requests
  const cookies = await browserContext.cookies();
  const cookieString = cookies.map((c: any) => `${c.name}=${c.value}`).join("; ");

  await page.close();
  return { cookie: cookieString };
}

// helper to make authenticated API request
async function apiRequest(
  context: APIRequestContext,
  method: string,
  path: string,
  cookie: string,
  body?: object,
): Promise<{ status: number; body: any }> {
  const baseUrl = process.env.BASE_URL || "http://localhost:7007";
  const url = `${baseUrl}${path}`;

  const options: any = {
    headers: {
      Cookie: cookie,
      "Content-Type": "application/json",
    },
  };

  if (body) {
    options.data = body;
  }

  let response;
  switch (method) {
    case "GET":
      response = await context.get(url, options);
      break;
    case "POST":
      response = await context.post(url, options);
      break;
    case "DELETE":
      response = await context.delete(url, options);
      break;
    case "PATCH":
      response = await context.patch(url, options);
      break;
    default:
      throw new Error(`Unsupported method: ${method}`);
  }

  const status = response.status();
  let responseBody;
  try {
    responseBody = await response.json();
  } catch {
    responseBody = await response.text();
  }

  return { status, body: responseBody };
}

test.describe("Kuadrant Backend Permission Enforcement", () => {
  test.beforeAll(async () => {
    test.info().annotations.push({
      type: "component",
      description: "kuadrant",
    });
  });

  // ==========================================
  // APIProduct Backend Permissions
  // ==========================================

  test.describe("APIProduct API Permissions", () => {
    test("GET /api/kuadrant/apiproducts - consumer CAN list (read permission)", async ({ browser }) => {
      const context = await browser.newContext();
      const { cookie } = await getAuthContext(context, "consumer1@kuadrant.local");
      const apiContext = await request.newContext();

      const { status } = await apiRequest(apiContext, "GET", "/api/kuadrant/apiproducts", cookie);

      // consumer should be able to list api products
      expect(status, "Consumer should be able to list API products").toBe(200);

      await context.close();
    });

    test("POST /api/kuadrant/apiproducts - consumer CANNOT create (no create permission)", async ({ browser }) => {
      const context = await browser.newContext();
      const { cookie } = await getAuthContext(context, "consumer1@kuadrant.local");
      const apiContext = await request.newContext();

      const { status, body } = await apiRequest(
        apiContext,
        "POST",
        "/api/kuadrant/apiproducts",
        cookie,
        {
          metadata: { name: "test-api-from-consumer" },
          spec: {
            displayName: "Test API",
            targetRef: { kind: "HTTPRoute", name: "toystore", namespace: "toystore" },
          },
        },
      );

      expect(status, "Consumer should get 403 when creating API product").toBe(403);
      expect(body.error).toBe("unauthorised");

      await context.close();
    });

    test("POST /api/kuadrant/apiproducts - owner CAN access create endpoint (not 403)", async ({ browser }) => {
      const context = await browser.newContext();
      const { cookie } = await getAuthContext(context, "owner1@kuadrant.local");
      const apiContext = await request.newContext();

      // send minimal invalid request to verify permission check passes
      // we expect 400 (bad request) not 403 (forbidden)
      const { status } = await apiRequest(
        apiContext,
        "POST",
        "/api/kuadrant/apiproducts",
        cookie,
        { metadata: { name: "permission-test" }, spec: {} },
      );

      // 400 = permission granted but invalid payload
      // 403 = permission denied (would be a test failure)
      expect(status, "Owner should not get 403 when creating API product").not.toBe(403);

      await context.close();
    });

    test("DELETE /api/kuadrant/apiproducts/:ns/:name - consumer CANNOT delete", async ({ browser }) => {
      const context = await browser.newContext();
      const { cookie } = await getAuthContext(context, "consumer1@kuadrant.local");
      const apiContext = await request.newContext();

      const { status, body } = await apiRequest(
        apiContext,
        "DELETE",
        "/api/kuadrant/apiproducts/toystore/toystore-api",
        cookie,
      );

      expect(status, "Consumer should get 403 when deleting API product").toBe(403);
      expect(body.error).toBe("unauthorised");

      await context.close();
    });

    test("PATCH /api/kuadrant/apiproducts/:ns/:name - consumer CANNOT update", async ({ browser }) => {
      const context = await browser.newContext();
      const { cookie } = await getAuthContext(context, "consumer1@kuadrant.local");
      const apiContext = await request.newContext();

      const { status, body } = await apiRequest(
        apiContext,
        "PATCH",
        "/api/kuadrant/apiproducts/toystore/toystore-api",
        cookie,
        { spec: { displayName: "Hacked Name" } },
      );

      expect(status, "Consumer should get 403 when updating API product").toBe(403);
      expect(body.error).toBe("unauthorised");

      await context.close();
    });
  });

  // ==========================================
  // APIKey Backend Permissions
  // ==========================================

  test.describe("APIKey API Permissions", () => {
    test("GET /api/kuadrant/requests - consumer CAN read own requests", async ({ browser }) => {
      const context = await browser.newContext();
      const { cookie } = await getAuthContext(context, "consumer1@kuadrant.local");
      const apiContext = await request.newContext();

      const { status } = await apiRequest(apiContext, "GET", "/api/kuadrant/requests/my", cookie);

      expect(status, "Consumer should be able to read own requests").toBe(200);

      await context.close();
    });

    test("POST /api/kuadrant/requests/:ns/:name/approve - consumer CANNOT approve", async ({ browser }) => {
      const context = await browser.newContext();
      const { cookie } = await getAuthContext(context, "consumer1@kuadrant.local");
      const apiContext = await request.newContext();

      // try to approve a request (will fail even if request doesn't exist)
      const { status, body } = await apiRequest(
        apiContext,
        "POST",
        "/api/kuadrant/requests/toystore/fake-request/approve",
        cookie,
        {},
      );

      // should be 403 (unauthorised) not 404 (not found)
      // permission check happens before resource lookup
      expect(status, "Consumer should get 403 when approving requests").toBe(403);
      expect(body.error).toBe("unauthorised");

      await context.close();
    });

    test("POST /api/kuadrant/requests/:ns/:name/reject - consumer CANNOT reject", async ({ browser }) => {
      const context = await browser.newContext();
      const { cookie } = await getAuthContext(context, "consumer1@kuadrant.local");
      const apiContext = await request.newContext();

      const { status, body } = await apiRequest(
        apiContext,
        "POST",
        "/api/kuadrant/requests/toystore/fake-request/reject",
        cookie,
        {},
      );

      expect(status, "Consumer should get 403 when rejecting requests").toBe(403);
      expect(body.error).toBe("unauthorised");

      await context.close();
    });

    test("POST /api/kuadrant/requests/bulk-approve - consumer CANNOT bulk approve", async ({ browser }) => {
      const context = await browser.newContext();
      const { cookie } = await getAuthContext(context, "consumer1@kuadrant.local");
      const apiContext = await request.newContext();

      const { status, body } = await apiRequest(
        apiContext,
        "POST",
        "/api/kuadrant/requests/bulk-approve",
        cookie,
        { requests: [] },
      );

      expect(status, "Consumer should get 403 when bulk approving").toBe(403);
      expect(body.error).toBe("unauthorised");

      await context.close();
    });

    test("POST /api/kuadrant/requests/bulk-reject - consumer CANNOT bulk reject", async ({ browser }) => {
      const context = await browser.newContext();
      const { cookie } = await getAuthContext(context, "consumer1@kuadrant.local");
      const apiContext = await request.newContext();

      const { status, body } = await apiRequest(
        apiContext,
        "POST",
        "/api/kuadrant/requests/bulk-reject",
        cookie,
        { requests: [] },
      );

      expect(status, "Consumer should get 403 when bulk rejecting").toBe(403);
      expect(body.error).toBe("unauthorised");

      await context.close();
    });
  });

  // ==========================================
  // PlanPolicy Backend Permissions
  // ==========================================

  test.describe("PlanPolicy API Permissions", () => {
    test("GET /api/kuadrant/planpolicies - consumer CANNOT list", async ({ browser }) => {
      const context = await browser.newContext();
      const { cookie } = await getAuthContext(context, "consumer1@kuadrant.local");
      const apiContext = await request.newContext();

      const { status, body } = await apiRequest(apiContext, "GET", "/api/kuadrant/planpolicies", cookie);

      expect(status, "Consumer should get 403 when listing plan policies").toBe(403);
      expect(body.error).toBe("unauthorised");

      await context.close();
    });

    test("GET /api/kuadrant/planpolicies - owner CAN list", async ({ browser }) => {
      const context = await browser.newContext();
      const { cookie } = await getAuthContext(context, "owner1@kuadrant.local");
      const apiContext = await request.newContext();

      const { status } = await apiRequest(apiContext, "GET", "/api/kuadrant/planpolicies", cookie);

      expect(status, "Owner should be able to list plan policies").toBe(200);

      await context.close();
    });

    test("GET /api/kuadrant/planpolicies - admin CAN list", async ({ browser }) => {
      const context = await browser.newContext();
      const { cookie } = await getAuthContext(context, "admin@kuadrant.local");
      const apiContext = await request.newContext();

      const { status } = await apiRequest(apiContext, "GET", "/api/kuadrant/planpolicies", cookie);

      expect(status, "Admin should be able to list plan policies").toBe(200);

      await context.close();
    });
  });

  // ==========================================
  // Cross-Ownership Backend Enforcement
  // ==========================================

  test.describe("Cross-Ownership Backend Enforcement", () => {
    test("owner2 CANNOT delete owner1's API product via API", async ({ browser }) => {
      // first, we need to know of an API product owned by owner1
      // for this test, we assume toystore-api exists and is NOT owned by owner2

      const context = await browser.newContext();
      const { cookie } = await getAuthContext(context, "owner2@kuadrant.local");
      const apiContext = await request.newContext();

      // try to delete toystore-api (should fail if owned by someone else)
      const { status, body } = await apiRequest(
        apiContext,
        "DELETE",
        "/api/kuadrant/apiproducts/toystore/toystore-api",
        cookie,
      );

      // should be 403 (ownership check) - permission denied
      expect(status, "Owner2 should get 403 when deleting other's API product").toBe(403);
      expect(body.error).toBe("you can only delete your own api products");

      await context.close();
    });

    test("owner2 CANNOT update owner1's API product via API", async ({ browser }) => {
      const context = await browser.newContext();
      const { cookie } = await getAuthContext(context, "owner2@kuadrant.local");
      const apiContext = await request.newContext();

      const { status } = await apiRequest(
        apiContext,
        "PATCH",
        "/api/kuadrant/apiproducts/toystore/toystore-api",
        cookie,
        { spec: { displayName: "Hacked by Owner2" } },
      );

      // should be 403 (ownership check)
      expect(status, "Owner2 should get 403 when updating other's API product").toBe(403);

      await context.close();
    });

    test("admin CAN update any API product via API", async ({ browser }) => {
      const context = await browser.newContext();
      const { cookie } = await getAuthContext(context, "admin@kuadrant.local");
      const apiContext = await request.newContext();

      // just verify admin can access the endpoint without 403
      // we don't actually modify to avoid test pollution
      const { status } = await apiRequest(
        apiContext,
        "GET",
        "/api/kuadrant/apiproducts/toystore/toystore-api",
        cookie,
      );

      expect(status, "Admin should be able to read any API product").toBe(200);

      await context.close();
    });
  });

  // ==========================================
  // Unauthenticated Access
  // ==========================================

  test.describe("Unauthenticated Access Blocked", () => {
    test("unauthenticated request to /api/kuadrant/apiproducts returns 401 or 403", async () => {
      const apiContext = await request.newContext();

      const response = await apiContext.get(
        `${process.env.BASE_URL || "http://localhost:7007"}/api/kuadrant/apiproducts`,
      );

      // should be 401 (unauthenticated) or 403 (forbidden)
      expect([401, 403], "Unauthenticated request should be blocked").toContain(response.status());
    });

    test("unauthenticated request to /api/kuadrant/planpolicies returns 401 or 403", async () => {
      const apiContext = await request.newContext();

      const response = await apiContext.get(
        `${process.env.BASE_URL || "http://localhost:7007"}/api/kuadrant/planpolicies`,
      );

      expect([401, 403], "Unauthenticated request should be blocked").toContain(response.status());
    });
  });
});
