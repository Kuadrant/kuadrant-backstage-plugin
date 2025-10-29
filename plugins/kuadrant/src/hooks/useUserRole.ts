import { useApi, identityApiRef } from '@backstage/core-plugin-api';
import useAsync from 'react-use/lib/useAsync';

export type UserRole = 'platform-engineer' | 'api-owner' | 'api-consumer' | 'unknown';

export interface UserInfo {
  userId: string;
  role: UserRole;
  isPlatformEngineer: boolean;
  isApiOwner: boolean;
  isApiConsumer: boolean;
}

export function useUserRole(): { userInfo: UserInfo | null; loading: boolean } {
  const identityApi = useApi(identityApiRef);

  const { value, loading } = useAsync(async () => {
    try {
      const identity = await identityApi.getBackstageIdentity();
      const userId = identity.userEntityRef.split('/')[1] || 'guest';
      const ownershipRefs = identity.ownershipEntityRefs || [];

      console.log('useUserRole debug:', { userId, ownershipRefs });

      // determine roles based on group membership (not hierarchical)
      const isPlatformEngineer = ownershipRefs.includes('group:default/platform-engineers') ||
                                 ownershipRefs.includes('group:default/platform-admins');

      const isApiOwner = ownershipRefs.includes('group:default/api-owners') ||
                         ownershipRefs.includes('group:default/app-developers');

      const isApiConsumer = ownershipRefs.includes('group:default/api-consumers');

      // primary role (for display)
      let role: UserRole = 'unknown';
      if (isPlatformEngineer) {
        role = 'platform-engineer';
      } else if (isApiOwner) {
        role = 'api-owner';
      } else if (isApiConsumer) {
        role = 'api-consumer';
      }

      console.log('useUserRole result:', { role, isPlatformEngineer, isApiOwner, isApiConsumer });

      // in dev mode without catalog backend, ownershipRefs will be empty
      // fall back to granting platform-engineer role
      if (role === 'unknown') {
        console.log('role is unknown, falling back to platform-engineer for dev mode');
        return {
          userId,
          role: 'platform-engineer',
          isPlatformEngineer: true,
          isApiOwner: true,
          isApiConsumer: true,
        };
      }

      return {
        userId,
        role,
        isPlatformEngineer,
        isApiOwner,
        isApiConsumer,
      };
    } catch (error) {
      console.log('useUserRole error, returning guest with full access:', error);
      // in dev mode without auth backend, return default guest with full access
      return {
        userId: 'guest',
        role: 'platform-engineer',
        isPlatformEngineer: true,
        isApiOwner: true,
        isApiConsumer: true,
      };
    }
  }, [identityApi]);

  return {
    userInfo: value || null,
    loading,
  };
}
