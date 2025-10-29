import { useState } from 'react';
import { useAsync } from 'react-use';
import {
  InfoCard,
  Progress,
  ResponseErrorPanel,
} from '@backstage/core-components';
import {
  Typography,
  Box,
  Chip,
} from '@material-ui/core';
import { useApi, configApiRef, identityApiRef, fetchApiRef } from '@backstage/core-plugin-api';
import { useEntity } from '@backstage/plugin-catalog-react';

interface ApiKey {
  metadata: {
    name: string;
    namespace: string;
    annotations?: {
      'secret.kuadrant.io/plan-id'?: string;
      'secret.kuadrant.io/user-id'?: string;
    };
  };
  data?: {
    api_key?: string;
  };
}

export interface ApiAccessCardProps {
  // deprecated: use entity annotations instead
  namespace?: string;
}

export const ApiAccessCard = ({ namespace: propNamespace }: ApiAccessCardProps) => {
  const { entity } = useEntity();
  const config = useApi(configApiRef);
  const identityApi = useApi(identityApiRef);
  const fetchApi = useApi(fetchApiRef);
  const backendUrl = config.getString('backend.baseUrl');
  const [userId, setUserId] = useState<string>('guest');

  // read from entity annotations, fallback to props for backwards compat
  const namespace = entity.metadata.annotations?.['kuadrant.io/namespace'] || propNamespace || 'default';

  // get current user identity
  useAsync(async () => {
    const identity = await identityApi.getBackstageIdentity();
    setUserId(identity.userEntityRef.split('/')[1] || 'guest');
  }, [identityApi]);

  const { value: apiKeys, loading: keysLoading, error: keysError } = useAsync(async () => {
    const response = await fetchApi.fetch(`${backendUrl}/api/kuadrant/apikeys?namespace=${namespace}&userId=${userId}`);
    if (!response.ok) {
      throw new Error('failed to fetch api keys');
    }
    const data = await response.json();
    return data.items || [];
  }, [namespace, userId, backendUrl, fetchApi]);

  if (keysLoading) {
    return <Progress />;
  }

  if (keysError) {
    return <ResponseErrorPanel error={keysError} />;
  }

  const keys = (apiKeys as ApiKey[]) || [];

  return (
    <>
      <InfoCard title="Kuadrant API Keys">
        <Box p={2}>
          {keys.length > 0 ? (
            <>
              <Typography variant="body1" gutterBottom>
                You have {keys.length} active API key{keys.length !== 1 ? 's' : ''} for this API
              </Typography>
              {keys.map((key: ApiKey) => {
                const planTier = key.metadata.annotations?.['secret.kuadrant.io/plan-id'] || 'Unknown';

                return (
                  <Box key={key.metadata.name} mb={1} p={1} border={1} borderColor="grey.300" borderRadius={4}>
                    <Box display="flex" justifyContent="space-between" alignItems="center">
                      <Typography variant="body2">
                        {key.metadata.name}
                      </Typography>
                      <Chip label={planTier} color="primary" size="small" />
                    </Box>
                  </Box>
                );
              })}
              <Box mt={2}>
                <Typography variant="caption" color="textSecondary">
                  Visit the API Keys tab to view keys, make new requests, or manage access
                </Typography>
              </Box>
            </>
          ) : (
            <>
              <Typography variant="body1" gutterBottom>
                You don't have any API keys for this API yet
              </Typography>
              <Typography variant="body2" color="textSecondary">
                Visit the API Keys tab to request access
              </Typography>
            </>
          )}
        </Box>
      </InfoCard>
    </>
  );
};
