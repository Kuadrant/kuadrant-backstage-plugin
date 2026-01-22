import React from 'react';
import { useEntity } from '@backstage/plugin-catalog-react';
import { useApi, configApiRef, fetchApiRef, identityApiRef } from '@backstage/core-plugin-api';
import { InfoCard, Progress, ResponseErrorPanel } from '@backstage/core-components';
import { Typography, Box, makeStyles } from '@material-ui/core';
import useAsync from 'react-use/lib/useAsync';
import { useKuadrantPermission } from '../../utils/permissions';
import { kuadrantApiProductReadAllPermission } from '../../permissions';
import { ApiProductDetails } from '../ApiProductDetails';
import { OidcProviderCard } from '../OidcProviderCard';

const useStyles = makeStyles((theme) => ({
  label: {
    fontWeight: 600,
    color: theme.palette.text.secondary,
    marginBottom: theme.spacing(0.5),
    fontSize: '0.75rem',
    textTransform: 'uppercase',
  },
}));

export const ApiProductInfoCard = () => {
  const classes = useStyles();
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

    const productResponse = await fetchApi.fetch(
      `${backendUrl}/api/kuadrant/apiproducts/${namespace}/${apiProductName}`
    );

    if (!productResponse.ok) {
      const errorData = await productResponse.json();
      throw new Error(errorData.error || `Failed to fetch API product: ${productResponse.status}`);
    }

    return productResponse.json();
  }, [backendUrl, fetchApi, namespace, apiProductName]);

  // check if user has permission to view this api product
  const owner = apiProduct?.metadata?.annotations?.['backstage.io/owner'];
  const ownerUserId = owner?.split('/')[1];
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

  // check for OIDC auth scheme
  const authSchemes = apiProduct.status?.discoveredAuthScheme?.authentication || {};
  const schemeObjects = Object.values(authSchemes);
  const jwtScheme = schemeObjects.find((scheme: any) => scheme.hasOwnProperty('jwt'));
  const hasOidc = Boolean(jwtScheme);
  const jwtIssuer = (jwtScheme as any)?.jwt?.issuerUrl;
  const jwtTokenEndpoint = apiProduct.status?.oidcDiscovery?.tokenEndpoint;

  return (
    <>
      <InfoCard title="API Product Details">
        <Box mb={2}>
          <Typography variant="caption" className={classes.label}>
            Product Name
          </Typography>
          <Typography variant="h6">
            {apiProduct.spec?.displayName || apiProductName}
          </Typography>
        </Box>
        <ApiProductDetails
          product={apiProduct}
          showStatus={false}
          showCatalogLink={false}
        />
      </InfoCard>
      {hasOidc && jwtIssuer && (
        <Box mt={2}>
          <OidcProviderCard
            issuerUrl={jwtIssuer}
            tokenEndpoint={jwtTokenEndpoint}
          />
        </Box>
      )}
    </>
  );
};
