import React, { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  useApi,
  configApiRef,
  fetchApiRef,
  alertApiRef,
} from "@backstage/core-plugin-api";
import { useAsync } from "react-use";
import {
  Header,
  Page,
  Content,
  Progress,
  ResponseErrorPanel,
  InfoCard,
  Link,
  Breadcrumbs,
} from "@backstage/core-components";
import { OpenApiDefinitionWidget } from "@backstage/plugin-api-docs";
import {
  Box,
  Typography,
  IconButton,
  Tooltip,
  Tabs,
  Tab,
  Button,
  makeStyles,
  Grid,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
} from "@material-ui/core";
import ArrowBackIcon from "@material-ui/icons/ArrowBack";
import EditIcon from "@material-ui/icons/Edit";
import DeleteIcon from "@material-ui/icons/Delete";
import { Alert } from '@material-ui/lab';
import { APIProduct } from "../../types/api-management";
import { EditAPIProductDialog } from "../EditAPIProductDialog";
import { ConfirmDeleteDialog } from "../ConfirmDeleteDialog";
import { ApiProductDetails } from "../ApiProductDetails";
import { OidcProviderCard } from "../OidcProviderCard";
import { useKuadrantPermission } from "../../utils/permissions";
import {
  kuadrantApiProductUpdateAllPermission,
  kuadrantApiProductDeleteAllPermission,
} from "../../permissions";
import {handleFetchError} from "../../utils/errors.ts";

const useStyles = makeStyles((theme) => ({
  label: {
    fontWeight: 600,
    color: theme.palette.text.secondary,
    marginBottom: theme.spacing(0.5),
    fontSize: '0.75rem',
    textTransform: 'uppercase',
  },
  actionButtons: {
    display: "flex",
    gap: theme.spacing(1),
    alignItems: "center",
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: theme.spacing(2),
  },
  cardActions: {
    display: 'flex',
    gap: theme.spacing(1),
    alignItems: 'center',
  },
}));

