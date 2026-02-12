import React from "react";
import { useEntity } from "@backstage/plugin-catalog-react";
import { useApi } from "@backstage/core-plugin-api";
import { Link } from "@backstage/core-components";
import { Box, Typography } from "@material-ui/core";
import { Alert } from "@material-ui/lab";
import useAsync from "react-use/lib/useAsync";
import { kuadrantApiRef } from "../../api";

// Displays alerts for OpenAPI spec issues.
export const ApiProductOpenApiAlert = () => {
  const { entity } = useEntity();
  const kuadrantApi = useApi(kuadrantApiRef);

  // Get APIProduct reference from entity annotations
  const namespace = entity.metadata.annotations?.["kuadrant.io/namespace"];
  const apiProductName =
    entity.metadata.annotations?.["kuadrant.io/apiproduct"];

  // Fetch the full APIProduct resource to check status conditions
  const { value: apiProduct, loading, error } = useAsync(async () => {
    if (!namespace || !apiProductName) {
      return null;
    }

    try {
      return await kuadrantApi.getApiProduct(namespace, apiProductName);
    } catch {
      return null;
    }
  }, [kuadrantApi, namespace, apiProductName]);

  // Don't render anything if data is missing or still loading
  if (!namespace || !apiProductName || loading || error || !apiProduct) {
    return null;
  }

  const { spec, status } = apiProduct;

  const openAPICondition = status?.conditions?.find(
    (c: any) => c.type === "OpenAPISpecReady" && c.status === "False",
  );

  if (!openAPICondition) {
    return null;
  }

  return (
    <Box mb={2}>
      <Alert severity="warning">
        <Typography variant="body2" gutterBottom>
          <strong>OpenAPI Spec Issue</strong>
        </Typography>
        <Typography variant="body2" gutterBottom>
          {openAPICondition.message}
        </Typography>
        {spec.documentation?.openAPISpecURL && (
          <Typography variant="body2">
            Spec URL:{" "}
            <Link to={spec.documentation.openAPISpecURL} target="_blank">
              {spec.documentation.openAPISpecURL}
            </Link>
          </Typography>
        )}
      </Alert>
    </Box>
  );
};
