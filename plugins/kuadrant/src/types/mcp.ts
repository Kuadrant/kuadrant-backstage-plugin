/**
 * Types for MCP (Model Context Protocol) management resources.
 *
 * These mirror the projected shapes returned by the backend `/gateways`,
 * `/mcp/gatewayextensions` and `/mcp/serverregistrations` endpoints, which
 * expose only the minimal fields the overview page needs.
 */

export interface McpCondition {
  type: string;
  status: "True" | "False" | "Unknown";
  reason?: string;
  message?: string;
  lastTransitionTime?: string;
}

export interface McpObjectMeta {
  name: string;
  namespace?: string;
}

export interface McpTargetRef {
  group?: string;
  kind?: string;
  name: string;
  namespace?: string;
}

/** Gateway (gateway.networking.k8s.io/v1) */
export interface GatewayResource {
  metadata: McpObjectMeta;
  spec?: {
    gatewayClassName?: string;
  };
  status?: {
    conditions?: McpCondition[];
  };
}

/** MCPGatewayExtension (mcp.kuadrant.io/v1) */
export interface MCPGatewayExtension {
  metadata: McpObjectMeta;
  spec?: {
    targetRef?: McpTargetRef;
  };
  status?: {
    conditions?: McpCondition[];
  };
}

/** MCPServerRegistration (mcp.kuadrant.io/v1) */
export interface MCPServerRegistration {
  metadata: McpObjectMeta;
  spec?: {
    targetRef?: McpTargetRef;
    category?: string[];
  };
  status?: {
    conditions?: McpCondition[];
  };
}

/** a Gateway an HTTPRoute attaches to via spec.parentRefs */
export interface HTTPRouteParentRef {
  group?: string;
  kind?: string;
  name: string;
  namespace?: string;
}

/** HTTPRoute (gateway.networking.k8s.io/v1) */
export interface HTTPRouteResource {
  metadata: McpObjectMeta;
  spec?: {
    parentRefs?: HTTPRouteParentRef[];
    hostnames?: string[];
  };
  status?: {
    // per-parent status; kuadrant policy conditions surface here
    parents?: { conditions?: McpCondition[] }[];
  };
}