export const ApiProductDetailPage = () => {
  const classes = useStyles();
  const { namespace, name } = useParams<{ namespace: string; name: string }>();
  const navigate = useNavigate();
  const config = useApi(configApiRef);
  const fetchApi = useApi(fetchApiRef);
  const alertApi = useApi(alertApiRef);
  const backendUrl = config.getString("backend.baseUrl");

  const [selectedTab, setSelectedTab] = useState(0);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const { allowed: canUpdateApiProduct } = useKuadrantPermission(kuadrantApiProductUpdateAllPermission);
  const { allowed: canDeleteApiProduct } = useKuadrantPermission(kuadrantApiProductDeleteAllPermission);
  const canPublishApiProduct = canUpdateApiProduct;

  const {
    value: product,
    loading,
    error,
  } = useAsync(async () => {
    const response = await fetchApi.fetch(
      `${backendUrl}/api/kuadrant/apiproducts/${namespace}/${name}`
    );

    if (!response.ok) {
      const err = await handleFetchError(response);
      throw new Error(`Failed to fetch API product. ${err}`);
    }

    return response.json() as Promise<APIProduct>;
  }, [namespace, name, backendUrl, fetchApi, refreshKey]);

  const handlePublishToggle = async () => {
    if (!product) return;
    const newStatus = product.spec?.publishStatus === "Published" ? "Draft" : "Published";
    try {
      const response = await fetchApi.fetch(
        `${backendUrl}/api/kuadrant/apiproducts/${namespace}/${name}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ spec: { publishStatus: newStatus } }),
        }
      );
      if (!response.ok) {
        const err = await handleFetchError(response);
        throw new Error(err);
      }
      alertApi.post({
        message: `API Product ${newStatus === "Published" ? "published" : "unpublished"} successfully`,
        severity: "success",
        display: "transient",
      });
      setRefreshKey((k) => k + 1);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "unknown error occurred";
      alertApi.post({
        message: `Failed to update publish status. ${errorMessage}`,
        severity: "error",
        display: "transient",
      });
    }
  };

  const handleEditSuccess = () => {
    setEditDialogOpen(false);
    setRefreshKey((k) => k + 1);
    alertApi.post({
      message: "API Product updated successfully",
      severity: "success",
      display: "transient",
    });
  };

  const handleDelete = async () => {
    if (!product) return;
    setDeleting(true);
    try {
      const response = await fetchApi.fetch(
        `${backendUrl}/api/kuadrant/apiproducts/${namespace}/${name}`,
        { method: "DELETE" }
      );
      if (!response.ok) {
        const err = await handleFetchError(response);
        throw new Error(err);
      }
      setDeleteDialogOpen(false);
      alertApi.post({
        message: "API Product deleted successfully",
        severity: "success",
        display: "transient",
      });
      navigate("/kuadrant/api-products");
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "unknown error occurred";
      alertApi.post({
        message: `Failed to delete API product. ${errorMessage}`,
        severity: "error",
        display: "transient",
      });
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return <Progress />;
  }

  if (error || !product) {
    return (
      <ResponseErrorPanel error={error || new Error("API product not found")} />
    );
  }

  const isPublished = product.spec?.publishStatus === "Published";

  // get policy conditions from status
  const planPolicyCondition = product.status?.conditions?.find(
    (c) => c.type === "PlanPolicyDiscovered"
  );
  const authPolicyCondition = product.status?.conditions?.find(
    (c) => c.type === "AuthPolicyDiscovered"
  );
  const discoveredPlans = product.status?.discoveredPlans || [];

  const authSchemes = product.status?.discoveredAuthScheme?.authentication || {};
  const schemeObjects = Object.values(authSchemes);
  const hasOIDCTab = schemeObjects.some((scheme: any) =>
    scheme.hasOwnProperty("jwt"),
  );
  // Extract JWT issuer from the first JWT scheme
  const jwtScheme = schemeObjects.find((scheme: any) => scheme.hasOwnProperty("jwt"));
  const jwtIssuer = (jwtScheme as any)?.jwt?.issuerUrl || "unknown";
  const jwtTokenEndpoint = product.status?.oidcDiscovery?.tokenEndpoint || "unknown";

  // compute tab indices
  const hasDefinitionTab = !!(product.status?.openapi?.raw || product.spec?.documentation?.openAPISpecURL);
  const hasPoliciesTab = !!(planPolicyCondition || authPolicyCondition || discoveredPlans.length > 0);

  let nextIndex = 1; // Overview is always at index 0
  const definitionTabIndex = hasDefinitionTab ? nextIndex++ : -1;
  const policiesTabIndex = hasPoliciesTab ? nextIndex++ : -1;
  const oidcTabIndex = hasOIDCTab ? nextIndex++ : -1;

  const formatLimits = (limits: any): string => {
    if (!limits) return "No limits";
    const parts: string[] = [];
    if (limits.daily) parts.push(`${limits.daily}/day`);
    if (limits.weekly) parts.push(`${limits.weekly}/week`);
    if (limits.monthly) parts.push(`${limits.monthly}/month`);
    if (limits.yearly) parts.push(`${limits.yearly}/year`);
    return parts.length > 0 ? parts.join(", ") : "No limits";
  };

  return (
    <Page themeId="tool">
      <Header
        title={product.spec?.displayName || product.metadata.name}
        subtitle={product.spec?.description || ""}
      >
        <Box className={classes.actionButtons}>
          <Link to="/kuadrant/api-products">
            <Button startIcon={<ArrowBackIcon />}>Back</Button>
          </Link>
          {canPublishApiProduct && (
            <Button
              variant="outlined"
              color={isPublished ? "default" : "primary"}
              onClick={handlePublishToggle}
            >
              {isPublished ? "Unpublish API product" : "Publish API product"}
            </Button>
          )}
          {canUpdateApiProduct && (
            <Tooltip title="Edit">
              <IconButton onClick={() => setEditDialogOpen(true)} size="small">
                <EditIcon />
              </IconButton>
            </Tooltip>
          )}
          {canDeleteApiProduct && (
            <Tooltip title="Delete">
              <IconButton onClick={() => setDeleteDialogOpen(true)} size="small">
                <DeleteIcon />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      </Header>
      <Content>
        <Box mb={2}>
          <Breadcrumbs aria-label="breadcrumb">
            <Link to="/kuadrant/api-products">API Products</Link>
            <Typography>{product.spec?.displayName || product.metadata.name}</Typography>
          </Breadcrumbs>
        </Box>

        
        {product.metadata.labels?.lifecycle === 'deprecated' && (
          <Box mb={2}>
            <Alert severity="warning">
              <strong>This API is deprecated.</strong> Please contact your administrator for more details.
            </Alert>
          </Box>
        )}

        <Box mb={2}>
          <Tabs
            value={selectedTab}
            onChange={(_, newValue) => setSelectedTab(newValue)}
            indicatorColor="primary"
            textColor="primary"
          >
            <Tab label="Overview" />
            {hasDefinitionTab && <Tab label="Definition" />}
            {hasPoliciesTab && <Tab label="Policies" />}
            {hasOIDCTab && <Tab label="OIDC" />}
          </Tabs>
        </Box>

        {selectedTab === 0 && (
          <InfoCard title="API Product">
            <Box className={classes.cardHeader}>
              <Box>
                <Typography variant="caption" className={classes.label}>
                  Product Name
                </Typography>
                <Typography variant="h6">
                  {product.spec?.displayName || product.metadata.name}
                </Typography>
              </Box>
              <Box className={classes.cardActions}>
                {canPublishApiProduct && (
                  <Button
                    variant="outlined"
                    color={isPublished ? "default" : "primary"}
                    onClick={handlePublishToggle}
                    size="small"
                  >
                    {isPublished ? "Unpublish API product" : "Publish API product"}
                  </Button>
                )}
                {canUpdateApiProduct && (
                  <IconButton onClick={() => setEditDialogOpen(true)} size="small">
                    <EditIcon fontSize="small" />
                  </IconButton>
                )}
                {canDeleteApiProduct && (
                  <IconButton onClick={() => setDeleteDialogOpen(true)} size="small">
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                )}
              </Box>
            </Box>

            <ApiProductDetails
              product={product}
              showStatus={true}
              showCatalogLink={true}
            />
          </InfoCard>
        )}

        {selectedTab === definitionTabIndex && hasDefinitionTab && (
          <InfoCard title="API Definition">
            {product.status?.openapi?.raw ? (
              <OpenApiDefinitionWidget definition={product.status.openapi.raw} />
            ) : (
              <Typography variant="body2" color="textSecondary">
                {product.spec?.documentation?.openAPISpecURL ? (
                  <>
                    OpenAPI specification not yet synced. View at:{" "}
                    <Link to={product.spec.documentation.openAPISpecURL} target="_blank">
                      {product.spec.documentation.openAPISpecURL}
                    </Link>
                  </>
                ) : (
                  "No OpenAPI specification available for this API product."
                )}
              </Typography>
            )}
          </InfoCard>
        )}

        {selectedTab === policiesTabIndex && hasPoliciesTab && (
          <Grid container spacing={3}>
            <Grid item xs={12}>
              <InfoCard title="Discovered Policies">
                <Grid container spacing={2}>
                  <Grid item xs={12} md={6}>
                    <Typography variant="body2" color="textSecondary" gutterBottom>
                      Plan Policy
                    </Typography>
                    {planPolicyCondition ? (
                      <Box>
                        <Chip
                          label={planPolicyCondition.status === "True" ? "Found" : "Not Found"}
                          size="small"
                          style={{
                            backgroundColor: planPolicyCondition.status === "True" ? "#4caf50" : "#ff9800",
                            color: "#fff",
                            marginBottom: 8,
                          }}
                        />
                        <Typography variant="body2">
                          {planPolicyCondition.message || "No details available"}
                        </Typography>
                      </Box>
                    ) : (
                      <Typography variant="body2">No plan policy information</Typography>
                    )}
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <Typography variant="body2" color="textSecondary" gutterBottom>
                      Auth Policy
                    </Typography>
                    {authPolicyCondition ? (
                      <Box>
                        <Chip
                          label={authPolicyCondition.status === "True" ? "Found" : "Not Found"}
                          size="small"
                          style={{
                            backgroundColor: authPolicyCondition.status === "True" ? "#4caf50" : "#ff9800",
                            color: "#fff",
                            marginBottom: 8,
                          }}
                        />
                        <Typography variant="body2">
                          {authPolicyCondition.message || "No details available"}
                        </Typography>
                      </Box>
                    ) : (
                      <Typography variant="body2">No auth policy information</Typography>
                    )}
                  </Grid>
                </Grid>
              </InfoCard>
            </Grid>

            {discoveredPlans.length > 0 && (
              <Grid item xs={12}>
                <InfoCard title="Effective Plan Tiers">
                  <Typography variant="body2" color="textSecondary" paragraph>
                    These tiers are computed from all attached PlanPolicies (including gateway-level policies).
                  </Typography>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Tier</TableCell>
                        <TableCell>Rate Limits</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {discoveredPlans.map((plan) => (
                        <TableRow key={plan.tier}>
                          <TableCell>
                            <Chip label={plan.tier} size="small" color="primary" />
                          </TableCell>
                          <TableCell>{formatLimits(plan.limits)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </InfoCard>
              </Grid>
            )}
          </Grid>
        )}

        {selectedTab === oidcTabIndex && hasOIDCTab && (
          <OidcProviderCard
            issuerUrl={jwtIssuer}
            tokenEndpoint={jwtTokenEndpoint}
          />
        )}
      </Content>

      <EditAPIProductDialog
        open={editDialogOpen}
        onClose={() => setEditDialogOpen(false)}
        onSuccess={handleEditSuccess}
        namespace={namespace || ""}
        name={name || ""}
      />

      <ConfirmDeleteDialog
        open={deleteDialogOpen}
        title="Delete API Product"
        description={`Are you sure you want to delete "${product.spec?.displayName || product.metadata.name}"? This action cannot be undone.`}
        severity="high"
        confirmText={product.metadata.name}
        deleting={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteDialogOpen(false)}
      />
    </Page>
  );
};
