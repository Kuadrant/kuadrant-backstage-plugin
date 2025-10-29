import { createPermissionIntegrationRouter as backstageCreatePermissionIntegrationRouter } from '@backstage/plugin-permission-node';
import { kuadrantPermissions } from './permissions';

/**
 * creates a permission integration router that exposes kuadrant permissions
 * for discovery by rbac and other permission-aware plugins
 */
export function createKuadrantPermissionIntegrationRouter() {
  return backstageCreatePermissionIntegrationRouter({
    permissions: kuadrantPermissions,
  });
}
