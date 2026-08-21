import { MCPServerRegistration } from "../../types/mcp";
import { formatAge, formatOwner } from "./utils";

const server = (
  opts: {
    ownerReferences?: MCPServerRegistration["metadata"]["ownerReferences"];
  } = {},
): MCPServerRegistration => ({
  metadata: {
    name: "srv",
    namespace: "ns",
    ...(opts.ownerReferences ? { ownerReferences: opts.ownerReferences } : {}),
  },
  spec: { targetRef: { kind: "HTTPRoute", name: "route" } },
});

describe("formatAge", () => {
  const now = new Date("2026-08-20T12:00:00Z").getTime();

  beforeEach(() => {
    jest.spyOn(Date, "now").mockReturnValue(now);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("returns '-' when no timestamp is given", () => {
    expect(formatAge(undefined)).toBe("-");
  });

  it("formats a multi-day age in days", () => {
    expect(formatAge("2026-08-17T12:00:00Z")).toBe("3d");
  });

  it("formats a multi-hour age in hours", () => {
    expect(formatAge("2026-08-20T10:00:00Z")).toBe("2h");
  });

  it("formats a multi-minute age in minutes", () => {
    expect(formatAge("2026-08-20T11:55:00Z")).toBe("5m");
  });

  it("returns 'just now' for a sub-minute age", () => {
    expect(formatAge("2026-08-20T11:59:30Z")).toBe("just now");
  });
});

describe("formatOwner", () => {
  it("builds a Kind/name label from the first owner reference", () => {
    expect(
      formatOwner(
        server({
          ownerReferences: [{ kind: "HTTPRoute", name: "route-1" }],
        }),
      ),
    ).toBe("HTTPRoute/route-1");
  });

  it("uses the first owner reference when several are present", () => {
    expect(
      formatOwner(
        server({
          ownerReferences: [
            { kind: "HTTPRoute", name: "first" },
            { kind: "Service", name: "second" },
          ],
        }),
      ),
    ).toBe("HTTPRoute/first");
  });

  it("falls back to a placeholder when there is no owner reference", () => {
    expect(formatOwner(server())).toBe("No owner reference");
  });
});
