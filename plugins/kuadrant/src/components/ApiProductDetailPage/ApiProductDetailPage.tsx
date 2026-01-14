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
import {
  Box,
  Typography,
  IconButton,
  Tooltip,
  Tabs,
  Tab,
  Button,
  makeStyles,
} from "@material-ui/core";
import ArrowBackIcon from "@material-ui/icons/ArrowBack";
import EditIcon from "@material-ui/icons/Edit";
import DeleteIcon from "@material-ui/icons/Delete";
import { APIProduct } from "../../types/api-management";
import { EditAPIProductDialog } from "../EditAPIProductDialog";
import { ConfirmDeleteDialog } from "../ConfirmDeleteDialog";
import { ApiProductDetails } from "../ApiProductDetails";
import { useKuadrantPermission } from "../../utils/permissions";
import {
  kuadrantApiProductUpdateAllPermission,
  kuadrantApiProductDeleteAllPermission,
} from "../../permissions";

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
    value: data,
    loading,
    error,
  } = useAsync(async () => {
    const [productResponse, policiesResponse] = await Promise.all([
      fetchApi.fetch(`${backendUrl}/api/kuadrant/apiproducts/${namespace}/${name}`),
      fetchApi.fetch(`${backendUrl}/api/kuadrant/planpolicies`),
    ]);

    if (!productResponse.ok) {
      throw new Error("Failed to fetch API product");
    }
    const product = await productResponse.json();

    // find associated planpolicy
    let planPolicy = null;
    if (policiesResponse.ok) {
      const policies = await policiesResponse.json();
      planPolicy = (policies.items || []).find((pp: any) => {
        const ref = pp.targetRef;
        const targetRef = product.spec?.targetRef as any;
        return (
          ref?.kind === "HTTPRoute" &&
          ref?.name === targetRef?.name &&
          (!ref?.namespace || ref?.namespace === (targetRef?.namespace || namespace))
        );
      });
    }

    return { product: product as APIProduct, planPolicy };
  }, [namespace, name, backendUrl, fetchApi, refreshKey]);

  const product = data?.product;
  const planPolicy = data?.planPolicy;

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
      if (!response.ok) throw new Error("Failed to update publish status");
      alertApi.post({
        message: `API Product ${newStatus === "Published" ? "published" : "unpublished"} successfully`,
        severity: "success",
        display: "transient",
      });
      setRefreshKey((k) => k + 1);
    } catch (err) {
      alertApi.post({
        message: "Failed to update publish status",
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
      if (!response.ok) throw new Error("Failed to delete API product");
      setDeleteDialogOpen(false);
      alertApi.post({
        message: "API Product deleted successfully",
        severity: "success",
        display: "transient",
      });
      navigate("/kuadrant/api-products");
    } catch (err) {
      alertApi.post({
        message: "Failed to delete API product",
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

        <Box mb={2}>
          <Tabs
            value={selectedTab}
            onChange={(_, newValue) => setSelectedTab(newValue)}
            indicatorColor="primary"
            textColor="primary"
          >
            <Tab label="Overview" />
            {product.spec?.documentation?.openAPISpecURL && <Tab label="Definition" />}
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
              planPolicy={planPolicy}
              showStatus={true}
              showCatalogLink={true}
            />
          </InfoCard>
        )}

        {selectedTab === 1 && product.spec?.documentation?.openAPISpecURL && (
          <InfoCard title="API Definition">
            <Typography variant="body2" color="textSecondary">
              View the OpenAPI specification at:{" "}
              <Link to={product.spec.documentation.openAPISpecURL} target="_blank">
                {product.spec.documentation.openAPISpecURL}
              </Link>
            </Typography>
          </InfoCard>
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
