import { MCPGatewayExtension, McpCondition } from "../../types/mcp";
import { formatAge, formatOwner, isExtensionReady } from "./utils";

const cond = (
  type: string,
  status: "True" | "False" | "Unknown",
): McpCondition => ({ type, status });

const extension = (
  opts: {
    conditions?: McpCondition[];
    ownerReferences?: MCPGatewayExtension["metadata"]["ownerReferences"];
  } = {},
): MCPGatewayExtension => ({
  metadata: {
    name: "ext",
    namespace: "ns",
    ...(opts.ownerReferences ? { ownerReferences: opts.ownerReferences } : {}),
  },
  spec: { targetRef: { name: "gw" } },
  status: opts.conditions ? { conditions: opts.conditions } : undefined,
});

describe("isExtensionReady", () => {
  it("is ready when the Ready condition is True", () => {
    expect(
      isExtensionReady(extension({ conditions: [cond("Ready", "True")] })),
    ).toBe(true);
  });

  it("is not ready when the Ready condition is False", () => {
    expect(
      isExtensionReady(extension({ conditions: [cond("Ready", "False")] })),
    ).toBe(false);
  });

  it("is not ready when status is missing", () => {
    expect(isExtensionReady(extension())).toBe(false);
  });

  it("is not ready when only a different condition is True", () => {
    expect(
      isExtensionReady(extension({ conditions: [cond("Accepted", "True")] })),
    ).toBe(false);
  });
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
        extension({
          ownerReferences: [{ kind: "Gateway", name: "prod-gateway" }],
        }),
      ),
    ).toBe("Gateway/prod-gateway");
  });

  it("uses the first owner reference when several are present", () => {
    expect(
      formatOwner(
        extension({
          ownerReferences: [
            { kind: "Gateway", name: "first" },
            { kind: "Service", name: "second" },
          ],
        }),
      ),
    ).toBe("Gateway/first");
  });

  it("falls back to a placeholder when there is no owner reference", () => {
    expect(formatOwner(extension())).toBe("No owner reference");
  });
});
