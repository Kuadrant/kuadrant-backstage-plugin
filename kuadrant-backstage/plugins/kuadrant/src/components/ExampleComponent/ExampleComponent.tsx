import { Typography, Grid, Box, Link, IconButton, Chip } from '@material-ui/core';
import {
  InfoCard,
  Header,
  Page,
  Content,
  ContentHeader,
  SupportButton,
  Progress,
  ResponseErrorPanel,
  Table,
  TableColumn,
} from '@backstage/core-components';
import useAsync from 'react-use/lib/useAsync';
import { useApi, configApiRef, identityApiRef } from '@backstage/core-plugin-api';
import { Routes, Route, Link as RouterLink } from 'react-router-dom';
import { ResourceDetailPage } from '../ResourceDetailPage';
import { useState } from 'react';
import VisibilityIcon from '@material-ui/icons/Visibility';
import VisibilityOffIcon from '@material-ui/icons/VisibilityOff';
import DeleteIcon from '@material-ui/icons/Delete';

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

type ApiKeySecret = {
  metadata: {
    name: string;
    namespace: string;
    creationTimestamp: string;
    annotations?: {
      'secret.kuadrant.io/plan-id'?: string;
      'secret.kuadrant.io/user-id'?: string;
    };
    labels?: {
      app?: string;
    };
  };
  data?: {
    api_key?: string;
  };
};

