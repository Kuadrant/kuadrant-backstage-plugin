import React, { useState } from 'react';
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

interface APIKey {
  metadata: {
    name: string;
    namespace: string;
  };
  spec: {
    apiProductRef: {
      name: string;
      namespace: string;
    };
    planTier: string;
  };
  status?: {
    phase: 'Pending' | 'Approved' | 'Rejected';
    apiKey?: string;
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
  const [, setUserId] = useState<string>('guest');

  // get apiproduct name from entity annotation (set by entity provider)
  const apiProductName = entity.metadata.annotations?.['kuadrant.io/apiproduct'] || entity.metadata.name;
  const namespace = entity.metadata.annotations?.['kuadrant.io/namespace'] || propNamespace || 'default';

  // get current user identity
  useAsync(async () => {
    const identity = await identityApi.getBackstageIdentity();
    setUserId(identity.userEntityRef.split('/')[1] || 'guest');
  }, [identityApi]);

  const { value: requests, loading: keysLoading, error: keysError } = useAsync(async () => {
    const url = namespace
      ? `${backendUrl}/api/kuadrant/requests/my?namespace=${namespace}`
      : `${backendUrl}/api/kuadrant/requests/my`;
    const response = await fetchApi.fetch(url);
    if (!response.ok) {
      throw new Error('failed to fetch api key requests');
    }
    const data = await response.json();
    // filter to only this apiproduct's approved requests
    const allRequests = data.items || [];
    return allRequests.filter((r: APIKey) =>
      r.spec.apiProductRef?.name === apiProductName && r.status?.phase === 'Approved'
    );
  }, [namespace, apiProductName, backendUrl, fetchApi]);

  if (keysLoading) {
    return <Progress />;
  }

  if (keysError) {
    return <ResponseErrorPanel error={keysError} />;
  }

  const keys = (requests as APIKey[]) || [];

  return (
    <>
      <InfoCard title="Kuadrant API Keys">
        <Box p={2}>
          {keys.length > 0 ? (
            <>
              <Typography variant="body1" gutterBottom>
                You have {keys.length} active API key{keys.length !== 1 ? 's' : ''} for this API
              </Typography>
              {keys.map((request: APIKey) => {
                const planTier = request.spec.planTier;

                return (
                  <Box key={request.metadata.name} mb={1} p={1} border={1} borderColor="grey.300" borderRadius={4}>
                    <Box display="flex" justifyContent="space-between" alignItems="center">
                      <Typography variant="body2">
                        {request.metadata.name}
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
