import {
  GatewayResource,
  HTTPRouteResource,
  McpCondition,
  MCPGatewayExtension,
  MCPServerRegistration,
} from "../../types/mcp";

/** returns true if the named condition has status 'True' */
export function hasCondition(
  conditions: McpCondition[] | undefined,
  type: string,
): boolean {
  return (conditions ?? []).some((c) => c.type === type && c.status === "True");
}

/**
 * a gateway is healthy when it has a 'True' status for both the
 * 'Accepted' and 'Programmed' conditions
 */
export function isGatewayHealthy(gw: GatewayResource): boolean {
  const conditions = gw.status?.conditions;
  return (
    hasCondition(conditions, "Accepted") &&
    hasCondition(conditions, "Programmed")
  );
}

/** an mcp server is online when it has a 'True' status for the 'Ready' condition */
export function isServerOnline(srv: MCPServerRegistration): boolean {
  return hasCondition(srv.status?.conditions, "Ready");
}

/** builds the `namespace/name` key an extension targets */
function extensionTargetKey(ext: MCPGatewayExtension): string {
  const ns = ext.spec?.targetRef?.namespace || ext.metadata?.namespace;
  return `${ns}/${ext.spec?.targetRef?.name}`;
}

/**
 * mcp gateways are the Gateways targeted by at least one MCPGatewayExtension
 * (matched on namespace/name of the extension's spec.targetRef)
 */
export function deriveMcpGateways(
  extensions: MCPGatewayExtension[] | undefined,
  gateways: GatewayResource[] | undefined,
): GatewayResource[] {
  if (!extensions || !gateways) return [];
  const targetRefs = new Set(extensions.map(extensionTargetKey));
  return gateways.filter((gw) =>
    targetRefs.has(`${gw.metadata?.namespace}/${gw.metadata?.name}`),
  );
}

/** number of healthy mcp gateways */
export function countHealthyGateways(gateways: GatewayResource[]): number {
  return gateways.filter(isGatewayHealthy).length;
}

/** number of online mcp servers */
export function countOnlineServers(
  servers: MCPServerRegistration[] | undefined,
): number {
  return (servers ?? []).filter(isServerOnline).length;
}

/**
 * condition types kuadrant sets on an HTTPRoute's parent status when a policy
 * targets the route. mirrors the console plugin's POLICIES_MAP for HTTPRoute.
 */
const HTTPROUTE_POLICY_CONDITIONS = [
  "kuadrant.io/AuthPolicyAffected",
  "kuadrant.io/RateLimitPolicyAffected",
  "kuadrant.io/TokenRateLimitPolicyAffected",
];

/** flattens the conditions across all of an HTTPRoute's parents */
function httpRouteParentConditions(route: HTTPRouteResource): McpCondition[] {
  return (route.status?.parents ?? []).flatMap((p) => p.conditions ?? []);
}

/**
 * derives the HTTPRoute status label the same way the kuadrant console plugin
 * does: an accepted route with all targeting policies enforced is "Enforced";
 * otherwise it reflects the accepted/conflicted/resolved-refs/unknown state.
 */
export function getHttpRouteStatus(route: HTTPRouteResource): string {
  const conditions = httpRouteParentConditions(route);
  const accepted = conditions.some(
    (c) => c.type === "Accepted" && c.status === "True",
  );
  if (accepted) {
    // only policies actually present on the route count towards "all enforced";
    // a route with no policy conditions is considered enforced (nothing pending)
    const relevant = HTTPROUTE_POLICY_CONDITIONS.filter((p) =>
      conditions.some((c) => c.type === p),
    );
    const allEnforced = relevant.every((p) =>
      conditions.some((c) => c.type === p && c.status === "True"),
    );
    const anyError = HTTPROUTE_POLICY_CONDITIONS.some((p) =>
      conditions.some((c) => c.type === p && c.status === "False"),
    );
    return allEnforced && !anyError ? "Enforced" : "Accepted (Not Enforced)";
  }
  if (conditions.some((c) => c.type === "Conflicted" && c.status === "True")) {
    return "Conflicted";
  }
  if (conditions.some((c) => c.type === "ResolvedRefs" && c.status === "True")) {
    return "Resolved Refs";
  }
  return "Unknown";
}

/** an HTTPRoute is considered healthy when its status is "Enforced" */
export function isHttpRouteEnforced(route: HTTPRouteResource): boolean {
  return getHttpRouteStatus(route) === "Enforced";
}

/**
 * HTTPRoutes relating to MCP gateways: routes whose spec.parentRefs attach to
 * one of the derived MCP gateways (matched on namespace/name; a parentRef with
 * no namespace defaults to the route's own namespace, and only Gateway kinds).
 */
export function deriveMcpHttpRoutes(
  routes: HTTPRouteResource[] | undefined,
  mcpGateways: GatewayResource[],
): HTTPRouteResource[] {
  if (!routes || mcpGateways.length === 0) return [];
  const gatewayKeys = new Set(
    mcpGateways.map((gw) => `${gw.metadata?.namespace}/${gw.metadata?.name}`),
  );
  return routes.filter((route) =>
    (route.spec?.parentRefs ?? []).some((ref) => {
      if (ref.kind && ref.kind !== "Gateway") return false;
      const ns = ref.namespace || route.metadata?.namespace;
      return gatewayKeys.has(`${ns}/${ref.name}`);
    }),
  );
}

/** number of distinct categories ("types") across all servers */
export function countServerTypes(
  servers: MCPServerRegistration[] | undefined,
): number {
  const categories = new Set<string>();
  (servers ?? []).forEach((srv) => {
    (srv.spec?.category ?? []).forEach((cat) => categories.add(cat));
  });
  return categories.size;
}
