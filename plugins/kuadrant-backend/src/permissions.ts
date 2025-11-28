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

// apikey request permissions (access requests)
export const kuadrantApiKeyRequestCreatePermission = createPermission({
  name: 'kuadrant.apikeyrequest.create',
  attributes: { action: 'create' },
  resourceType: 'apiproduct',
});

export const kuadrantApiKeyRequestReadOwnPermission = createPermission({
  name: 'kuadrant.apikeyrequest.read.own',
  attributes: { action: 'read' },
});

export const kuadrantApiKeyRequestReadAllPermission = createPermission({
  name: 'kuadrant.apikeyrequest.read.all',
  attributes: { action: 'read' },
});

export const kuadrantApiKeyRequestUpdateOwnPermission = createPermission({
  name: 'kuadrant.apikeyrequest.update.own',
  attributes: { action: 'update' },
});

export const kuadrantApiKeyRequestUpdateAllPermission = createPermission({
  name: 'kuadrant.apikeyrequest.update.all',
  attributes: { action: 'update' },
});

export const kuadrantApiKeyRequestDeleteOwnPermission = createPermission({
  name: 'kuadrant.apikeyrequest.delete.own',
  attributes: { action: 'delete' },
});

export const kuadrantApiKeyRequestDeleteAllPermission = createPermission({
  name: 'kuadrant.apikeyrequest.delete.all',
  attributes: { action: 'delete' },
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
  kuadrantApiProductReadOwnPermission,
  kuadrantApiProductReadAllPermission,
  kuadrantApiProductUpdateOwnPermission,
  kuadrantApiProductUpdateAllPermission,
  kuadrantApiProductDeleteOwnPermission,
  kuadrantApiProductDeleteAllPermission,
  kuadrantApiProductListPermission,
  kuadrantApiKeyRequestCreatePermission,
  kuadrantApiKeyRequestReadOwnPermission,
  kuadrantApiKeyRequestReadAllPermission,
  kuadrantApiKeyRequestUpdateOwnPermission,
  kuadrantApiKeyRequestUpdateAllPermission,
  kuadrantApiKeyRequestDeleteOwnPermission,
  kuadrantApiKeyRequestDeleteAllPermission,
  kuadrantApiKeyReadOwnPermission,
  kuadrantApiKeyReadAllPermission,
  kuadrantApiKeyDeleteOwnPermission,
  kuadrantApiKeyDeleteAllPermission,
];
