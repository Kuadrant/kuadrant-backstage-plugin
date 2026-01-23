import React from 'react';
import { InfoCard, CodeSnippet, Link } from '@backstage/core-components';
import { Typography, Box, Grid } from '@material-ui/core';

interface OidcProviderCardProps {
  issuerUrl: string;
  tokenEndpoint?: string;
}

export const OidcProviderCard = ({ issuerUrl, tokenEndpoint }: OidcProviderCardProps) => {
  const effectiveTokenEndpoint = tokenEndpoint || issuerUrl;

  return (
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
              <Link to={issuerUrl} target="_blank">
                {issuerUrl}
              </Link>
            </Typography>
          </Grid>
          {tokenEndpoint && (
            <Grid item xs={12}>
              <Typography variant="body2">
                <strong>Token Endpoint: </strong>
                <Link to={tokenEndpoint} target="_blank">
                  {tokenEndpoint}
                </Link>
              </Typography>
            </Grid>
          )}
          <Grid item xs={12}>
            <CodeSnippet
              text={`# Example (Client Credentials Flow):
curl -X POST \\
   -d "grant_type=client_credentials" \\
   -d "client_id=YOUR_CLIENT_ID" \\
   -d "client_secret=YOUR_CLIENT_SECRET" \\
   ${effectiveTokenEndpoint}`}
              language="bash"
              showCopyCodeButton
            />
          </Grid>
        </Grid>
      </Box>
    </InfoCard>
  );
};
