import React, { useState, useMemo, useCallback } from "react";
import {
  Typography,
  Box,
  Chip,
  Button,
  IconButton,
  CircularProgress,
  makeStyles,
} from "@material-ui/core";
import AddIcon from "@material-ui/icons/Add";
import DeleteIcon from "@material-ui/icons/Delete";
import EditIcon from "@material-ui/icons/Edit";
import VpnKeyIcon from "@material-ui/icons/VpnKey";
import LockIcon from "@material-ui/icons/Lock";
import { FilterPanel, FilterSection, FilterState } from "../FilterPanel";
import {
  Header,
  Page,
  Content,
  SupportButton,
  ResponseErrorPanel,
  Link,
  Table,
  TableColumn,
} from "@backstage/core-components";
import useAsync from "react-use/lib/useAsync";
import {
  useApi,
  configApiRef,
  fetchApiRef,
  alertApiRef,
  identityApiRef,
} from "@backstage/core-plugin-api";
import { PermissionGate } from "../PermissionGate";
import { CreateAPIProductDialog } from "../CreateAPIProductDialog";
import {
  kuadrantApiProductCreatePermission,
  kuadrantApiProductDeleteOwnPermission,
  kuadrantApiProductDeleteAllPermission,
  kuadrantApiProductUpdateOwnPermission,
  kuadrantApiProductUpdateAllPermission,
  kuadrantApiProductListPermission,
  kuadrantPlanPolicyListPermission,
} from "../../permissions";
import { useKuadrantPermission } from "../../utils/permissions";
import { handleFetchError } from "../../utils/errors";
import { EditAPIProductDialog } from "../EditAPIProductDialog";
import { ConfirmDeleteDialog } from "../ConfirmDeleteDialog";
import emptyStateIllustration from "../../assets/empty-state-illustration.png";
import { getLifecycleChipStyle } from "../../utils/styles";

type KuadrantResource = {
  metadata: {
    name: string;
    namespace: string;
    creationTimestamp: string;
    annotations?: Record<string, string>;
    labels?: Record<string, string>;
  };
  spec?: any;
  status?: any;
};

type KuadrantList = {
  items: KuadrantResource[];
};

const useStyles = makeStyles((theme) => ({
  container: {
    display: "flex",
    height: "100%",
    minHeight: 400,
  },
  tableContainer: {
    flex: 1,
    overflow: "auto",
    padding: 10,
  },
  emptyState: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: theme.spacing(6),
    minHeight: 400,
  },
  emptyStateContent: {
    display: "flex",
    alignItems: "center",
    gap: theme.spacing(6),
    maxWidth: 900,
  },
  emptyStateText: {
    flex: 1,
  },
  emptyStateTitle: {
    marginBottom: theme.spacing(2),
  },
  emptyStateDescription: {
    marginBottom: theme.spacing(3),
    color: theme.palette.text.secondary,
  },
  emptyStateImage: {
    maxWidth: 400,
    height: "auto",
  },
}));

