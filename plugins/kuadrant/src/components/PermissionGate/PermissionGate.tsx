import React from 'react';
import { Typography, Box } from '@material-ui/core';
import { Skeleton } from '@material-ui/lab';
import { Permission } from '@backstage/plugin-permission-common';
import { useKuadrantPermission } from '../../utils/permissions';

interface PermissionGateProps {
  children: React.ReactNode;
  permission: Permission;
  fallback?: React.ReactNode;
  errorMessage?: string;
}

export const PermissionGate = ({ children, permission, fallback, errorMessage }: PermissionGateProps) => {
  const { allowed, loading, error } = useKuadrantPermission(permission);

  if (loading) {
    return (
      <Box p={2}>
        {[...Array(5)].map((_, i) => (
          <Box key={i} p={2}>
            <Skeleton variant="text" width="100%" />
          </Box>
        ))}
      </Box>
    );
  }

  if (error) {
    return (
      <Box p={4}>
        <Typography color="error">
          Unable to check permissions: {error.message}
        </Typography>
        <Typography variant="body2" color="textSecondary">
          Please try again or contact your administrator
        </Typography>
      </Box>
    );
  }

  if (!allowed) {
    if (fallback) {
      return <>{fallback}</>;
    }
    return (
      <Box p={4}>
        <Typography color="textSecondary">
          {errorMessage || 'You don\'t have permission to view this page'}
        </Typography>
        <Box mt={1}>
          <Typography variant="caption" color="textSecondary">
            Required permission: {permission.name}
          </Typography>
        </Box>
      </Box>
    );
  }

  return <>{children}</>;
};
