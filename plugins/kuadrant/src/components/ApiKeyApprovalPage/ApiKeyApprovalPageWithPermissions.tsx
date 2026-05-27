import React from 'react';
import { ApiKeyApprovalPage } from './ApiKeyApprovalPage';
import { PermissionGate } from '../PermissionGate';
import { kuadrantApiKeyApprovePermission } from '../../permissions';

export const ApiKeyApprovalPageWithPermissions = () => {
  return (
    <PermissionGate
      permission={kuadrantApiKeyApprovePermission}
      errorMessage="You don't have permission to approve API keys"
    >
      <ApiKeyApprovalPage />
    </PermissionGate>
  );
};
