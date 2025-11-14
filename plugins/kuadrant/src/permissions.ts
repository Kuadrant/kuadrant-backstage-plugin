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

// apikeyrequest permissions

/**
 * permission to create API key requests
 *
 * this is a ResourcePermission scoped to 'apiproduct', allowing
 * fine-grained control over which API products users can request access to.
 *
 * use in frontend: useKuadrantPermission(kuadrantApiKeyRequestCreatePermission)
 * use in backend with resource: { permission, resourceRef: 'apiproduct:namespace/name' }
 */
export const kuadrantApiKeyRequestCreatePermission = createPermission({
  name: 'kuadrant.apikeyrequest.create',
  attributes: { action: 'create' },
  resourceType: 'apiproduct',
});

/**
 * permission to read API key requests created by the current user
 * use this for allowing users to see their own request history
 */
export const kuadrantApiKeyRequestReadOwnPermission = createPermission({
  name: 'kuadrant.apikeyrequest.read.own',
  attributes: { action: 'read' },
});

/**
 * permission to read all API key requests regardless of who created them
 * use this for platform engineers/admins who need to view the approval queue
 */
export const kuadrantApiKeyRequestReadAllPermission = createPermission({
  name: 'kuadrant.apikeyrequest.read.all',
  attributes: { action: 'read' },
});

/**
 * permission to update API key requests owned by the current user
 * allows users to edit their own pending requests (change plan tier, use case)
 */
export const kuadrantApiKeyRequestUpdateOwnPermission = createPermission({
  name: 'kuadrant.apikeyrequest.update.own',
  attributes: { action: 'update' },
});

/**
 * permission to update any API key request regardless of ownership
 * typically granted to API owners and platform engineers for approving/rejecting requests
 */
export const kuadrantApiKeyRequestUpdateAllPermission = createPermission({
  name: 'kuadrant.apikeyrequest.update.all',
  attributes: { action: 'update' },
});

export const kuadrantApiKeyRequestListPermission = createPermission({
  name: 'kuadrant.apikeyrequest.list',
  attributes: { action: 'read' },
});

// api key permissions

/**
 * permission to read API keys owned by the current user
 * allows users to view their own active API keys
 */
export const kuadrantApiKeyReadOwnPermission = createPermission({
  name: 'kuadrant.apikey.read.own',
  attributes: { action: 'read' },
});

/**
 * permission to read all API keys regardless of ownership
 * for platform engineers/admins who need to audit keys
 */
export const kuadrantApiKeyReadAllPermission = createPermission({
  name: 'kuadrant.apikey.read.all',
  attributes: { action: 'read' },
});

/**
 * permission to delete API keys owned by the current user
 * allows users to revoke their own access
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
  kuadrantApiKeyRequestUpdateOwnPermission,
  kuadrantApiKeyRequestUpdateAllPermission,
  kuadrantApiKeyRequestListPermission,
  kuadrantApiKeyReadOwnPermission,
  kuadrantApiKeyReadAllPermission,
  kuadrantApiKeyDeleteOwnPermission,
  kuadrantApiKeyDeleteAllPermission,
];
