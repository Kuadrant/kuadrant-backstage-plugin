import { createPermission } from '@backstage/plugin-permission-common';

/**
 * permission definitions for the kuadrant plugin
 *
 * these permissions control access to kuadrant resources and operations.
 * they must match the permissions defined in the backend plugin.
 *
 * permission types:
 * - BasicPermission: standard permission that applies globally
 * - ResourcePermission: permission scoped to specific resource types (e.g., apiproduct)
 *
 * permission patterns:
 * - `.create` - create new resources
 * - `.read` - read resource details
 * - `.read.own` - read only resources owned by the user
 * - `.read.all` - read all resources regardless of ownership
 * - `.update` - modify existing resources
 * - `.delete` - delete resources
 * - `.delete.own` - delete only resources owned by the user
 * - `.delete.all` - delete any resource regardless of ownership
 * - `.list` - list/view collections of resources
 */

// planpolicy permissions
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

// apiproduct permissions

/**
 * permission to create new API products
 * granted to api owners and admins
 */
export const kuadrantApiProductCreatePermission = createPermission({
  name: 'kuadrant.apiproduct.create',
  attributes: { action: 'create' },
});

/**
 * permission to read API products owned by the current user
 * for api owners to view their own products
 */
export const kuadrantApiProductReadOwnPermission = createPermission({
  name: 'kuadrant.apiproduct.read.own',
  attributes: { action: 'read' },
});

/**
 * permission to read all API products regardless of ownership
 * for platform engineers/admins who need to view all products
 */
export const kuadrantApiProductReadAllPermission = createPermission({
  name: 'kuadrant.apiproduct.read.all',
  attributes: { action: 'read' },
});

/**
 * permission to update API products owned by the current user
 * for api owners to modify their own products
 */
export const kuadrantApiProductUpdateOwnPermission = createPermission({
  name: 'kuadrant.apiproduct.update.own',
  attributes: { action: 'update' },
});

/**
 * permission to update any API product regardless of ownership
 * for platform engineers/admins
 */
export const kuadrantApiProductUpdateAllPermission = createPermission({
  name: 'kuadrant.apiproduct.update.all',
  attributes: { action: 'update' },
});

/**
 * permission to delete API products owned by the current user
 * for api owners to remove their own products
 */
export const kuadrantApiProductDeleteOwnPermission = createPermission({
  name: 'kuadrant.apiproduct.delete.own',
  attributes: { action: 'delete' },
});

/**
 * permission to delete any API product regardless of ownership
 * for platform engineers/admins
 */
export const kuadrantApiProductDeleteAllPermission = createPermission({
  name: 'kuadrant.apiproduct.delete.all',
  attributes: { action: 'delete' },
});

/**
 * permission to list API products
 * backend filters results based on .own vs .all read permissions
 */
export const kuadrantApiProductListPermission = createPermission({
  name: 'kuadrant.apiproduct.list',
  attributes: { action: 'read' },
});

// apikey permissions

/**
 * permission to create API keys (request API access)
 *
 * this is a ResourcePermission scoped to 'apiproduct', allowing
 * fine-grained control over which API products users can request access to.
 *
 * use in frontend: useKuadrantPermission(kuadrantApiKeyCreatePermission)
 * use in backend with resource: { permission, resourceRef: 'apiproduct:namespace/name' }
 */
export const kuadrantApiKeyCreatePermission = createPermission({
  name: 'kuadrant.apikey.create',
  attributes: { action: 'create' },
  resourceType: 'apiproduct',
});

/**
 * permission to read API keys owned by the current user
 * allows users to view their own API keys and request history
 */
export const kuadrantApiKeyReadOwnPermission = createPermission({
  name: 'kuadrant.apikey.read.own',
  attributes: { action: 'read' },
});

/**
 * permission to read all API keys regardless of ownership
 * for platform engineers/admins who need to view the approval queue and audit keys
 */
export const kuadrantApiKeyReadAllPermission = createPermission({
  name: 'kuadrant.apikey.read.all',
  attributes: { action: 'read' },
});

/**
 * permission to update API keys owned by the current user
 * allows users to edit their own pending requests (change plan tier, use case)
 */
export const kuadrantApiKeyUpdateOwnPermission = createPermission({
  name: 'kuadrant.apikey.update.own',
  attributes: { action: 'update' },
});

/**
 * permission to update any API key regardless of ownership
 * typically granted to API owners and platform engineers for approving/rejecting requests
 */
export const kuadrantApiKeyUpdateAllPermission = createPermission({
  name: 'kuadrant.apikey.update.all',
  attributes: { action: 'update' },
});

/**
 * permission to delete API keys owned by the current user
 * allows users to cancel their own requests or revoke their own access
 */
export const kuadrantApiKeyDeleteOwnPermission = createPermission({
  name: 'kuadrant.apikey.delete.own',
  attributes: { action: 'delete' },
});

/**
 * permission to delete any API key regardless of ownership
 * for platform engineers/admins who need to revoke access
 */
export const kuadrantApiKeyDeleteAllPermission = createPermission({
  name: 'kuadrant.apikey.delete.all',
  attributes: { action: 'delete' },
});

/**
 * permission to approve/reject API key requests
 * grants access to the approval queue - for API owners and admins only
 * separate from update.own which consumers use to edit their pending requests
 */
export const kuadrantApiKeyApprovePermission = createPermission({
  name: 'kuadrant.apikey.approve',
  attributes: { action: 'update' },
});

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