export const ResourceList = () => {
  const config = useApi(configApiRef);
  const identityApi = useApi(identityApiRef);
  const backendUrl = config.getString('backend.baseUrl');
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());
  const [refresh, setRefresh] = useState(0);
  const [currentUser, setCurrentUser] = useState<string>('guest');

  // get current user identity
  useAsync(async () => {
    const identity = await identityApi.getBackstageIdentity();
    setCurrentUser(identity.userEntityRef.split('/')[1] || 'guest');
  }, [identityApi]);

  const { value: authPolicies, loading: authLoading, error: authError } = useAsync(async (): Promise<KuadrantList> => {
    const response = await fetch(`${backendUrl}/api/kuadrant/authpolicies`);
    return await response.json();
  }, [backendUrl]);

  const { value: rateLimitPolicies, loading: rlLoading, error: rlError } = useAsync(async (): Promise<KuadrantList> => {
    const response = await fetch(`${backendUrl}/api/kuadrant/ratelimitpolicies`);
    return await response.json();
  }, [backendUrl]);

  const { value: planPolicies, loading: planLoading, error: planError } = useAsync(async (): Promise<KuadrantList> => {
    const response = await fetch(`${backendUrl}/api/kuadrant/planpolicies`);
    return await response.json();
  }, [backendUrl]);

  const { value: apiKeysData, loading: apiKeysLoading, error: apiKeysError } = useAsync(async () => {
    const response = await fetch(`${backendUrl}/api/kuadrant/apikeys?namespace=toystore`);
    const data = await response.json();
    return data.items || [];
  }, [backendUrl, refresh]);

  const loading = authLoading || rlLoading || planLoading || apiKeysLoading;
  const error = authError || rlError || planError || apiKeysError;

  const handleDeleteApiKey = async (namespace: string, name: string) => {
    try {
      const response = await fetch(
        `${backendUrl}/api/kuadrant/apikeys/${namespace}/${name}`,
        { method: 'DELETE' }
      );
      if (!response.ok) {
        throw new Error('failed to delete api key');
      }
      setRefresh(r => r + 1);
    } catch (err) {
      console.error('error deleting api key:', err);
    }
  };

  const toggleVisibility = (keyName: string) => {
    setVisibleKeys(prev => {
      const newSet = new Set(prev);
      if (newSet.has(keyName)) {
        newSet.delete(keyName);
      } else {
        newSet.add(keyName);
      }
      return newSet;
    });
  };

  const renderResources = (resources: KuadrantResource[] | undefined, kind: string) => {
    if (!resources || resources.length === 0) {
      return <Typography variant="body2" color="textSecondary">No resources found</Typography>;
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

  const apiKeyColumns: TableColumn<ApiKeySecret>[] = [
    {
      title: 'Name',
      field: 'metadata.name',
      width: '20%',
    },
    {
      title: 'Namespace',
      field: 'metadata.namespace',
      width: '15%',
    },
    {
      title: 'API',
      field: 'metadata.labels.app',
      render: (row: ApiKeySecret) => row.metadata.labels?.app || 'N/A',
      width: '15%',
    },
    {
      title: 'User',
      field: 'metadata.annotations',
      render: (row: ApiKeySecret) =>
        row.metadata.annotations?.['secret.kuadrant.io/user-id'] || 'N/A',
      width: '10%',
    },
    {
      title: 'Plan',
      field: 'metadata.annotations',
      render: (row: ApiKeySecret) =>
        row.metadata.annotations?.['secret.kuadrant.io/plan-id'] || 'N/A',
      width: '10%',
    },
    {
      title: 'API Key',
      field: 'data.api_key',
      render: (row: ApiKeySecret) => {
        const isVisible = visibleKeys.has(row.metadata.name);
        const apiKey = row.data?.api_key ? atob(row.data.api_key) : 'N/A';
        return (
          <Box display="flex" alignItems="center">
            <Typography
              variant="body2"
              style={{ fontFamily: 'monospace', marginRight: 8 }}
            >
              {isVisible ? apiKey : '••••••••••••••••'}
            </Typography>
            <IconButton
              size="small"
              onClick={() => toggleVisibility(row.metadata.name)}
            >
              {isVisible ? <VisibilityOffIcon /> : <VisibilityIcon />}
            </IconButton>
          </Box>
        );
      },
      width: '25%',
    },
    {
      title: 'Actions',
      field: 'actions',
      render: (row: ApiKeySecret) => (
        <IconButton
          size="small"
          onClick={() => handleDeleteApiKey(row.metadata.namespace, row.metadata.name)}
          color="secondary"
        >
          <DeleteIcon />
        </IconButton>
      ),
      width: '5%',
    },
  ];

  return (
    <Page themeId="tool">
      <Header title="Kuadrant" subtitle="API Management for Kubernetes">
        <SupportButton>Manage rate limiting, auth policies, and DNS for your APIs</SupportButton>
      </Header>
      <Content>
        <ContentHeader title="Kuadrant Resources">
          <Box display="flex" alignItems="center" style={{ gap: 8 }}>
            <Typography variant="body2">Viewing as:</Typography>
            <Chip label={currentUser} color="primary" size="small" />
            <Typography variant="caption" color="textSecondary" style={{ marginLeft: 8 }}>
              (Admin view - showing all resources)
            </Typography>
          </Box>
        </ContentHeader>
        {loading && <Progress />}
        {error && <ResponseErrorPanel error={error} />}
        {!loading && !error && (
          <Grid container spacing={3} direction="column">
            <Grid item>
              <InfoCard title="AuthPolicies">
                <Typography variant="body1" gutterBottom>
                  Authentication and authorisation policies for your APIs
                </Typography>
                <Box mt={2}>
                  {renderResources(authPolicies?.items, 'authpolicies')}
                </Box>
              </InfoCard>
            </Grid>
            <Grid item>
              <InfoCard title="RateLimitPolicies">
                <Typography variant="body1" gutterBottom>
                  Rate limiting policies to protect your APIs from abuse
                </Typography>
                <Box mt={2}>
                  {renderResources(rateLimitPolicies?.items, 'ratelimitpolicies')}
                </Box>
              </InfoCard>
            </Grid>
            <Grid item>
              <InfoCard title="PlanPolicies">
                <Typography variant="body1" gutterBottom>
                  Tiered access plans with rate limits for API consumers
                </Typography>
                <Box mt={2}>
                  {renderResources(planPolicies?.items, 'planpolicies')}
                </Box>
              </InfoCard>
            </Grid>
            <Grid item>
              <InfoCard title="API Keys">
                <Typography variant="body1" gutterBottom>
                  Manage API keys for Kuadrant protected APIs
                </Typography>
                <Box mt={2}>
                  <Table
                    options={{
                      paging: true,
                      search: true,
                      pageSize: 5,
                    }}
                    columns={apiKeyColumns}
                    data={apiKeysData || []}
                    emptyContent={
                      <Box p={2}>
                        <Typography align="center" color="textSecondary">
                          No API keys found
                        </Typography>
                      </Box>
                    }
                  />
                </Box>
              </InfoCard>
            </Grid>
          </Grid>
        )}
      </Content>
    </Page>
  );
};

export const ExampleComponent = () => {
  return (
    <Routes>
      <Route path="/" element={<ResourceList />} />
      <Route path="/:kind/:namespace/:name" element={<ResourceDetailPage />} />
    </Routes>
  );
};
