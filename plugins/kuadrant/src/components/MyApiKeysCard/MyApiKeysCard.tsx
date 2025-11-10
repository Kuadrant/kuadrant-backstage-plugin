import React, { useState } from 'react';
import { InfoCard, Table, TableColumn, Link } from '@backstage/core-components';
import { useApi, configApiRef, fetchApiRef, identityApiRef } from '@backstage/core-plugin-api';
import useAsync from 'react-use/lib/useAsync';
import { Box, Chip, Typography, Tabs, Tab } from '@material-ui/core';

interface APIKeyRequest {
  metadata: {
    name: string;
    namespace: string;
    creationTimestamp: string;
  };
  spec: {
    apiName: string;
    apiNamespace: string;
    planTier: string;
    useCase?: string;
    requestedBy: {
      userId: string;
      email?: string;
    };
  };
  status?: {
    phase: 'Pending' | 'Approved' | 'Rejected';
    apiKey?: string;
    apiHostname?: string;
    reason?: string;
  };
}

export const MyApiKeysCard = () => {
  const config = useApi(configApiRef);
  const fetchApi = useApi(fetchApiRef);
  const identityApi = useApi(identityApiRef);
  const backendUrl = config.getString('backend.baseUrl');
  const [selectedTab, setSelectedTab] = useState(0);
  const [userId, setUserId] = useState<string>('');

  useAsync(async () => {
    const identity = await identityApi.getBackstageIdentity();
    setUserId(identity.userEntityRef.split('/')[1] || 'guest');
  }, [identityApi]);

  const { value: requests, loading, error } = useAsync(async () => {
    if (!userId) return [];
    const response = await fetchApi.fetch(
      `${backendUrl}/api/kuadrant/requests/my?userId=${userId}`
    );
    if (!response.ok) {
      throw new Error('failed to fetch requests');
    }
    const data = await response.json();
    return data.items || [];
  }, [userId, backendUrl, fetchApi]);

  if (loading) {
    return (
      <InfoCard title="My API Keys">
        <Typography>Loading...</Typography>
      </InfoCard>
    );
  }

  if (error) {
    return (
      <InfoCard title="My API Keys">
        <Typography color="error">Error loading API keys: {error.message}</Typography>
      </InfoCard>
    );
  }

  const allRequests = requests || [];
  const approvedRequests = allRequests.filter(r => r.status?.phase === 'Approved');
  const pendingRequests = allRequests.filter(r => r.status?.phase === 'Pending');
  const rejectedRequests = allRequests.filter(r => r.status?.phase === 'Rejected');

  const columns: TableColumn<APIKeyRequest>[] = [
    {
      title: 'API Product',
      field: 'spec.apiName',
      render: (row: APIKeyRequest) => (
        <Link to={`/catalog/default/api/${row.spec.apiName}`}>
          <strong>{row.spec.apiName}</strong>
        </Link>
      ),
    },
    {
      title: 'Plan',
      field: 'spec.planTier',
      render: (row: APIKeyRequest) => {
        const color = row.spec.planTier === 'gold' ? 'primary' :
                     row.spec.planTier === 'silver' ? 'default' : 'secondary';
        return <Chip label={row.spec.planTier} color={color} size="small" />;
      },
    },
    {
      title: 'Status',
      field: 'status.phase',
      render: (row: APIKeyRequest) => {
        const phase = row.status?.phase || 'Pending';
        const color = phase === 'Approved' ? 'primary' :
                     phase === 'Rejected' ? 'secondary' : 'default';
        return <Chip label={phase} color={color} size="small" />;
      },
    },
    {
      title: 'API Key',
      render: (row: APIKeyRequest) => {
        if (row.status?.phase === 'Approved' && row.status.apiKey) {
          return (
            <Box fontFamily="monospace" fontSize="0.875rem">
              {row.status.apiKey.substring(0, 20)}...
            </Box>
          );
        }
        return <Typography variant="body2" color="textSecondary">-</Typography>;
      },
    },
    {
      title: 'Requested',
      field: 'metadata.creationTimestamp',
      render: (row: APIKeyRequest) => {
        const date = new Date(row.metadata.creationTimestamp);
        return date.toLocaleDateString();
      },
    },
  ];

  const getTabData = () => {
    switch (selectedTab) {
      case 0:
        return approvedRequests;
      case 1:
        return pendingRequests;
      case 2:
        return rejectedRequests;
      default:
        return allRequests;
    }
  };

  const tabData = getTabData();

  return (
    <InfoCard
      title="My API Keys"
      subheader={`${approvedRequests.length} active, ${pendingRequests.length} pending`}
    >
      <Box mb={2}>
        <Tabs
          value={selectedTab}
          onChange={(_, newValue) => setSelectedTab(newValue)}
          indicatorColor="primary"
          textColor="primary"
        >
          <Tab label={`Active (${approvedRequests.length})`} />
          <Tab label={`Pending (${pendingRequests.length})`} />
          <Tab label={`Rejected (${rejectedRequests.length})`} />
        </Tabs>
      </Box>
      {tabData.length === 0 ? (
        <Box p={3} textAlign="center">
          <Typography variant="body1" color="textSecondary">
            {selectedTab === 0 && 'No active API keys. Request access to an API to get started.'}
            {selectedTab === 1 && 'No pending requests.'}
            {selectedTab === 2 && 'No rejected requests.'}
          </Typography>
        </Box>
      ) : (
        <Table
          options={{
            paging: tabData.length > 10,
            pageSize: 10,
            search: false,
            toolbar: false,
          }}
          columns={columns}
          data={tabData}
        />
      )}
    </InfoCard>
  );
};
