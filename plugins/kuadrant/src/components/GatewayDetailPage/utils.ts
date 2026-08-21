/**
 * Pure helpers for the read-only Gateway detail view.
 *
 * These operate on the raw Gateway (gateway.networking.k8s.io/v1) manifest
 * returned by the backend. Kept separate from the component so they can be
 * unit tested in isolation. The manifest types live in ../../types/mcp and are
 * re-exported here so the component and tests can import them from './utils'.
 */

import {
  GatewayCondition,
  GatewayManifest,
  GatewayOwnerReference,
} from '../../types/mcp';

export type { GatewayCondition, GatewayManifest, GatewayOwnerReference };

/** returns true when the named condition is present with status 'True' */
export function hasCondition(
  conditions: GatewayCondition[] | undefined,
  type: string,
): boolean {
  return (conditions ?? []).some(c => c.type === type && c.status === 'True');
}

/**
 * a Gateway is ready when both its 'Accepted' and 'Programmed' conditions
 * report status 'True'. Mirrors the health rule used by the MCP Gateways table.
 */
export function isGatewayReady(gateway: GatewayManifest | undefined): boolean {
  const conditions = gateway?.status?.conditions;
  return hasCondition(conditions, 'Accepted') && hasCondition(conditions, 'Programmed');
}

/**
 * formats a creation timestamp into a compact human-readable age
 * (e.g. '5d', '3h', '10m', '45s'). Returns '-' when unset/invalid.
 */
export function formatAge(
  creationTimestamp: string | undefined,
  now: number = Date.now(),
): string {
  if (!creationTimestamp) {
    return '-';
  }
  const created = new Date(creationTimestamp).getTime();
  if (Number.isNaN(created)) {
    return '-';
  }
  const seconds = Math.max(0, Math.floor((now - created) / 1000));
  const days = Math.floor(seconds / 86400);
  if (days > 0) {
    return `${days}d`;
  }
  const hours = Math.floor(seconds / 3600);
  if (hours > 0) {
    return `${hours}h`;
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes > 0) {
    return `${minutes}m`;
  }
  return `${seconds}s`;
}

/**
 * renders the Gateway's owner from its first ownerReference as 'Kind/name'.
 * Returns '-' when there is no owner reference.
 */
export function getGatewayOwner(gateway: GatewayManifest | undefined): string {
  const owner = gateway?.metadata?.ownerReferences?.[0];
  if (!owner || !owner.name) {
    return '-';
  }
  return owner.kind ? `${owner.kind}/${owner.name}` : owner.name;
}
