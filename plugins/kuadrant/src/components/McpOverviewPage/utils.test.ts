import {
  GatewayResource,
  MCPGatewayExtension,
  MCPServerRegistration,
  McpCondition,
} from "../../types/mcp";
import {
  countHealthyGateways,
  countOnlineServers,
  countServerTypes,
  deriveMcpGateways,
  hasCondition,
  isGatewayHealthy,
  isServerOnline,
} from "./utils";

const cond = (
  type: string,
  status: "True" | "False" | "Unknown",
): McpCondition => ({ type, status });

const gateway = (
  name: string,
  namespace: string,
  conditions?: McpCondition[],
): GatewayResource => ({
  metadata: { name, namespace },
  status: conditions ? { conditions } : undefined,
});

const extension = (
  name: string,
  namespace: string,
  targetName: string,
  targetNamespace?: string,
): MCPGatewayExtension => ({
  metadata: { name, namespace },
  spec: {
    targetRef: {
      name: targetName,
      ...(targetNamespace ? { namespace: targetNamespace } : {}),
    },
  },
});

const server = (
  name: string,
  namespace: string,
  opts: { conditions?: McpCondition[]; category?: string[] } = {},
): MCPServerRegistration => ({
  metadata: { name, namespace },
  spec: opts.category ? { category: opts.category } : undefined,
  status: opts.conditions ? { conditions: opts.conditions } : undefined,
});

describe("hasCondition", () => {
  it("returns false when conditions is undefined", () => {
    expect(hasCondition(undefined, "Ready")).toBe(false);
  });

  it("returns false when conditions is empty", () => {
    expect(hasCondition([], "Ready")).toBe(false);
  });

  it("returns true when the named condition is True", () => {
    expect(hasCondition([cond("Ready", "True")], "Ready")).toBe(true);
  });

  it("returns false when the named condition is False", () => {
    expect(hasCondition([cond("Ready", "False")], "Ready")).toBe(false);
  });

  it("returns false when the named condition is Unknown", () => {
    expect(hasCondition([cond("Ready", "Unknown")], "Ready")).toBe(false);
  });

  it("returns false when a different condition is True", () => {
    expect(hasCondition([cond("Accepted", "True")], "Ready")).toBe(false);
  });
});

describe("isGatewayHealthy", () => {
  it("is healthy when both Accepted and Programmed are True", () => {
    expect(
      isGatewayHealthy(
        gateway("gw", "ns", [
          cond("Accepted", "True"),
          cond("Programmed", "True"),
        ]),
      ),
    ).toBe(true);
  });

  it("is unhealthy when only Accepted is True", () => {
    expect(
      isGatewayHealthy(
        gateway("gw", "ns", [
          cond("Accepted", "True"),
          cond("Programmed", "False"),
        ]),
      ),
    ).toBe(false);
  });

  it("is unhealthy when only Programmed is True", () => {
    expect(
      isGatewayHealthy(gateway("gw", "ns", [cond("Programmed", "True")])),
    ).toBe(false);
  });

  it("is unhealthy when status is missing", () => {
    expect(isGatewayHealthy(gateway("gw", "ns"))).toBe(false);
  });
});

describe("isServerOnline", () => {
  it("is online when Ready is True", () => {
    expect(
      isServerOnline(
        server("srv", "ns", { conditions: [cond("Ready", "True")] }),
      ),
    ).toBe(true);
  });

  it("is offline when Ready is False", () => {
    expect(
      isServerOnline(
        server("srv", "ns", { conditions: [cond("Ready", "False")] }),
      ),
    ).toBe(false);
  });

  it("is offline when status is missing", () => {
    expect(isServerOnline(server("srv", "ns"))).toBe(false);
  });
});

describe("deriveMcpGateways", () => {
  it("returns [] when extensions is undefined", () => {
    expect(deriveMcpGateways(undefined, [gateway("gw", "ns")])).toEqual([]);
  });

  it("returns [] when gateways is undefined", () => {
    expect(
      deriveMcpGateways([extension("ext", "ns", "gw")], undefined),
    ).toEqual([]);
  });

  it("matches a gateway targeted by an extension in the same namespace", () => {
    const gw = gateway("gw", "ns");
    const result = deriveMcpGateways([extension("ext", "ns", "gw")], [gw]);
    expect(result).toEqual([gw]);
  });

  it("uses the extension's own namespace when targetRef has no namespace", () => {
    const gw = gateway("gw", "prod");
    // extension lives in 'prod', targetRef only has a name -> key is prod/gw
    const result = deriveMcpGateways([extension("ext", "prod", "gw")], [gw]);
    expect(result).toEqual([gw]);
  });

  it("honours an explicit targetRef namespace over the extension namespace", () => {
    const gw = gateway("gw", "gateways-ns");
    const result = deriveMcpGateways(
      [extension("ext", "ext-ns", "gw", "gateways-ns")],
      [gw],
    );
    expect(result).toEqual([gw]);
  });

  it("excludes gateways not targeted by any extension", () => {
    const targeted = gateway("targeted", "ns");
    const other = gateway("other", "ns");
    const result = deriveMcpGateways(
      [extension("ext", "ns", "targeted")],
      [targeted, other],
    );
    expect(result).toEqual([targeted]);
  });

  it("does not match on name alone across namespaces", () => {
    const gw = gateway("gw", "ns-a");
    const result = deriveMcpGateways([extension("ext", "ns-b", "gw")], [gw]);
    expect(result).toEqual([]);
  });
});

describe("countHealthyGateways", () => {
  it("counts only healthy gateways", () => {
    const gateways = [
      gateway("healthy", "ns", [
        cond("Accepted", "True"),
        cond("Programmed", "True"),
      ]),
      gateway("unhealthy", "ns", [cond("Accepted", "True")]),
      gateway("none", "ns"),
    ];
    expect(countHealthyGateways(gateways)).toBe(1);
  });

  it("returns 0 for an empty list", () => {
    expect(countHealthyGateways([])).toBe(0);
  });
});

describe("countOnlineServers", () => {
  it("counts only online servers", () => {
    const servers = [
      server("a", "ns", { conditions: [cond("Ready", "True")] }),
      server("b", "ns", { conditions: [cond("Ready", "False")] }),
      server("c", "ns"),
    ];
    expect(countOnlineServers(servers)).toBe(1);
  });

  it("returns 0 when servers is undefined", () => {
    expect(countOnlineServers(undefined)).toBe(0);
  });
});

describe("countServerTypes", () => {
  it("counts distinct categories across all servers", () => {
    const servers = [
      server("a", "ns", { category: ["data", "search"] }),
      server("b", "ns", { category: ["search"] }),
      server("c", "ns", { category: ["compute"] }),
    ];
    expect(countServerTypes(servers)).toBe(3);
  });

  it("ignores servers without a category", () => {
    const servers = [
      server("a", "ns", { category: ["data"] }),
      server("b", "ns"),
    ];
    expect(countServerTypes(servers)).toBe(1);
  });

  it("returns 0 when servers is undefined", () => {
    expect(countServerTypes(undefined)).toBe(0);
  });
});
