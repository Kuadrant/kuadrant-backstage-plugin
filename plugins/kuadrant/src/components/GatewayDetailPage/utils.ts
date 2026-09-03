/**
 * Pure helpers for the read-only Gateway detail view.
 *
 * These operate on the raw Gateway (gateway.networking.k8s.io/v1) manifest
 * returned by the backend. Kept separate from the component so the owner
 * formatting can be unit tested in isolation.
 */

import { GatewayManifest } from '../../types/mcp';

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
