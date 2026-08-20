import {
  GatewayResource,
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
