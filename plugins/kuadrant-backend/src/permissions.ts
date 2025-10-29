import { createPermission } from '@backstage/plugin-permission-common';

/**
 * Permission definitions for the Kuadrant plugin
 *
 * These permissions control access to PlanPolicy, APIProduct, APIKeyRequest,
 * and API key management within the Kuadrant Backstage plugin.
 *
 * Permissions are composable - use them to build custom roles beyond the
 * three reference personas (Platform Engineer, API Owner, API Consumer).
 */

// planpolicy permissions (rate limit tiers)
export const kuadrantPlanPolicyCreatePermission = createPermission({
  name: 'kuadrant.planpolicy.create',
  attributes: { action: 'create' },
});

export const kuadrantPlanPolicyReadPermission = createPermission({
  name: 'kuadrant.planpolicy.read',
  attributes: { action: 'read' },
});

export const kuadrantPlanPolicyUpdatePermission = createPermission({
  name: 'kuadrant.planpolicy.update',
  attributes: { action: 'update' },
});

export const kuadrantPlanPolicyDeletePermission = createPermission({
  name: 'kuadrant.planpolicy.delete',
  attributes: { action: 'delete' },
});

export const kuadrantPlanPolicyListPermission = createPermission({
  name: 'kuadrant.planpolicy.list',
  attributes: { action: 'read' },
});

// apiproduct permissions (catalog entries)
export const kuadrantApiProductCreatePermission = createPermission({
  name: 'kuadrant.apiproduct.create',
  attributes: { action: 'create' },
});

export const kuadrantApiProductReadPermission = createPermission({
  name: 'kuadrant.apiproduct.read',
  attributes: { action: 'read' },
});

export const kuadrantApiProductUpdatePermission = createPermission({
  name: 'kuadrant.apiproduct.update',
  attributes: { action: 'update' },
});

export const kuadrantApiProductDeletePermission = createPermission({
  name: 'kuadrant.apiproduct.delete',
  attributes: { action: 'delete' },
});

export const kuadrantApiProductListPermission = createPermission({
  name: 'kuadrant.apiproduct.list',
  attributes: { action: 'read' },
});

// apikeyrequest permissions (access requests)
export const kuadrantApiKeyRequestCreatePermission = createPermission({
  name: 'kuadrant.apikeyrequest.create',
  attributes: { action: 'create' },
});

export const kuadrantApiKeyRequestReadOwnPermission = createPermission({
  name: 'kuadrant.apikeyrequest.read.own',
  attributes: { action: 'read' },
});

export const kuadrantApiKeyRequestReadAllPermission = createPermission({
  name: 'kuadrant.apikeyrequest.read.all',
  attributes: { action: 'read' },
});

export const kuadrantApiKeyRequestUpdatePermission = createPermission({
  name: 'kuadrant.apikeyrequest.update',
  attributes: { action: 'update' },
});

export const kuadrantApiKeyRequestListPermission = createPermission({
  name: 'kuadrant.apikeyrequest.list',
  attributes: { action: 'read' },
});

// api key permissions (managed secrets)
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

/**
 * All Kuadrant permissions as an array for easy iteration
 */
export const kuadrantPermissions = [
  kuadrantPlanPolicyCreatePermission,
  kuadrantPlanPolicyReadPermission,
  kuadrantPlanPolicyUpdatePermission,
  kuadrantPlanPolicyDeletePermission,
  kuadrantPlanPolicyListPermission,
  kuadrantApiProductCreatePermission,
  kuadrantApiProductReadPermission,
  kuadrantApiProductUpdatePermission,
  kuadrantApiProductDeletePermission,
  kuadrantApiProductListPermission,
  kuadrantApiKeyRequestCreatePermission,
  kuadrantApiKeyRequestReadOwnPermission,
  kuadrantApiKeyRequestReadAllPermission,
  kuadrantApiKeyRequestUpdatePermission,
  kuadrantApiKeyRequestListPermission,
  kuadrantApiKeyReadOwnPermission,
  kuadrantApiKeyReadAllPermission,
  kuadrantApiKeyDeleteOwnPermission,
  kuadrantApiKeyDeleteAllPermission,
];
