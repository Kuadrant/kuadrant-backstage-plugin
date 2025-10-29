import { createPermission } from '@backstage/plugin-permission-common';

/**
 * Permission definitions for the Kuadrant plugin
 *
 * These permissions control access to API key management, policy administration,
 * and approval workflows within the Kuadrant Backstage plugin.
 */

// api key permissions
export const kuadrantApiKeyCreatePermission = createPermission({
  name: 'kuadrant.apikey.create',
  attributes: { action: 'create' },
});

export const kuadrantApiKeyReadOwnPermission = createPermission({
  name: 'kuadrant.apikey.read.own',
  attributes: { action: 'read' },
});

export const kuadrantApiKeyReadAllPermission = createPermission({
  name: 'kuadrant.apikey.read.all',
  attributes: { action: 'read' },
});

export const kuadrantApiKeyDeleteOwnPermission = createPermission({
  name: 'kuadrant.apikey.delete.own',
  attributes: { action: 'delete' },
});

export const kuadrantApiKeyDeleteAllPermission = createPermission({
  name: 'kuadrant.apikey.delete.all',
  attributes: { action: 'delete' },
});

// policy permissions
export const kuadrantPolicyReadPermission = createPermission({
  name: 'kuadrant.policy.read',
  attributes: { action: 'read' },
});

export const kuadrantPolicyWritePermission = createPermission({
  name: 'kuadrant.policy.write',
  attributes: { action: 'update' },
});

// approval workflow permissions
export const kuadrantRequestApprovePermission = createPermission({
  name: 'kuadrant.request.approve',
  attributes: { action: 'update' },
});

export const kuadrantRequestRejectPermission = createPermission({
  name: 'kuadrant.request.reject',
  attributes: { action: 'update' },
});

/**
 * All Kuadrant permissions as an array for easy iteration
 */
export const kuadrantPermissions = [
  kuadrantApiKeyCreatePermission,
  kuadrantApiKeyReadOwnPermission,
  kuadrantApiKeyReadAllPermission,
  kuadrantApiKeyDeleteOwnPermission,
  kuadrantApiKeyDeleteAllPermission,
  kuadrantPolicyReadPermission,
  kuadrantPolicyWritePermission,
  kuadrantRequestApprovePermission,
  kuadrantRequestRejectPermission,
];
