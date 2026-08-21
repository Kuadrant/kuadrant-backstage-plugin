import { MCPServerRegistration } from "../../types/mcp";
import { isServerOnline } from "../McpOverviewPage/utils";

export { isServerOnline };

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

/** builds the `Kind/name` label for a server registration's first owner reference */
export function formatOwner(srv: MCPServerRegistration): string {
  const ownerRef = srv.metadata?.ownerReferences?.[0];
  return ownerRef ? `${ownerRef.kind}/${ownerRef.name}` : "No owner reference";
}
