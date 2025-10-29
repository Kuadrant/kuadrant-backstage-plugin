import { PermissionMetadata } from '@backstage/plugin-permission-common';
import {
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
} from './permissions';

/**
 * permission metadata for kuadrant plugin
 * makes permissions discoverable in rbac ui for role creation
 */
export const kuadrantPermissionMetadata: Record<string, PermissionMetadata> = {
  [kuadrantPlanPolicyCreatePermission.name]: {
    title: 'Create PlanPolicy',
    description: 'create planpolicy resources (rate limit tiers)',
    attributes: kuadrantPlanPolicyCreatePermission.attributes,
  },
  [kuadrantPlanPolicyReadPermission.name]: {
    title: 'Read PlanPolicy',
    description: 'read planpolicy resources',
    attributes: kuadrantPlanPolicyReadPermission.attributes,
  },
  [kuadrantPlanPolicyUpdatePermission.name]: {
    title: 'Update PlanPolicy',
    description: 'update planpolicy resources',
    attributes: kuadrantPlanPolicyUpdatePermission.attributes,
  },
  [kuadrantPlanPolicyDeletePermission.name]: {
    title: 'Delete PlanPolicy',
    description: 'delete planpolicy resources',
    attributes: kuadrantPlanPolicyDeletePermission.attributes,
  },
  [kuadrantPlanPolicyListPermission.name]: {
    title: 'List PlanPolicy',
    description: 'list planpolicy resources',
    attributes: kuadrantPlanPolicyListPermission.attributes,
  },
  [kuadrantApiProductCreatePermission.name]: {
    title: 'Create APIProduct',
    description: 'create apiproduct resources (publish apis)',
    attributes: kuadrantApiProductCreatePermission.attributes,
  },
  [kuadrantApiProductReadPermission.name]: {
    title: 'Read APIProduct',
    description: 'read apiproduct resources',
    attributes: kuadrantApiProductReadPermission.attributes,
  },
  [kuadrantApiProductUpdatePermission.name]: {
    title: 'Update APIProduct',
    description: 'update apiproduct resources',
    attributes: kuadrantApiProductUpdatePermission.attributes,
  },
  [kuadrantApiProductDeletePermission.name]: {
    title: 'Delete APIProduct',
    description: 'delete apiproduct resources',
    attributes: kuadrantApiProductDeletePermission.attributes,
  },
  [kuadrantApiProductListPermission.name]: {
    title: 'List APIProduct',
    description: 'list apiproduct resources',
    attributes: kuadrantApiProductListPermission.attributes,
  },
  [kuadrantApiKeyRequestCreatePermission.name]: {
    title: 'Create APIKeyRequest',
    description: 'create apikeyrequest resources (request access)',
    attributes: kuadrantApiKeyRequestCreatePermission.attributes,
  },
  [kuadrantApiKeyRequestReadOwnPermission.name]: {
    title: 'Read Own APIKeyRequest',
    description: 'read own apikeyrequest resources',
    attributes: kuadrantApiKeyRequestReadOwnPermission.attributes,
  },
  [kuadrantApiKeyRequestReadAllPermission.name]: {
    title: 'Read All APIKeyRequests',
    description: 'read all apikeyrequest resources',
    attributes: kuadrantApiKeyRequestReadAllPermission.attributes,
  },
  [kuadrantApiKeyRequestUpdatePermission.name]: {
    title: 'Update APIKeyRequest',
    description: 'update apikeyrequest resources (approve/reject)',
    attributes: kuadrantApiKeyRequestUpdatePermission.attributes,
  },
  [kuadrantApiKeyRequestListPermission.name]: {
    title: 'List APIKeyRequest',
    description: 'list apikeyrequest resources',
    attributes: kuadrantApiKeyRequestListPermission.attributes,
  },
  [kuadrantApiKeyReadOwnPermission.name]: {
    title: 'Read Own API Keys',
    description: 'read own api key secrets',
    attributes: kuadrantApiKeyReadOwnPermission.attributes,
  },
  [kuadrantApiKeyReadAllPermission.name]: {
    title: 'Read All API Keys',
    description: 'read all api key secrets',
    attributes: kuadrantApiKeyReadAllPermission.attributes,
  },
  [kuadrantApiKeyDeleteOwnPermission.name]: {
    title: 'Delete Own API Keys',
    description: 'delete own api key secrets',
    attributes: kuadrantApiKeyDeleteOwnPermission.attributes,
  },
  [kuadrantApiKeyDeleteAllPermission.name]: {
    title: 'Delete All API Keys',
    description: 'delete any api key secret',
    attributes: kuadrantApiKeyDeleteAllPermission.attributes,
  },
};
