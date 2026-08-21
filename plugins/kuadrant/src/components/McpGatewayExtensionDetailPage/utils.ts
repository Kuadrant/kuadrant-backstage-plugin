import { MCPGatewayExtension } from "../../types/mcp";
import { hasCondition } from "../McpOverviewPage/utils";

/** an extension is ready when it has a 'True' status for the 'Ready' condition */
export function isExtensionReady(ext: MCPGatewayExtension): boolean {
  return hasCondition(ext.status?.conditions, "Ready");
}

/**
 * formats a k8s timestamp as a compact relative age (e.g. "3d", "2h", "5m").
 * returns "-" when no timestamp is present.
 */
export function formatAge(timestamp?: string): string {
  if (!timestamp) return "-";
  const diffMs = Date.now() - new Date(timestamp).getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays > 0) return `${diffDays}d`;
  if (diffHours > 0) return `${diffHours}h`;
  if (diffMins > 0) return `${diffMins}m`;
  return "just now";
}

/** builds the `Kind/name` label for an extension's first owner reference */
export function formatOwner(ext: MCPGatewayExtension): string {
  const ownerRef = ext.metadata?.ownerReferences?.[0];
  return ownerRef ? `${ownerRef.kind}/${ownerRef.name}` : "No owner reference";
}
