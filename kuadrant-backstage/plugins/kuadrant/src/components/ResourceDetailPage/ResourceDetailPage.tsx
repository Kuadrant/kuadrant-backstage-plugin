import { useParams, useNavigate } from 'react-router-dom';
import { Typography, Box, Paper, Button } from '@material-ui/core';
import {
  Header,
  Page,
  Content,
  Progress,
  ResponseErrorPanel,
  CodeSnippet,
} from '@backstage/core-components';
import useAsync from 'react-use/lib/useAsync';
import { useApi, configApiRef, fetchApiRef } from '@backstage/core-plugin-api';
import ArrowBackIcon from '@material-ui/icons/ArrowBack';

type KuadrantResource = {
  apiVersion: string;
  kind: string;
  metadata: {
    name: string;
    namespace: string;
    creationTimestamp: string;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
  };
  spec?: any;
  status?: any;
};

export const ResourceDetailPage = () => {
  const { kind, namespace, name } = useParams<{
    kind: string;
    namespace: string;
    name: string;
  }>();
  const navigate = useNavigate();
  const config = useApi(configApiRef);
  const fetchApi = useApi(fetchApiRef);
  const backendUrl = config.getString('backend.baseUrl');

  const { value: resource, loading, error } = useAsync(async (): Promise<KuadrantResource> => {
    const response = await fetchApi.fetch(`${backendUrl}/api/kuadrant/${kind}/${namespace}/${name}`);
    if (!response.ok) {
      throw new Error(`failed to fetch resource: ${response.status}`);
    }
    return await response.json();
  }, [backendUrl, kind, namespace, name, fetchApi]);

  if (loading) {
    return (
      <Page themeId="tool">
        <Header title="loading..." />
        <Content>
          <Progress />
        </Content>
      </Page>
    );
  }

  if (error) {
    return (
      <Page themeId="tool">
        <Header title="error" />
        <Content>
          <ResponseErrorPanel error={error} />
        </Content>
      </Page>
    );
  }

  if (!resource) {
    return (
      <Page themeId="tool">
        <Header title="not found" />
        <Content>
          <Typography>resource not found</Typography>
        </Content>
      </Page>
    );
  }

  return (
    <Page themeId="tool">
      <Header title={resource.metadata.name} subtitle={`${resource.kind} in ${resource.metadata.namespace}`}>
        <Button
          variant="outlined"
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate('/kuadrant')}
        >
          back to resources
        </Button>
      </Header>
      <Content>
        <Box mb={3}>
          <Paper style={{ padding: 16 }}>
            <Typography variant="h6" gutterBottom>
              metadata
            </Typography>
            <Box ml={2}>
              <Typography variant="body2">
                <strong>name:</strong> {resource.metadata.name}
              </Typography>
              <Typography variant="body2">
                <strong>namespace:</strong> {resource.metadata.namespace}
              </Typography>
              <Typography variant="body2">
                <strong>created:</strong> {new Date(resource.metadata.creationTimestamp).toLocaleString()}
              </Typography>
              {resource.metadata.labels && Object.keys(resource.metadata.labels).length > 0 && (
                <Box mt={1}>
                  <Typography variant="body2">
                    <strong>labels:</strong>
                  </Typography>
                  <Box ml={2}>
                    {Object.entries(resource.metadata.labels).map(([key, value]) => (
                      <Typography key={key} variant="body2">
                        {key}: {value}
                      </Typography>
                    ))}
                  </Box>
                </Box>
              )}
              {resource.metadata.annotations && Object.keys(resource.metadata.annotations).length > 0 && (
                <Box mt={1}>
                  <Typography variant="body2">
                    <strong>annotations:</strong>
                  </Typography>
                  <Box ml={2}>
                    {Object.entries(resource.metadata.annotations).map(([key, value]) => (
                      <Typography key={key} variant="body2" style={{ wordBreak: 'break-all' }}>
                        {key}: {value}
                      </Typography>
                    ))}
                  </Box>
                </Box>
              )}
            </Box>
          </Paper>
        </Box>

        {resource.spec && (
          <Box mb={3}>
            <Paper style={{ padding: 16 }}>
              <Typography variant="h6" gutterBottom>
                spec
              </Typography>
              <CodeSnippet
                text={JSON.stringify(resource.spec, null, 2)}
                language="json"
                showCopyCodeButton
              />
            </Paper>
          </Box>
        )}

        {resource.status && (
          <Box mb={3}>
            <Paper style={{ padding: 16 }}>
              <Typography variant="h6" gutterBottom>
                status
              </Typography>
              <CodeSnippet
                text={JSON.stringify(resource.status, null, 2)}
                language="json"
                showCopyCodeButton
              />
            </Paper>
          </Box>
        )}
      </Content>
    </Page>
  );
};
