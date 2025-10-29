/**
 * Frontend re-export of backend permissions
 *
 * This allows the frontend to reference the same permission definitions
 * without creating a circular dependency.
 */

export const KUADRANT_PERMISSIONS = {
  // api key permissions
  apiKeyCreate: 'kuadrant.apikey.create',
  apiKeyReadOwn: 'kuadrant.apikey.read.own',
  apiKeyReadAll: 'kuadrant.apikey.read.all',
  apiKeyDeleteOwn: 'kuadrant.apikey.delete.own',
  apiKeyDeleteAll: 'kuadrant.apikey.delete.all',

  // policy permissions
  policyRead: 'kuadrant.policy.read',
  policyWrite: 'kuadrant.policy.write',

  // approval workflow permissions
  requestApprove: 'kuadrant.request.approve',
  requestReject: 'kuadrant.request.reject',
} as const;

export type KuadrantPermission = typeof KUADRANT_PERMISSIONS[keyof typeof KUADRANT_PERMISSIONS];
