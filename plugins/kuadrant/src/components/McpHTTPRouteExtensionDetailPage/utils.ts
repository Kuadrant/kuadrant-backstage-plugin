import { HTTPRouteResource } from "../../types/mcp";
import { hasCondition } from "../McpOverviewPage/utils";

/**
 * An HTTPRoute is considered ready when all parent gateways have accepted it.
 * We check for "Accepted" condition with "True" status in the first parent's conditions.
 */
export function isHttpRouteReady(route: HTTPRouteResource): boolean {
  const firstParent = route.status?.parents?.[0];
  return hasCondition(firstParent?.conditions, "Accepted");
}

/**
 * Formats a k8s timestamp as a compact relative age (e.g. "3d", "2h", "5m").
 * Returns "-" when no timestamp is present.
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

/**
 * Builds the `Kind/name` label for a route's first owner reference.
 */
export function formatOwner(route: HTTPRouteResource): string {
  const ownerRef = route.metadata?.ownerReferences?.[0];
  return ownerRef ? `${ownerRef.kind}/${ownerRef.name}` : "No owner reference";
}

/**
 * Formats parent refs (gateways) as "name (namespace)" or just "name" if namespace matches route's namespace.
 */
export function formatParentRefs(route: HTTPRouteResource): string[] {
  const parentRefs = route.spec?.parentRefs || [];
  return parentRefs.map(ref => {
    const ns = ref.namespace || route.metadata?.namespace;
    return ns === route.metadata?.namespace ? ref.name : `${ref.name} (${ns})`;
  });
}