const ResourceList = () => {
  const classes = useStyles();
  const config = useApi(configApiRef);
  const fetchApi = useApi(fetchApiRef);
  const alertApi = useApi(alertApiRef);
  const identityApi = useApi(identityApiRef);
  const backendUrl = config.getString("backend.baseUrl");
  const [userEntityRef, setUserEntityRef] = useState<string>("");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [apiProductToDelete, setApiProductToDelete] = useState<{
    namespace: string;
    name: string;
  } | null>(null);
  const [apiProductToEdit, setApiProductToEdit] = useState<{
    namespace: string;
    name: string;
  } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteStats, setDeleteStats] = useState<{
    requests: number;
    secrets: number;
  } | null>(null);
  const [filters, setFilters] = useState<FilterState>({
    status: [],
    lifecycle: [],
    policy: [],
    route: [],
    namespace: [],
    tags: [],
    authentication: [],
  });

  const {
    allowed: canCreateApiProduct,
    loading: createPermissionLoading,
    error: createPermissionError,
  } = useKuadrantPermission(kuadrantApiProductCreatePermission);

  const {
    allowed: canDeleteOwnApiProduct,
    loading: deleteOwnPermissionLoading,
  } = useKuadrantPermission(kuadrantApiProductDeleteOwnPermission);

  const {
    allowed: canDeleteAllApiProducts,
    loading: deleteAllPermissionLoading,
    error: deletePermissionError,
  } = useKuadrantPermission(kuadrantApiProductDeleteAllPermission);

  const { allowed: canUpdateOwnApiProduct } = useKuadrantPermission(
    kuadrantApiProductUpdateOwnPermission,
  );

  const { allowed: canUpdateAllApiProducts } = useKuadrantPermission(
    kuadrantApiProductUpdateAllPermission,
  );

  const deletePermissionLoading =
    deleteOwnPermissionLoading || deleteAllPermissionLoading;

  const {
    allowed: canListPlanPolicies,
    loading: planPolicyPermissionLoading,
    error: planPolicyPermissionError,
  } = useKuadrantPermission(kuadrantPlanPolicyListPermission);

  useAsync(async () => {
    const identity = await identityApi.getBackstageIdentity();
    setUserEntityRef(identity.userEntityRef);
  }, [identityApi]);

  const {
    value: apiProducts,
    loading: apiProductsLoading,
    error: apiProductsError,
  } = useAsync(async (): Promise<KuadrantList> => {
    const response = await fetchApi.fetch(
      `${backendUrl}/api/kuadrant/apiproducts`,
    );
    if (!response.ok) {
      const error = await handleFetchError(response);
      throw new Error(`failed to fetch APIProducts. ${error}`);
    }
    return await response.json();
  }, [backendUrl, fetchApi, refreshTrigger]);

  const {
    value: planPolicies,
    loading: planPoliciesLoading,
    error: planPoliciesError,
  } = useAsync(async (): Promise<KuadrantList> => {
    // skip fetch if user doesn't have permission
    if (!canListPlanPolicies) {
      return { items: [] };
    }
    const response = await fetchApi.fetch(
      `${backendUrl}/api/kuadrant/planpolicies`,
    );
    if (!response.ok) {
      const error = await handleFetchError(response);
      throw new Error(`failed to fetch PlanPolicies: ${error}`);
    }
    return await response.json();
  }, [backendUrl, fetchApi, refreshTrigger, canListPlanPolicies]);

  // helper to find policy for a given route
  const getPolicyForProduct = useCallback((product: KuadrantResource): string | null => {
    if (!planPolicies?.items) return null;
    const targetRef = product.spec?.targetRef;
    if (!targetRef) return null;

    const policy = planPolicies.items.find((pp: KuadrantResource) => {
      const ref = (pp as any).targetRef;
      return (
        ref?.kind === "HTTPRoute" &&
        ref?.name === targetRef.name &&
        (!ref?.namespace || ref?.namespace === (targetRef.namespace || product.metadata.namespace))
      );
    });
    return policy?.metadata.name || null;
  }, [planPolicies]);

  // helper to get auth schemes for a product
  const getAuthSchemes = useCallback((product: KuadrantResource): string[] => {
    const authSchemes = product.status?.discoveredAuthScheme?.authentication || {};
    const schemeObjects = Object.values(authSchemes);
    const schemes: string[] = [];

    if (schemeObjects.some((scheme: any) => scheme.hasOwnProperty("apiKey"))) {
      schemes.push("API Key");
    }
    if (schemeObjects.some((scheme: any) => scheme.hasOwnProperty("jwt"))) {
      schemes.push("OIDC");
    }
    if (schemes.length === 0) {
      schemes.push("Unknown");
    }
    return schemes;
  }, []);

  const loading =
    apiProductsLoading ||
    planPoliciesLoading ||
    createPermissionLoading ||
    deletePermissionLoading ||
    planPolicyPermissionLoading;
  const error = apiProductsError || planPoliciesError;
  const permissionError =
    createPermissionError || deletePermissionError || planPolicyPermissionError;

  const allProducts = useMemo(() => {
    const products = apiProducts?.items || [];

    // API consumers (users without create/update permissions) should only see Published products
    // API owners can see all products (Draft and Published)
    if (!canCreateApiProduct && !canUpdateOwnApiProduct && !canUpdateAllApiProducts) {
      return products.filter((p: KuadrantResource) => {
        const publishStatus = p.spec?.publishStatus || 'Draft';
        return publishStatus === 'Published';
      });
    }

    return products;
  }, [apiProducts, canCreateApiProduct, canUpdateOwnApiProduct, canUpdateAllApiProducts]);

  const filterSections: FilterSection[] = useMemo(() => {
    const statusCounts = { Draft: 0, Published: 0 };
    const lifecycleCounts = new Map<string, number>();
    const policyCounts = new Map<string, number>();
    const routeCounts = new Map<string, number>();
    const namespaceCounts = new Map<string, number>();
    const tagCounts = new Map<string, number>();
    const authCounts = new Map<string, number>();

    allProducts.forEach((p: KuadrantResource) => {
      const status = p.spec?.publishStatus || "Draft";
      statusCounts[status as keyof typeof statusCounts]++;

      const lifecycle = p.metadata.labels?.lifecycle || "production";
      lifecycleCounts.set(lifecycle, (lifecycleCounts.get(lifecycle) || 0) + 1);

      const policy = getPolicyForProduct(p) || "N/A";
      policyCounts.set(policy, (policyCounts.get(policy) || 0) + 1);

      const route = p.spec?.targetRef?.name || "unknown";
      routeCounts.set(route, (routeCounts.get(route) || 0) + 1);

      const ns = p.metadata.namespace;
      namespaceCounts.set(ns, (namespaceCounts.get(ns) || 0) + 1);

      const tags = p.spec?.tags || [];
      tags.forEach((tag: string) => {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
      });

      const authSchemes = getAuthSchemes(p);
      authSchemes.forEach((scheme: string) => {
        authCounts.set(scheme, (authCounts.get(scheme) || 0) + 1);
      });
    });

    const sections: FilterSection[] = [
      {
        id: "status",
        title: "Publish Status",
        options: [
          { value: "Draft", label: "Draft", count: statusCounts.Draft },
          { value: "Published", label: "Published", count: statusCounts.Published },
        ],
      },
      {
        id: "lifecycle",
        title: "Lifecycle",
        options: Array.from(lifecycleCounts.entries()).map(([state, count]) => ({
          value: state,
          label: state.charAt(0).toUpperCase() + state.slice(1),
          count,
        })),
      },
      {
        id: "authentication",
        title: "Authentication",
        options: Array.from(authCounts.entries()).map(([scheme, count]) => ({
          value: scheme,
          label: scheme,
          count,
        })),
      },
      {
        id: "route",
        title: "Route",
        options: Array.from(routeCounts.entries()).map(([name, count]) => ({
          value: name,
          label: name,
          count,
        })),
        collapsed: routeCounts.size > 5,
      },
      {
        id: "namespace",
        title: "Namespace",
        options: Array.from(namespaceCounts.entries()).map(([ns, count]) => ({
          value: ns,
          label: ns,
          count,
        })),
        collapsed: namespaceCounts.size > 5,
      },
      {
        id: "tags",
        title: "Tags",
        options: Array.from(tagCounts.entries()).map(([tag, count]) => ({
          value: tag,
          label: tag,
          count,
        })),
        collapsed: tagCounts.size > 5,
      },
    ];

    // only show policy filter if user can list planpolicies
    if (canListPlanPolicies) {
      sections.splice(2, 0, {
        id: "policy",
        title: "Policy",
        options: Array.from(policyCounts.entries()).map(([name, count]) => ({
          value: name,
          label: name,
          count,
        })),
        collapsed: policyCounts.size > 5,
      });
    }

    return sections;
  }, [allProducts, getPolicyForProduct, getAuthSchemes, canListPlanPolicies]);

  const filteredProducts = useMemo(() => {
    return allProducts.filter((p: KuadrantResource) => {
      if (filters.status.length > 0) {
        const status = p.spec?.publishStatus || "Draft";
        if (!filters.status.includes(status)) return false;
      }

      if (filters.lifecycle && filters.lifecycle.length > 0) {
        const lifecycle = p.metadata.labels?.lifecycle || "production";
        if (!filters.lifecycle.includes(lifecycle)) return false;
      }

      if (filters.authentication.length > 0) {
        const authSchemes = getAuthSchemes(p);
        if (!filters.authentication.some((a: string) => authSchemes.includes(a))) return false;
      }

      if (filters.policy.length > 0) {
        const policy = getPolicyForProduct(p) || "N/A";
        if (!filters.policy.includes(policy)) return false;
      }

      if (filters.route.length > 0) {
        const route = p.spec?.targetRef?.name || "unknown";
        if (!filters.route.includes(route)) return false;
      }

      if (filters.namespace.length > 0) {
        if (!filters.namespace.includes(p.metadata.namespace)) return false;
      }

      if (filters.tags.length > 0) {
        const tags = p.spec?.tags || [];
        if (!filters.tags.some((t: string) => tags.includes(t))) return false;
      }

      return true;
    });
  }, [allProducts, filters, getPolicyForProduct, getAuthSchemes]);

  const handleCreateSuccess = (productInfo: { namespace: string; name: string; displayName: string }) => {
    setRefreshTrigger((prev) => prev + 1);
    alertApi.post({
      message: `"${productInfo.displayName}" created successfully`,
      severity: "success",
      display: "transient",
    });
  };

  const handleEditClick = (namespace: string, name: string) => {
    setApiProductToEdit({ namespace, name });
    setEditDialogOpen(true);
  };

  const handleEditSuccess = () => {
    setRefreshTrigger((prev) => prev + 1);
    const productName = apiProductToEdit?.name || "API Product";
    alertApi.post({
      message: `"${productName}" updated successfully`,
      severity: "success",
      display: "transient",
    });
  };

  const handleDeleteClick = async (namespace: string, name: string) => {
    setApiProductToDelete({ namespace, name });
    setDeleteStats(null);

    try {
      const response = await fetchApi.fetch(
        `${backendUrl}/api/kuadrant/requests?namespace=${namespace}`,
      );

      if (!response.ok) {
        const error = await handleFetchError(response);
        throw new Error(error);
      }

      const data = await response.json();
      const related = (data.items || []).filter(
        (r: any) =>
          r.spec.apiName === name && r.spec.apiNamespace === namespace,
      );
      const approved = related.filter(
        (r: any) => r.status?.phase === "Approved",
      ).length;
      setDeleteStats({ requests: related.length, secrets: approved });
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "unknown error occurred";
      alertApi.post({
        message: `Failed to delete access request: ${errorMessage}`,
        severity: "error",
        display: "transient",
      });
    } finally {
      setDeleteDialogOpen(true);
    }

  };

  const handleDeleteConfirm = async () => {
    if (!apiProductToDelete) return;

    setDeleting(true);
    try {
      const response = await fetchApi.fetch(
        `${backendUrl}/api/kuadrant/apiproducts/${apiProductToDelete.namespace}/${apiProductToDelete.name}`,
        { method: "DELETE" },
      );

      if (!response.ok) {
        const error = await handleFetchError(response);
        throw new Error(error);
      }

      const deletedName = apiProductToDelete?.name || "API Product";
      setRefreshTrigger((prev) => prev + 1);
      alertApi.post({
        message: `"${deletedName}" deleted successfully`,
        severity: "success",
        display: "transient",
      });
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "unknown error occurred";
      alertApi.post({
        message: `Failed to delete API Product: ${errorMessage}`,
        severity: "error",
        display: "transient",
      });
    } finally {
      setDeleting(false);
      setDeleteDialogOpen(false);
      setApiProductToDelete(null);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteDialogOpen(false);
    setApiProductToDelete(null);
  };

  const handlePublishToggle = async (row: any) => {
    const namespace = row.metadata.namespace;
    const name = row.metadata.name;
    const displayName = row.spec?.displayName || name;
    const currentStatus = row.spec?.publishStatus || "Draft";
    const newStatus = currentStatus === "Published" ? "Draft" : "Published";

    try {
      const response = await fetchApi.fetch(
        `${backendUrl}/api/kuadrant/apiproducts/${namespace}/${name}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            spec: { publishStatus: newStatus },
          }),
        },
      );

      if (!response.ok) {
        const error = await handleFetchError(response);
        throw new Error(error);
      }

      setRefreshTrigger((prev) => prev + 1);
      alertApi.post({
        message: `"${displayName}" ${newStatus === "Published" ? "published" : "unpublished"} successfully`,
        severity: "success",
        display: "transient",
      });
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "unknown error occurred";
      alertApi.post({
        message: `Failed to update publish status: ${errorMessage}`,
        severity: "error",
        display: "transient",
      });
    }
  };

  const columns: TableColumn[] = [
    {
      title: "Name",
      field: "spec.displayName",
      render: (row: any) => {
        const displayName = row.spec?.displayName ?? row.metadata.name;
        return (
          <Link to={`/kuadrant/api-products/${row.metadata.namespace}/${row.metadata.name}`}>
            <strong>{displayName}</strong>
          </Link>
        );
      },
      customFilterAndSearch: (term, row: any) => {
        const displayName = row.spec?.displayName || row.metadata.name || "";
        return displayName.toLowerCase().includes(term.toLowerCase());
      },
    },
    {
      title: "Version",
      field: "spec.version",
      render: (row: any) => row.spec?.version || "-",
    },
    {
      title: "Route",
      field: "spec.targetRef.name",
      render: (row: any) => row.spec?.targetRef?.name || "-",
    },
    // only show policy column if user can list planpolicies
    ...(canListPlanPolicies
      ? [
          {
            title: "Policy",
            field: "policy",
            render: (row: any) => getPolicyForProduct(row) || "N/A",
          },
        ]
      : []),
    {
      title: "Tags",
      field: "spec.tags",
      render: (row: any) => {
        const tags = row.spec?.tags || [];
        if (tags.length === 0) return "-";
        return (
          <Box display="flex" style={{ gap: 4, flexWrap: "wrap" }}>
            {tags.map((tag: string) => (
              <Chip key={tag} label={tag} size="small" variant="outlined" />
            ))}
          </Box>
        );
      },
    },
    {
      title: "Status",
      field: "spec.publishStatus",
      render: (row: any) => {
        const status = row.spec?.publishStatus || "Draft";
        return (
          <Chip
            label={status}
            size="small"
            color={status === "Published" ? "primary" : "default"}
          />
        );
      },
    },
    {
      title: "Lifecycle",
      field: "metadata.labels.lifecycle",
      render: (row: any) => {
        const lifecycle = row.metadata.labels?.lifecycle;
        if (!lifecycle) return "-";
        return (
          <Chip
            label={lifecycle.charAt(0).toUpperCase() + lifecycle.slice(1)}
            size="small"
            style={getLifecycleChipStyle(lifecycle)}
          />
        );
      },
    },
    {
      title: "Authentication",
      field: "status.discoveredAuthScheme",
      render: (row: any) => {
        const authSchemes =
          row.status?.discoveredAuthScheme?.authentication || {};
        const schemeObjects = Object.values(authSchemes);

        const hasApiKey = schemeObjects.some((scheme: any) =>
          scheme.hasOwnProperty("apiKey"),
        );
        const hasJwt = schemeObjects.some((scheme: any) =>
          scheme.hasOwnProperty("jwt"),
        );

        if (!hasApiKey && !hasJwt) {
          return (
            <Typography variant="body2" style={{ fontStyle: "italic" }}>
              unknown
            </Typography>
          );
        }

        return (
          <Box display="flex" style={{ gap: 4 }}>
            {hasApiKey && (
              <Chip
                icon={<VpnKeyIcon />}
                label="API Key"
                size="small"
                color="primary"
              />
            )}
            {hasJwt && (
              <Chip
                icon={<LockIcon />}
                label="OIDC"
                size="small"
                color="secondary"
              />
            )}
          </Box>
        );
      },
    },
    {
      title: "Namespace",
      field: "metadata.namespace",
    },
    {
      title: "Actions",
      field: "actions",
      filtering: false,
      render: (row: any) => {
        const owner = row.metadata?.annotations?.["backstage.io/owner"];
        const isOwner = owner === userEntityRef;
        const canEdit =
          canUpdateAllApiProducts || (canUpdateOwnApiProduct && isOwner);
        const canDelete =
          canDeleteAllApiProducts || (canDeleteOwnApiProduct && isOwner);
        const isPublished = row.spec?.publishStatus === "Published";

        return (
          <Box display="flex" alignItems="center" style={{ gap: 4 }}>
            {canEdit && (
              <Button
                size="small"
                color="primary"
                onClick={() => handlePublishToggle(row)}
                style={{ marginRight: 4, textTransform: "none" }}
              >
                {isPublished ? "Unpublish" : "Publish"}
              </Button>
            )}
            {canEdit && (
              <IconButton
                size="small"
                onClick={() =>
                  handleEditClick(row.metadata.namespace, row.metadata.name)
                }
                title="Edit API Product"
              >
                <EditIcon fontSize="small" />
              </IconButton>
            )}
            {canDelete && (
              <IconButton
                size="small"
                onClick={() =>
                  handleDeleteClick(row.metadata.namespace, row.metadata.name)
                }
                title="Delete API Product"
              >
                <DeleteIcon fontSize="small" />
              </IconButton>
            )}
          </Box>
        );
      },
    },
  ];

  return (
    <Page themeId="tool">
      <Header
        title="API Products"
        subtitle="Manage API products for Kubernetes"
      >
        <SupportButton>Manage API products and plan policies</SupportButton>
      </Header>
      <Content>
        {loading && (
          <Box
            display="flex"
            flexDirection="column"
            alignItems="center"
            justifyContent="center"
            minHeight={300}
          >
            <CircularProgress />
            <Typography variant="h6" style={{ marginTop: 16 }}>
              Loading data...
            </Typography>
            <Typography variant="body2" color="textSecondary">
              Preparing your data... This should only take a moment.
            </Typography>
          </Box>
        )}
        {error && <ResponseErrorPanel error={error} />}
        {permissionError && (
          <Box p={2}>
            <Typography color="error">
              unable to check permissions: {permissionError.message}
            </Typography>
            <Typography variant="body2" color="textSecondary">
              permission:{" "}
              {createPermissionError
                ? "kuadrant.apiproduct.create"
                : deletePermissionError
                  ? "kuadrant.apiproduct.delete"
                  : planPolicyPermissionError
                    ? "kuadrant.planpolicy.list"
                    : "unknown"}
            </Typography>
            <Typography variant="body2" color="textSecondary">
              please try again or contact your administrator
            </Typography>
          </Box>
        )}
        {!loading && !error && !permissionError && allProducts.length === 0 && (
          <Box className={classes.emptyState}>
            <Box className={classes.emptyStateContent}>
              <Box className={classes.emptyStateText}>
                <Typography variant="h4" className={classes.emptyStateTitle}>
                  API Product
                </Typography>
                <Typography
                  variant="body1"
                  className={classes.emptyStateDescription}
                >
                  Create API product by registering existing API, associate
                  route and policy
                </Typography>
                {canCreateApiProduct && (
                  <Button
                    variant="contained"
                    color="primary"
                    startIcon={<AddIcon />}
                    onClick={() => setCreateDialogOpen(true)}
                  >
                    Create API Product
                  </Button>
                )}
              </Box>
              <img
                src={emptyStateIllustration}
                alt="API Product illustration"
                className={classes.emptyStateImage}
              />
            </Box>
          </Box>
        )}
        {!loading && !error && !permissionError && allProducts.length > 0 && (
          <Box className={classes.container}>
            <FilterPanel
              sections={filterSections}
              filters={filters}
              onChange={setFilters}
            />
            <Box className={classes.tableContainer}>
              <Box display="flex" justifyContent="flex-end" mb={2}>
                {canCreateApiProduct && (
                  <Button
                    variant="contained"
                    color="primary"
                    size="small"
                    startIcon={<AddIcon />}
                    onClick={() => setCreateDialogOpen(true)}
                  >
                    Create API Product
                  </Button>
                )}
              </Box>
              {filteredProducts.length === 0 ? (
                <Box p={4} textAlign="center">
                  <Typography variant="body1" color="textSecondary">
                    No API products match the selected filters.
                  </Typography>
                </Box>
              ) : (
                <Table
                  options={{
                    paging: filteredProducts.length > 10,
                    pageSize: 20,
                    search: true,
                    filtering: false,
                    debounceInterval: 300,
                    toolbar: true,
                    emptyRowsWhenPaging: false,
                  }}
                  columns={columns}
                  data={filteredProducts}
                />
              )}
            </Box>
          </Box>
        )}
        <CreateAPIProductDialog
          open={createDialogOpen}
          onClose={() => setCreateDialogOpen(false)}
          onSuccess={handleCreateSuccess}
        />
        <EditAPIProductDialog
          open={editDialogOpen}
          onClose={() => setEditDialogOpen(false)}
          onSuccess={handleEditSuccess}
          namespace={apiProductToEdit?.namespace || ""}
          name={apiProductToEdit?.name || ""}
        />
        <ConfirmDeleteDialog
          open={deleteDialogOpen}
          title="Delete API Product"
          description={
            deleteStats
              ? `Deleting "${apiProductToDelete?.name}" will also remove:

• ${deleteStats.requests} API Key(s)
• ${deleteStats.secrets} API Key Secret(s)

This action cannot be undone.`
              : `Deleting "${apiProductToDelete?.name}" will also remove all associated API Keys and Secrets.
This action cannot be undone.`
          }
          confirmText={apiProductToDelete?.name}
          severity="high"
          deleting={deleting}
          onConfirm={handleDeleteConfirm}
          onCancel={handleDeleteCancel}
        />
      </Content>
    </Page>
  );
};

export const ApiProductsPage = () => {
  return (
    <PermissionGate
      permission={kuadrantApiProductListPermission}
      errorMessage="you don't have permission to view the Kuadrant page"
    >
      <ResourceList />
    </PermissionGate>
  );
};
