import React, { useState } from 'react';
import { Typography, Grid, Box, Chip, Button } from '@material-ui/core';
import AddIcon from '@material-ui/icons/Add';
import {
  InfoCard,
  Header,
  Page,
  Content,
  ContentHeader,
  SupportButton,
  Progress,
  ResponseErrorPanel,
  Link,
} from '@backstage/core-components';
import useAsync from 'react-use/lib/useAsync';
import { useApi, configApiRef, fetchApiRef } from '@backstage/core-plugin-api';
import { ApprovalQueueCard } from '../ApprovalQueueCard';
import { PermissionGate } from '../PermissionGate';
import { useUserRole } from '../../hooks/useUserRole';
import { CreateAPIProductDialog } from '../CreateAPIProductDialog';

type KuadrantResource = {
  metadata: {
    name: string;
    namespace: string;
    creationTimestamp: string;
  };
  spec?: any;
};

type KuadrantList = {
  items: KuadrantResource[];
};

export const ResourceList = () => {
  const config = useApi(configApiRef);
  const fetchApi = useApi(fetchApiRef);
  const backendUrl = config.getString('backend.baseUrl');
  const { userInfo, loading: userLoading } = useUserRole();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const { value: apiProducts, loading: apiProductsLoading, error: apiProductsError } = useAsync(async (): Promise<KuadrantList> => {
    const response = await fetchApi.fetch(`${backendUrl}/api/kuadrant/apiproducts`);
    return await response.json();
  }, [backendUrl, fetchApi, refreshTrigger]);

  const loading = userLoading || apiProductsLoading;
  const error = apiProductsError;

  const handleCreateSuccess = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  const renderResources = (resources: KuadrantResource[] | undefined) => {
    if (!resources || resources.length === 0) {
      return <Typography variant="body2" color="textSecondary">No resources found</Typography>;
    }
    return (
      <Box>
        {resources.map((resource) => (
          <Box key={`${resource.metadata.namespace}/${resource.metadata.name}`} mb={1}>
            <Typography variant="body2">
              <Link to={`/catalog/default/api/${resource.metadata.name}/api-product`}>
                <strong>{resource.metadata.name}</strong>
              </Link>
              {' '}({resource.metadata.namespace})
            </Typography>
          </Box>
        ))}
      </Box>
    );
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'platform-engineer':
        return { label: 'Platform Engineer', color: 'secondary' as const };
      case 'api-owner':
        return { label: 'API Owner', color: 'primary' as const };
      case 'api-consumer':
        return { label: 'API Consumer', color: 'default' as const };
      default:
        return { label: role, color: 'default' as const };
    }
  };

  return (
    <Page themeId="tool">
      <Header title="Kuadrant" subtitle="API Management for Kubernetes">
        <SupportButton>Manage API products and access requests</SupportButton>
      </Header>
      <Content>
        <ContentHeader title="API Products">
          <Box display="flex" alignItems="center" gap={2}>
            {userInfo && (
              <Box display="flex" alignItems="center" style={{ gap: 8 }}>
                <Typography variant="body2">Viewing as:</Typography>
                <Chip label={userInfo.userId} color="primary" size="small" />
                <Chip
                  label={getRoleLabel(userInfo.role).label}
                  color={getRoleLabel(userInfo.role).color}
                  size="small"
                />
              </Box>
            )}
            <Button
              variant="contained"
              color="primary"
              startIcon={<AddIcon />}
              onClick={() => setCreateDialogOpen(true)}
            >
              Create API Product
            </Button>
          </Box>
        </ContentHeader>
        {loading && <Progress />}
        {error && <ResponseErrorPanel error={error} />}
        {!loading && !error && (
          <Grid container spacing={3} direction="column">
            <Grid item>
              <InfoCard title="API Products">
                <Typography variant="body1" gutterBottom>
                  Published APIs with plan tiers and rate limits
                </Typography>
                <Box mt={2}>
                  {renderResources(apiProducts?.items)}
                </Box>
              </InfoCard>
            </Grid>

            {userInfo?.isApiOwner && (
              <Grid item>
                <ApprovalQueueCard />
              </Grid>
            )}
          </Grid>
        )}
        <CreateAPIProductDialog
          open={createDialogOpen}
          onClose={() => setCreateDialogOpen(false)}
          onSuccess={handleCreateSuccess}
        />
      </Content>
    </Page>
  );
};

export const KuadrantPage = () => {
  return (
    <PermissionGate requireAnyRole={['platform-engineer', 'api-owner']}>
      <ResourceList />
    </PermissionGate>
  );
};
