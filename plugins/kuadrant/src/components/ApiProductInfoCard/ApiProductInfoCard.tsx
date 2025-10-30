import React from 'react';
import { useEntity } from '@backstage/plugin-catalog-react';
import { useApi, configApiRef, fetchApiRef } from '@backstage/core-plugin-api';
import { InfoCard, Link, Progress, ResponseErrorPanel } from '@backstage/core-components';
import { Grid, Chip, Typography, Box, Table, TableBody, TableCell, TableHead, TableRow } from '@material-ui/core';
import useAsync from 'react-use/lib/useAsync';

export const ApiProductInfoCard = () => {
  const { entity } = useEntity();
  const config = useApi(configApiRef);
  const fetchApi = useApi(fetchApiRef);
  const backendUrl = config.getString('backend.baseUrl');

  const namespace = entity.metadata.annotations?.['kuadrant.io/namespace'];
  const apiProductName = entity.metadata.annotations?.['kuadrant.io/apiproduct'];

  const { value: apiProduct, loading, error } = useAsync(async () => {
    if (!namespace || !apiProductName) {
      return null;
    }

    const response = await fetchApi.fetch(
      `${backendUrl}/api/kuadrant/apiproducts/${namespace}/${apiProductName}`
    );
    return await response.json();
  }, [backendUrl, fetchApi, namespace, apiProductName]);

  if (!namespace || !apiProductName) {
    return (
      <InfoCard title="API Product Information">
        <Typography>No APIProduct linked to this API entity</Typography>
      </InfoCard>
    );
  }

  if (loading) {
    return (
      <InfoCard title="API Product Information">
        <Progress />
      </InfoCard>
    );
  }

  if (error) {
    return (
      <InfoCard title="API Product Information">
        <ResponseErrorPanel error={error} />
      </InfoCard>
    );
  }

  if (!apiProduct) {
    return (
      <InfoCard title="API Product Information">
        <Typography>APIProduct not found</Typography>
      </InfoCard>
    );
  }

  const { spec } = apiProduct;

  return (
    <Grid container spacing={3}>
      <Grid item xs={12}>
        <InfoCard title="API Product Details">
          <Box p={2}>
            <Typography variant="h6" gutterBottom>
              {spec.displayName || apiProductName}
            </Typography>
            <Typography variant="body2" color="textSecondary" paragraph>
              {spec.description}
            </Typography>
            <Box display="flex" gap={1} alignItems="center" flexWrap="wrap">
              <Typography variant="body2">
                <strong>Version:</strong> {spec.version || 'v1'}
              </Typography>
              {spec.tags && spec.tags.length > 0 && (
                <Box display="flex" gap={0.5} ml={2}>
                  {spec.tags.map((tag: string) => (
                    <Chip key={tag} label={tag} size="small" />
                  ))}
                </Box>
              )}
            </Box>
          </Box>
        </InfoCard>
      </Grid>

      {spec.plans && spec.plans.length > 0 && (
        <Grid item xs={12}>
          <InfoCard title="Available Plans">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Tier</TableCell>
                  <TableCell>Description</TableCell>
                  <TableCell>Rate Limits</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {spec.plans.map((plan: any) => (
                  <TableRow key={plan.tier}>
                    <TableCell>
                      <Chip
                        label={plan.tier}
                        size="small"
                      />
                    </TableCell>
                    <TableCell>{plan.description || '-'}</TableCell>
                    <TableCell>
                      {plan.limits && Object.entries(plan.limits).map(([key, value]) => (
                        <Typography key={key} variant="body2">
                          {value} per {key}
                        </Typography>
                      ))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {spec.planPolicyRef && (
              <Box mt={2}>
                <Typography variant="caption" color="textSecondary">
                  Managed by PlanPolicy: <strong>{spec.planPolicyRef.name}</strong> ({spec.planPolicyRef.namespace})
                </Typography>
              </Box>
            )}
          </InfoCard>
        </Grid>
      )}

      <Grid item xs={12} md={6}>
        <InfoCard title="Contact Information">
          {spec.contact ? (
            <Box p={2}>
              <Grid container spacing={2}>
                {spec.contact.team && (
                  <Grid item xs={12}>
                    <Typography variant="body2">
                      <strong>Team:</strong> {spec.contact.team}
                    </Typography>
                  </Grid>
                )}
                {spec.contact.email && (
                  <Grid item xs={12}>
                    <Typography variant="body2">
                      <strong>Email:</strong> <Link to={`mailto:${spec.contact.email}`}>{spec.contact.email}</Link>
                    </Typography>
                  </Grid>
                )}
                {spec.contact.slack && (
                  <Grid item xs={12}>
                    <Typography variant="body2">
                      <strong>Slack:</strong> {spec.contact.slack}
                    </Typography>
                  </Grid>
                )}
              </Grid>
            </Box>
          ) : (
            <Box p={2}>
              <Typography variant="body2" color="textSecondary">
                No contact information available
              </Typography>
            </Box>
          )}
        </InfoCard>
      </Grid>

      <Grid item xs={12} md={6}>
        <InfoCard title="Documentation">
          {spec.documentation ? (
            <Box p={2}>
              <Grid container spacing={2}>
                {spec.documentation.docsURL && (
                  <Grid item xs={12}>
                    <Typography variant="body2">
                      <strong>Documentation:</strong>{' '}
                      <Link to={spec.documentation.docsURL} target="_blank">
                        View Docs
                      </Link>
                    </Typography>
                  </Grid>
                )}
                {spec.documentation.openAPISpec && (
                  <Grid item xs={12}>
                    <Typography variant="body2">
                      <strong>OpenAPI Spec:</strong>{' '}
                      <Link to={spec.documentation.openAPISpec} target="_blank">
                        View Spec
                      </Link>
                    </Typography>
                  </Grid>
                )}
              </Grid>
            </Box>
          ) : (
            <Box p={2}>
              <Typography variant="body2" color="textSecondary">
                No documentation links available
              </Typography>
            </Box>
          )}
        </InfoCard>
      </Grid>
    </Grid>
  );
};
