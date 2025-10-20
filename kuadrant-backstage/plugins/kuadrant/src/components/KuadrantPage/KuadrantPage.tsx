import { Typography, Grid, Box, Chip, Link } from '@material-ui/core';
import {
  InfoCard,
  Header,
  Page,
  Content,
  ContentHeader,
  SupportButton,
  Progress,
  ResponseErrorPanel,
} from '@backstage/core-components';
import useAsync from 'react-use/lib/useAsync';
import { useApi, configApiRef, fetchApiRef } from '@backstage/core-plugin-api';
import { Routes, Route, Link as RouterLink } from 'react-router-dom';
import { ResourceDetailPage } from '../ResourceDetailPage';
import { ApprovalQueueCard } from '../ApprovalQueueCard';
import { PermissionGate } from '../PermissionGate';
import { useUserRole } from '../../hooks/useUserRole';

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

  const { value: apiProducts, loading: apiProductsLoading, error: apiProductsError } = useAsync(async (): Promise<KuadrantList> => {
    const response = await fetchApi.fetch(`${backendUrl}/api/kuadrant/apiproducts`);
    return await response.json();
  }, [backendUrl, fetchApi]);

  // only fetch planpolicies for platform engineers
  const { value: planPolicies, loading: planLoading, error: planError } = useAsync(async (): Promise<KuadrantList | null> => {
    if (!userInfo?.isPlatformEngineer) {
      return null;
    }
    const response = await fetchApi.fetch(`${backendUrl}/api/kuadrant/planpolicies`);
    return await response.json();
  }, [backendUrl, userInfo, fetchApi]);

  const loading = userLoading || apiProductsLoading || planLoading;
  const error = apiProductsError || planError;

  const renderResources = (resources: KuadrantResource[] | undefined, kind: string) => {
    if (!resources || resources.length === 0) {
      return <Typography variant="body2" color="textSecondary">no resources found</Typography>;
    }
    return (
      <Box>
        {resources.map((resource) => (
          <Box key={`${resource.metadata.namespace}/${resource.metadata.name}`} mb={1}>
            <Link
              component={RouterLink}
              to={`/kuadrant/${kind}/${resource.metadata.namespace}/${resource.metadata.name}`}
              underline="hover"
            >
              <Typography variant="body2">
                <strong>{resource.metadata.name}</strong> ({resource.metadata.namespace})
              </Typography>
            </Link>
          </Box>
        ))}
      </Box>
    );
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'platform-engineer':
        return { label: 'Platform Engineer', color: 'secondary' as const };
      case 'app-developer':
        return { label: 'App Developer', color: 'primary' as const };
      case 'api-consumer':
        return { label: 'API Consumer', color: 'default' as const };
      default:
        return { label: role, color: 'default' as const };
    }
  };

  return (
    <Page themeId="tool">
      <Header title="Kuadrant" subtitle="api management for kubernetes">
        <SupportButton>manage api products and access requests</SupportButton>
      </Header>
      <Content>
        <ContentHeader title="api products">
          {userInfo && (
            <Box display="flex" alignItems="center" style={{ gap: 8 }}>
              <Typography variant="body2">viewing as:</Typography>
              <Chip label={userInfo.userId} color="primary" size="small" />
              <Chip
                label={getRoleLabel(userInfo.role).label}
                color={getRoleLabel(userInfo.role).color}
                size="small"
              />
            </Box>
          )}
        </ContentHeader>
        {loading && <Progress />}
        {error && <ResponseErrorPanel error={error} />}
        {!loading && !error && (
          <Grid container spacing={3} direction="column">
            <Grid item>
              <InfoCard title="API Products">
                <Typography variant="body1" gutterBottom>
                  published apis with plan tiers and rate limits
                </Typography>
                <Box mt={2}>
                  {renderResources(apiProducts?.items, 'apiproducts')}
                </Box>
              </InfoCard>
            </Grid>

            {userInfo?.isPlatformEngineer && (
              <>
                <Grid item>
                  <InfoCard title="Plan Policies">
                    <Typography variant="body1" gutterBottom>
                      platform-level plan definitions (platform engineers only)
                    </Typography>
                    <Box mt={2}>
                      {renderResources(planPolicies?.items, 'planpolicies')}
                    </Box>
                  </InfoCard>
                </Grid>
                <Grid item>
                  <ApprovalQueueCard />
                </Grid>
              </>
            )}
          </Grid>
        )}
      </Content>
    </Page>
  );
};

export const KuadrantPage = () => {
  return (
    <PermissionGate requireAnyRole={['platform-engineer', 'app-developer']}>
      <Routes>
        <Route path="/" element={<ResourceList />} />
        <Route path="/:kind/:namespace/:name" element={<ResourceDetailPage />} />
      </Routes>
    </PermissionGate>
  );
};
