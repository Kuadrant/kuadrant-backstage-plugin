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

/**
 * Full Gateway (gateway.networking.k8s.io/v1) manifest returned by the
 * `/gateways/:namespace/:name` read endpoint. Unlike {@link GatewayResource}
 * (the projected list shape) this carries the metadata and spec the read-only
 * detail view renders.
 */
export interface GatewayCondition {
  type?: string;
  status?: string;
  reason?: string;
  message?: string;
  lastTransitionTime?: string;
}

export interface GatewayOwnerReference {
  kind?: string;
  name?: string;
}

export interface GatewayManifest {
  apiVersion?: string;
  kind?: string;
  metadata?: {
    name?: string;
    namespace?: string;
    creationTimestamp?: string;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
    ownerReferences?: GatewayOwnerReference[];
  };
  spec?: Record<string, unknown>;
  status?: {
    conditions?: GatewayCondition[];
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
