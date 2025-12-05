import { createPermission } from '@backstage/plugin-permission-common';

/**
 * Permission definitions for the Kuadrant plugin
 *
 * These permissions control access to PlanPolicy, APIProduct, APIKey,
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

export const kuadrantApiProductReadOwnPermission = createPermission({
  name: 'kuadrant.apiproduct.read.own',
  attributes: { action: 'read' },
});

export const kuadrantApiProductReadAllPermission = createPermission({
  name: 'kuadrant.apiproduct.read.all',
  attributes: { action: 'read' },
});

export const kuadrantApiProductUpdateOwnPermission = createPermission({
  name: 'kuadrant.apiproduct.update.own',
  attributes: { action: 'update' },
});

export const kuadrantApiProductUpdateAllPermission = createPermission({
  name: 'kuadrant.apiproduct.update.all',
  attributes: { action: 'update' },
});

export const kuadrantApiProductDeleteOwnPermission = createPermission({
  name: 'kuadrant.apiproduct.delete.own',
  attributes: { action: 'delete' },
});

export const kuadrantApiProductDeleteAllPermission = createPermission({
  name: 'kuadrant.apiproduct.delete.all',
  attributes: { action: 'delete' },
});

export const kuadrantApiProductListPermission = createPermission({
  name: 'kuadrant.apiproduct.list',
  attributes: { action: 'read' },
});

// apikey permissions (access requests to APIKey CRD)
export const kuadrantApiKeyCreatePermission = createPermission({
  name: 'kuadrant.apikey.create',
  attributes: { action: 'create' },
  resourceType: 'apiproduct',
});

export const kuadrantApiKeyReadOwnPermission = createPermission({
  name: 'kuadrant.apikey.read.own',
  attributes: { action: 'read' },
});

export const kuadrantApiKeyReadAllPermission = createPermission({
  name: 'kuadrant.apikey.read.all',
  attributes: { action: 'read' },
});

export const kuadrantApiKeyUpdateOwnPermission = createPermission({
  name: 'kuadrant.apikey.update.own',
  attributes: { action: 'update' },
});

export const kuadrantApiKeyUpdateAllPermission = createPermission({
  name: 'kuadrant.apikey.update.all',
  attributes: { action: 'update' },
});

export const kuadrantApiKeyDeleteOwnPermission = createPermission({
  name: 'kuadrant.apikey.delete.own',
  attributes: { action: 'delete' },
});

export const kuadrantApiKeyDeleteAllPermission = createPermission({
  name: 'kuadrant.apikey.delete.all',
  attributes: { action: 'delete' },
});

// approval permission - separate from update.own which consumers use to edit pending requests
export const kuadrantApiKeyApprovePermission = createPermission({
  name: 'kuadrant.apikey.approve',
  attributes: { action: 'update' },
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
  kuadrantApiProductReadOwnPermission,
  kuadrantApiProductReadAllPermission,
  kuadrantApiProductUpdateOwnPermission,
  kuadrantApiProductUpdateAllPermission,
  kuadrantApiProductDeleteOwnPermission,
  kuadrantApiProductDeleteAllPermission,
  kuadrantApiProductListPermission,
  kuadrantApiKeyCreatePermission,
  kuadrantApiKeyReadOwnPermission,
  kuadrantApiKeyReadAllPermission,
  kuadrantApiKeyUpdateOwnPermission,
  kuadrantApiKeyUpdateAllPermission,
  kuadrantApiKeyDeleteOwnPermission,
  kuadrantApiKeyDeleteAllPermission,
  kuadrantApiKeyApprovePermission,
];
