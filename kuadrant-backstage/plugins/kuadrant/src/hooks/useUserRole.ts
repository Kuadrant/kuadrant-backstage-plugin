import { useApi, identityApiRef } from '@backstage/core-plugin-api';
import useAsync from 'react-use/lib/useAsync';

export type UserRole = 'platform-engineer' | 'app-developer' | 'api-consumer' | 'unknown';

export interface UserInfo {
  userId: string;
  role: UserRole;
  isPlatformEngineer: boolean;
  isAppDeveloper: boolean;
  isApiConsumer: boolean;
}

export function useUserRole(): { userInfo: UserInfo | null; loading: boolean } {
  const identityApi = useApi(identityApiRef);

  const { value, loading } = useAsync(async () => {
    const identity = await identityApi.getBackstageIdentity();
    const userId = identity.userEntityRef.split('/')[1] || 'guest';
    const ownershipRefs = identity.ownershipEntityRefs || [];

    let role: UserRole = 'unknown';

    if (ownershipRefs.includes('group:default/platform-engineers')) {
      role = 'platform-engineer';
    } else if (ownershipRefs.includes('group:default/app-developers')) {
      role = 'app-developer';
    } else if (ownershipRefs.includes('group:default/api-consumers')) {
      role = 'api-consumer';
    }

    return {
      userId,
      role,
      isPlatformEngineer: role === 'platform-engineer',
      isAppDeveloper: role === 'app-developer' || role === 'platform-engineer',
      isApiConsumer: role === 'api-consumer' || role === 'app-developer' || role === 'platform-engineer',
    };
  }, [identityApi]);

  return {
    userInfo: value || null,
    loading,
  };
}
