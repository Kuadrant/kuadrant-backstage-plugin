import { usePermission } from '@backstage/plugin-permission-react';
import { Permission, ResourcePermission } from '@backstage/plugin-permission-common';

/**
 * result of a permission check including error state
 */
export interface PermissionCheckResult {
  allowed: boolean;
  loading: boolean;
  error?: Error;
}

/**
 * custom hook for checking kuadrant permissions that handles both
 * BasicPermission and ResourcePermission types without type bypasses
 *
 * @param permission - the permission to check
 * @param resourceRef - optional resource reference for ResourcePermissions
 * @returns permission check result with error handling
 *
 * @example
 * // basic permission
 * const { allowed, loading, error } = useKuadrantPermission(
 *   kuadrantApiProductListPermission
 * );
 *
 * @example
 * // resource permission
 * const { allowed, loading, error } = useKuadrantPermission(
 *   kuadrantApiKeyCreatePermission,
 *   'apiproduct:namespace/name'
 * );
 */
export function useKuadrantPermission(
  permission: Permission,
  resourceRef?: string,
): PermissionCheckResult {
  // construct the permission request based on whether it's a ResourcePermission
  const permissionRequest = 'resourceType' in permission
    ? { permission: permission as ResourcePermission, resourceRef }
    : { permission };

  const result = usePermission(permissionRequest as any);

  return {
    allowed: result.allowed,
    loading: result.loading,
    error: result.error,
  };
}

/**
 * helper to determine if a user can delete a specific API key or request
 *
 * @param ownerId - the user id who owns the key/request
 * @param currentUserId - the current user's id
 * @param canDeleteOwn - whether user has permission to delete their own keys
 * @param canDeleteAll - whether user has permission to delete all keys
 * @returns true if user can delete this specific key/request
 */
export function canDeleteResource(
  ownerId: string,
  currentUserId: string,
  canDeleteOwn: boolean,
  canDeleteAll: boolean,
): boolean {
  if (canDeleteAll) return true;
  if (canDeleteOwn && ownerId === currentUserId) return true;
  return false;
}
