import React from 'react';
import { Typography, Box } from '@material-ui/core';
import { Progress } from '@backstage/core-components';
import { useUserRole } from '../../hooks/useUserRole';

interface PermissionGateProps {
  children: React.ReactNode;
  requireRole?: 'platform-engineer' | 'api-owner' | 'api-consumer';
  requireAnyRole?: Array<'platform-engineer' | 'api-owner' | 'api-consumer'>;
  fallback?: React.ReactNode;
}

export const PermissionGate = ({ children, requireRole, requireAnyRole, fallback }: PermissionGateProps) => {
  const { userInfo, loading } = useUserRole();

  if (loading) {
    return <Progress />;
  }

  if (!userInfo) {
    return (
      <Box p={4}>
        <Typography color="error">unable to determine user permissions</Typography>
      </Box>
    );
  }

  const hasPermission = () => {
    if (requireRole) {
      return userInfo.role === requireRole;
    }
    if (requireAnyRole) {
      return requireAnyRole.includes(userInfo.role as any);
    }
    return true;
  };

  if (!hasPermission()) {
    if (fallback) {
      return <>{fallback}</>;
    }
    return (
      <Box p={4}>
        <Typography color="textSecondary">
          you don't have permission to view this page
        </Typography>
        <Box mt={1}>
          <Typography variant="caption" color="textSecondary">
            required role: {requireRole || requireAnyRole?.join(' or ')}
          </Typography>
        </Box>
        <Typography variant="caption" color="textSecondary">
          your role: {userInfo.role}
        </Typography>
      </Box>
    );
  }

  return <>{children}</>;
};
