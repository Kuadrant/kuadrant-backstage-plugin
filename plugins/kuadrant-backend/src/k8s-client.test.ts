import {
  deriveMCPEndpoint,
  getMCPGatewayDialTarget,
  isMCPGatewayReady,
  K8sResource,
  normalizeMCPOrigin,
  allowedMCPMethod,
} from "./k8s-client";

describe("MCP endpoint resolution", () => {
  const extension = (overrides: Record<string, unknown> = {}): K8sResource => ({
    apiVersion: "mcp.kuadrant.io/v1",
    kind: "MCPGatewayExtension",
    metadata: { name: "extension", namespace: "mcp-system", generation: 2 },
    spec: {
      publicHost: "mcp.example.test",
      targetRef: { kind: "Gateway", name: "gateway", sectionName: "mcp" },
      ...overrides,
    },
    status: {
      conditions: [{ type: "Ready", status: "True", observedGeneration: 2 }],
    },
  });

  it("requires a current Ready condition", () => {
    expect(isMCPGatewayReady(extension())).toBe(true);
    expect(
      isMCPGatewayReady({ ...extension(), status: { conditions: [] } }),
    ).toBe(false);
    expect(
      isMCPGatewayReady({
        ...extension(),
        status: {
          conditions: [
            { type: "Ready", status: "True", observedGeneration: 1 },
          ],
        },
      }),
    ).toBe(false);
  });

  it("derives the public MCP URL from the selected Gateway listener", () => {
    expect(
      deriveMCPEndpoint(extension(), {
        apiVersion: "gateway.networking.k8s.io/v1",
        kind: "Gateway",
        metadata: { name: "gateway", namespace: "mcp-system" },
        spec: { listeners: [{ name: "mcp", protocol: "HTTPS", port: 8443 }] },
      }),
    ).toBe("https://mcp.example.test:8443/mcp");
  });

  it("maps wildcard listeners to a usable MCP host", () => {
    expect(
      deriveMCPEndpoint(extension({ publicHost: undefined }), {
        apiVersion: "gateway.networking.k8s.io/v1",
        kind: "Gateway",
        metadata: { name: "gateway", namespace: "mcp-system" },
        spec: {
          listeners: [
            {
              name: "mcp",
              hostname: "*.example.test",
              protocol: "HTTP",
              port: 80,
            },
          ],
        },
      }),
    ).toBe("http://mcp.example.test/mcp");
  });

  it("rejects an invalid listener or host", () => {
    expect(() =>
      deriveMCPEndpoint(extension({ publicHost: "https://bad.example" }), {
        apiVersion: "gateway.networking.k8s.io/v1",
        kind: "Gateway",
        metadata: { name: "gateway", namespace: "mcp-system" },
        spec: { listeners: [{ name: "mcp", protocol: "TCP", port: 80 }] },
      }),
    ).toThrow();
  });

  it("uses the Gateway status address for the upstream connection", () => {
    expect(
      getMCPGatewayDialTarget(
        {
          status: {
            addresses: [
              { type: "IPAddress", value: "192.168.215.201" },
            ],
          },
        } as K8sResource,
        "mcp.127-0-0-1.sslip.io",
      ),
    ).toEqual({ hostname: "192.168.215.201" });
  });

  it("uses the extension private host and port for in-cluster dialing", () => {
    expect(
      getMCPGatewayDialTarget(
        {
          status: {
            addresses: [{ type: "IPAddress", value: "192.168.215.201" }],
          },
        } as K8sResource,
        "mcp.example.test",
        "mcp-gateway.mcp-system.svc.cluster.local:8080",
      ),
    ).toEqual({
      hostname: "mcp-gateway.mcp-system.svc.cluster.local",
      port: 8080,
    });
  });

  it("rejects malformed private hosts", () => {
    expect(() =>
      getMCPGatewayDialTarget(
        {} as K8sResource,
        "mcp.example.test",
        "https://mcp.example.test/path",
      ),
    ).toThrow("invalid private host");
  });

  it("normalizes exact MCP origins and rejects broader entries", () => {
    expect(normalizeMCPOrigin(" HTTPS://MCP.EXAMPLE.TEST/ ")).toBe(
      "https://mcp.example.test:443",
    );
    expect(normalizeMCPOrigin("http://mcp.example.test:8080")).toBe(
      "http://mcp.example.test:8080",
    );
    expect(() => normalizeMCPOrigin("https://*.example.test")).toThrow();
    expect(() => normalizeMCPOrigin("https://mcp.example.test/mcp")).toThrow();
    expect(() =>
      normalizeMCPOrigin("https://mcp.example.test?query=1"),
    ).toThrow();
  });

  it("allows only the MCP methods supported by the inspector", () => {
    expect(allowedMCPMethod("server/discover")).toBe(true);
    expect(allowedMCPMethod("tools/call")).toBe(true);
    expect(allowedMCPMethod("resources/list")).toBe(false);
  });
});
