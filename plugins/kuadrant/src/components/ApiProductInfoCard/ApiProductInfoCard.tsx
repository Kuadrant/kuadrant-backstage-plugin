import React from 'react';
import { useEntity } from '@backstage/plugin-catalog-react';
import { useApi, configApiRef, fetchApiRef, identityApiRef } from '@backstage/core-plugin-api';
import { InfoCard, Link, Progress, ResponseErrorPanel, CodeSnippet } from '@backstage/core-components';
import { Grid, Chip, Typography, Box, Table, TableBody, TableCell, TableHead, TableRow } from '@material-ui/core';
import useAsync from 'react-use/lib/useAsync';
import { useKuadrantPermission } from '../../utils/permissions';
import { kuadrantApiProductReadAllPermission } from '../../permissions';

export const ApiProductInfoCard = () => {
  const { entity } = useEntity();
  const config = useApi(configApiRef);
  const fetchApi = useApi(fetchApiRef);
  const identityApi = useApi(identityApiRef);
  const backendUrl = config.getString('backend.baseUrl');

  const { allowed: canReadAll, loading: permLoading } = useKuadrantPermission(
    kuadrantApiProductReadAllPermission
  );

  const namespace = entity.metadata.annotations?.['kuadrant.io/namespace'];
  const apiProductName = entity.metadata.annotations?.['kuadrant.io/apiproduct'];

  const { value: currentUserId } = useAsync(async () => {
    const identity = await identityApi.getBackstageIdentity();
    return identity.userEntityRef.split('/')[1] || 'guest';
  }, [identityApi]);

  const { value: apiProduct, loading, error } = useAsync(async () => {
    if (!namespace || !apiProductName) {
      return null;
    }

    const response = await fetchApi.fetch(
      `${backendUrl}/api/kuadrant/apiproducts/${namespace}/${apiProductName}`
    );

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `Failed to fetch API product: ${response.status}`);
    }

    return await response.json();
  }, [backendUrl, fetchApi, namespace, apiProductName]);

  // check if user has permission to view this api product
  const owner = apiProduct?.metadata?.annotations?.['backstage.io/owner'];
  const ownerUserId = owner?.split('/')[1]; // extract "owner1" from "user:default/owner1"
  const canView = canReadAll || (currentUserId && ownerUserId === currentUserId);

  if (!namespace || !apiProductName) {
    return (
      <InfoCard title="API Product Information">
        <Typography>No APIProduct linked to this API entity</Typography>
      </InfoCard>
    );
  }

  if (loading || permLoading) {
    return (
      <InfoCard title="API Product Information">
        <Progress />
      </InfoCard>
    );
  }

  // show permission message if user doesn't have permission
  if (apiProduct && !canView) {
    return (
      <InfoCard title="API Product Information">
        <Box p={2}>
          <Typography variant="body2" color="textSecondary">
            You don't have permission to view this API product's details. Only the API owner or users with admin permissions can view this information.
          </Typography>
        </Box>
      </InfoCard>
    );
  }

  // also show permission message if we got a permission error from the backend
  if (error && error.message.includes('you can only read your own')) {
    return (
      <InfoCard title="API Product Information">
        <Box p={2}>
          <Typography variant="body2" color="textSecondary">
            You don't have permission to view this API product's details. Only the API owner or users with admin permissions can view this information.
          </Typography>
        </Box>
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

  const { spec, status } = apiProduct;
  const authSchemes = status?.discoveredAuthScheme?.authentication || {};
  const schemeObjects = Object.values(authSchemes);
  const hasJwt = schemeObjects.some((scheme: any) =>
    scheme.hasOwnProperty("jwt"),
  );

  // Extract JWT issuer from the first JWT scheme
  const jwtScheme = schemeObjects.find((scheme: any) => scheme.hasOwnProperty("jwt"));
  const jwtIssuer = (jwtScheme as any)?.jwt?.issuerUrl || "unknown";
  const jwtTokenEndpoint = status?.oidcDiscovery?.tokenEndpoint || "unknown";

  const plans = status?.discoveredPlans || [];

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
            <Box display="flex" alignItems="center" flexWrap="wrap" style={{ gap: 8 }}>
              <Typography variant="body2">
                <strong>Version:</strong> {spec.version || 'v1'}
              </Typography>
              {spec.tags && spec.tags.length > 0 && (
                <Box display="flex" ml={2} style={{ gap: 4 }}>
                  {spec.tags.map((tag: string) => (
                    <Chip key={tag} label={tag} size="small" />
                  ))}
                </Box>
              )}
            </Box>
            <Box mt={2}>
              <Typography variant="body2" component="div">
                <strong>Approval Mode:</strong>{' '}
                <Chip
                  label={(spec.approvalMode || 'manual') === 'automatic' ? 'Automatic' : 'Manual'}
                  size="small"
                  color={(spec.approvalMode || 'manual') === 'automatic' ? 'primary' : 'default'}
                  style={{ marginLeft: 8 }}
                />
              </Typography>
              <Typography variant="caption" color="textSecondary" style={{ marginTop: 4, display: 'block' }}>
                {(spec.approvalMode || 'manual') === 'automatic'
                  ? 'API keys are created immediately when requested'
                  : 'API keys require manual approval before creation'}
              </Typography>
            </Box>
          </Box>
        </InfoCard>
      </Grid>

      {plans.length > 0 && (
        <Grid item xs={12}>
          <InfoCard title="Available Plans">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Tier</TableCell>
                  <TableCell>Rate Limits</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {plans.map((plan: any) => (
                  <TableRow key={plan.tier}>
                    <TableCell>
                      <Chip
                        label={plan.tier}
                        size="small"
                      />
                    </TableCell>
                    <TableCell>
                      {plan.limits && Object.entries(plan.limits).map(([key, value]) => (
                        <Typography key={key} variant="body2">
                          {String(value)} per {key}
                        </Typography>
                      ))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {spec.targetRef && (
              <Box mt={2}>
                <Typography variant="caption" color="textSecondary">
                  HTTPRoute: <strong>{spec.targetRef.name}</strong>
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
      {hasJwt && (
        <Grid item xs={12} md={6}>
          <InfoCard title="OIDC Provider Discovery">
            <Box p={2}>
              <Grid container spacing={2}>
                <Grid item xs={12}>
                  <Typography variant="body2">
                    This API uses OIDC authentication. Obtain a token from the identity provider below.
                  </Typography>
                </Grid>
                <Grid item xs={12}>
                  <Typography variant="body2">
                    <strong>Identity Provider: </strong>
                    <Link to={jwtIssuer} target="_blank">
                      {jwtIssuer}
                    </Link>
                  </Typography>
                </Grid>
                <Grid item xs={12}>
                  <Typography variant="body2">
                    <strong>Token Endpoint: </strong>
                    <Link to={jwtTokenEndpoint} target="_blank">
                      {jwtTokenEndpoint}
                    </Link>
                  </Typography>
                </Grid>
                <Grid item xs={12}>
                  <CodeSnippet
                    text={`# Example (Client Credentials):
curl -X POST \\
   -d "grant_type=client_credentials" \\
   -d "client_id=YOUR_CLIENT_ID" \\
   -d "client_secret=YOUR_CLIENT_SECRET" \\
   ${jwtTokenEndpoint}
`} // notsecret - template for user's own api key
                    language="bash"
                    showCopyCodeButton
                  />
                </Grid>
              </Grid>
            </Box>
          </InfoCard>
        </Grid>
      )}
    </Grid>
  );
};
