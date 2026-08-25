import { HTTPRouteResource } from "../../types/mcp";
import { isHttpRouteReady, formatAge, formatOwner, formatParentRefs } from "./utils";

describe("McpHTTPRouteExtensionDetailPage utils", () => {
  describe("isHttpRouteReady", () => {
    it("returns true when first parent has Accepted=True condition", () => {
      const route: HTTPRouteResource = {
        metadata: { name: "test-route", namespace: "default" },
        status: {
          parents: [
            {
              conditions: [
                { type: "Accepted", status: "True" },
              ],
            },
          ],
        },
      };
      expect(isHttpRouteReady(route)).toBe(true);
    });

    it("returns false when first parent has Accepted=False condition", () => {
      const route: HTTPRouteResource = {
        metadata: { name: "test-route", namespace: "default" },
        status: {
          parents: [
            {
              conditions: [
                { type: "Accepted", status: "False" },
              ],
            },
          ],
        },
      };
      expect(isHttpRouteReady(route)).toBe(false);
    });

    it("returns false when no status is present", () => {
      const route: HTTPRouteResource = {
        metadata: { name: "test-route", namespace: "default" },
      };
      expect(isHttpRouteReady(route)).toBe(false);
    });
  });

  describe("formatAge", () => {
    it("returns relative time for timestamps", () => {
      const now = new Date();
      const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
      expect(formatAge(fiveMinutesAgo)).toBe("5m");
    });

    it("returns '-' for undefined timestamp", () => {
      expect(formatAge(undefined)).toBe("-");
    });
  });

  describe("formatOwner", () => {
    it("formats owner reference as Kind/name", () => {
      const route: HTTPRouteResource = {
        metadata: {
          name: "test-route",
          namespace: "default",
          ownerReferences: [
            { kind: "Gateway", name: "my-gateway" },
          ],
        },
      };
      expect(formatOwner(route)).toBe("Gateway/my-gateway");
    });

    it("returns default message when no owner references", () => {
      const route: HTTPRouteResource = {
        metadata: { name: "test-route", namespace: "default" },
      };
      expect(formatOwner(route)).toBe("No owner reference");
    });
  });

  describe("formatParentRefs", () => {
    it("formats parent refs with namespace when different", () => {
      const route: HTTPRouteResource = {
        metadata: { name: "test-route", namespace: "default" },
        spec: {
          parentRefs: [
            { name: "gateway-1", namespace: "other-ns" },
            { name: "gateway-2" }, // should use route's namespace
          ],
        },
      };
      const result = formatParentRefs(route);
      expect(result).toEqual(["gateway-1 (other-ns)", "gateway-2"]);
    });

    it("returns empty array when no parent refs", () => {
      const route: HTTPRouteResource = {
        metadata: { name: "test-route", namespace: "default" },
      };
      expect(formatParentRefs(route)).toEqual([]);
    });
  });
});
