import React, { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Table,
  TableColumn,
  Link,
  Progress,
  ResponseErrorPanel,
} from "@backstage/core-components";
import {
  useApi,
  configApiRef,
  fetchApiRef,
  alertApiRef,
} from "@backstage/core-plugin-api";
import useAsync from "react-use/lib/useAsync";
import {
  Box,
  Chip,
  Typography,
  IconButton,
  Tooltip,
  Menu,
  MenuItem,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  makeStyles,
} from "@material-ui/core";
import VisibilityIcon from "@material-ui/icons/Visibility";
import VisibilityOffIcon from "@material-ui/icons/VisibilityOff";
import FileCopyIcon from "@material-ui/icons/FileCopy";
import WarningIcon from "@material-ui/icons/Warning";
import DeleteIcon from "@material-ui/icons/Delete";
import { EditAPIKeyDialog } from "../EditAPIKeyDialog";
import { ConfirmDeleteDialog } from "../ConfirmDeleteDialog";
import { FilterPanel, FilterSection, FilterState } from "../FilterPanel";
import { APIKey, APIProduct } from "../../types/api-management";
import { getStatusChipStyle } from "../../utils/styles";

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
  useCasePanel: {
    padding: theme.spacing(2),
    backgroundColor: theme.palette.background.default,
  },
  useCaseLabel: {
    fontWeight: 600,
    marginBottom: theme.spacing(1),
    color: theme.palette.text.secondary,
    textTransform: "uppercase",
    fontSize: "0.75rem",
  },
  rejectedBanner: {
    backgroundColor: theme.palette.error.light,
    border: `1px solid ${theme.palette.error.main}`,
    borderRadius: theme.shape.borderRadius,
    padding: theme.spacing(1.5, 2),
    marginBottom: theme.spacing(2),
    display: "flex",
    alignItems: "center",
    gap: theme.spacing(1),
  },
}));

interface ExpandedRowProps {
  request: APIKey;
}

const ExpandedRowContent = ({ request }: ExpandedRowProps) => {
  const classes = useStyles();
  const isRejected = request.status?.phase === "Rejected";
  const apiProductName = request.spec.apiProductRef?.name || "unknown";

  return (
    <Box className={classes.useCasePanel} onClick={(e) => e.stopPropagation()}>
      {isRejected && (
        <Box className={classes.rejectedBanner}>
          <WarningIcon color="error" fontSize="small" />
          <Typography variant="body2">
            This API key was rejected.{" "}
            <Link to={`/catalog/default/api/${apiProductName}/api-keys`}>
              Request a new API key
            </Link>
          </Typography>
        </Box>
      )}
      <Typography className={classes.useCaseLabel}>Use Case</Typography>
      <Typography variant="body2">
        {request.spec.useCase || "No use case provided"}
      </Typography>
    </Box>
  );
};

export const MyApiKeysTable = () => {
  const classes = useStyles();
  const navigate = useNavigate();
  const config = useApi(configApiRef);
  const fetchApi = useApi(fetchApiRef);
  const alertApi = useApi(alertApiRef);
  const backendUrl = config.getString("backend.baseUrl");

  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());
  const [menuAnchor, setMenuAnchor] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const [menuRequest, setMenuRequest] = useState<APIKey | null>(null);
  const [editDialogState, setEditDialogState] = useState<{
    open: boolean;
    request: APIKey | null;
    plans: any[];
  }>({ open: false, request: null, plans: [] });
  const [refresh, setRefresh] = useState(0);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deleteDialogState, setDeleteDialogState] = useState<{
    open: boolean;
    request: APIKey | null;
  }>({ open: false, request: null });
  const [apiKeyValues, setApiKeyValues] = useState<Map<string, string>>(
    new Map(),
  );
  const [apiKeyLoading, setApiKeyLoading] = useState<Set<string>>(new Set());
  const [alreadyReadKeys, setAlreadyReadKeys] = useState<Set<string>>(
    new Set(),
  );
  const [showOnceWarningOpen, setShowOnceWarningOpen] = useState(false);
  const [pendingKeyReveal, setPendingKeyReveal] = useState<{
    namespace: string;
    name: string;
  } | null>(null);
  const [optimisticallyDeleted, setOptimisticallyDeleted] = useState<
    Set<string>
  >(new Set());

  const [filters, setFilters] = useState<FilterState>({
    status: [],
    apiProduct: [],
    tier: [],
  });

  const {
    value: data,
    loading,
    error,
  } = useAsync(async () => {
    const [requestsResponse, productsResponse] = await Promise.all([
      fetchApi.fetch(`${backendUrl}/api/kuadrant/requests/my`),
      fetchApi.fetch(`${backendUrl}/api/kuadrant/apiproducts`),
    ]);

    if (!requestsResponse.ok) {
      throw new Error("failed to fetch requests");
    }

    const requestsData = await requestsResponse.json();
    const requests: APIKey[] = requestsData.items || [];

    let products: APIProduct[] = [];
    if (productsResponse.ok) {
      const productsData = await productsResponse.json();
      products = productsData.items || [];
    }

    // build owner map from products
    const ownerMap = new Map<string, string>();
    products.forEach((p) => {
      const key = `${p.metadata.namespace}/${p.metadata.name}`;
      const owner = p.metadata.annotations?.["backstage.io/owner"] || "unknown";
      ownerMap.set(key, owner);
    });

    return { requests, products, ownerMap };
  }, [backendUrl, fetchApi, refresh]);

  const allRequests = useMemo(() => {
    if (!data?.requests) return [];
    return data.requests.filter(
      (r: APIKey) => !optimisticallyDeleted.has(r.metadata.name),
    );
  }, [data?.requests, optimisticallyDeleted]);

  // filter options from data
  const filterSections: FilterSection[] = useMemo(() => {
    const statusCounts = { Approved: 0, Pending: 0, Rejected: 0 };
    const apiProductCounts = new Map<string, number>();
    const tierCounts = new Map<string, number>();

    allRequests.forEach((r: APIKey) => {
      const status = r.status?.phase || "Pending";
      statusCounts[status as keyof typeof statusCounts]++;

      const apiProduct = r.spec.apiProductRef?.name || "unknown";
      apiProductCounts.set(
        apiProduct,
        (apiProductCounts.get(apiProduct) || 0) + 1,
      );

      const tier = r.spec.planTier || "unknown";
      tierCounts.set(tier, (tierCounts.get(tier) || 0) + 1);
    });

    return [
      {
        id: "status",
        title: "Status",
        options: [
          { value: "Approved", label: "Active", count: statusCounts.Approved },
          { value: "Pending", label: "Pending", count: statusCounts.Pending },
          {
            value: "Rejected",
            label: "Rejected",
            count: statusCounts.Rejected,
          },
        ],
      },
      {
        id: "apiProduct",
        title: "API Product",
        options: Array.from(apiProductCounts.entries()).map(
          ([name, count]) => ({
            value: name,
            label: name,
            count,
          }),
        ),
        collapsed: apiProductCounts.size > 5,
      },
      {
        id: "tier",
        title: "Tier",
        options: Array.from(tierCounts.entries()).map(([tier, count]) => ({
          value: tier,
          label: tier.charAt(0).toUpperCase() + tier.slice(1),
          count,
        })),
      },
    ];
  }, [allRequests]);

  // filtered requests
  const filteredRequests = useMemo(() => {
    return allRequests.filter((r: APIKey) => {
      // status filter
      if (filters.status.length > 0) {
        const status = r.status?.phase || "Pending";
        if (!filters.status.includes(status)) return false;
      }

      // api product filter
      if (filters.apiProduct.length > 0) {
        const apiProduct = r.spec.apiProductRef?.name || "unknown";
        if (!filters.apiProduct.includes(apiProduct)) return false;
      }

      // tier filter
      if (filters.tier.length > 0) {
        const tier = r.spec.planTier || "unknown";
        if (!filters.tier.includes(tier)) return false;
      }

      return true;
    });
  }, [allRequests, filters]);

  const toggleKeyVisibility = (keyName: string) => {
    setVisibleKeys((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(keyName)) {
        newSet.delete(keyName);
      } else {
        newSet.add(keyName);
      }
      return newSet;
    });
  };

  const fetchApiKeyFromSecret = async (
    requestNamespace: string,
    requestName: string,
  ) => {
    const key = `${requestNamespace}/${requestName}`;
    if (apiKeyLoading.has(key)) return;

    setApiKeyLoading((prev) => new Set(prev).add(key));
    try {
      const response = await fetchApi.fetch(
        `${backendUrl}/api/kuadrant/apikeys/${requestNamespace}/${requestName}/secret`,
      );
      if (response.ok) {
        const result = await response.json();
        setApiKeyValues((prev) => new Map(prev).set(key, result.apiKey));
        setAlreadyReadKeys((prev) => new Set(prev).add(key));
      } else if (response.status === 403) {
        setAlreadyReadKeys((prev) => new Set(prev).add(key));
        alertApi.post({
          message:
            "This API key has already been viewed and cannot be retrieved again.",
          severity: "warning",
          display: "transient",
        });
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "unknown error occurred";
      alertApi.post({
        message: `Failed to fetch api key: ${errorMessage}`,
        severity: "error",
        display: "transient",
      });
    } finally {
      setApiKeyLoading((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  const clearApiKeyValue = (requestNamespace: string, requestName: string) => {
    const key = `${requestNamespace}/${requestName}`;
    setApiKeyValues((prev) => {
      const next = new Map(prev);
      next.delete(key);
      return next;
    });
  };

  const handleMenuClose = () => {
    setMenuAnchor(null);
    setMenuRequest(null);
  };

  const handleEdit = async () => {
    if (!menuRequest) return;

    const request = menuRequest;
    handleMenuClose();

    try {
      const apiProductName = request.spec.apiProductRef?.name;
      const apiProductNamespace = request.metadata.namespace;
      const apiProductResponse = await fetchApi.fetch(
        `${backendUrl}/api/kuadrant/apiproducts/${apiProductNamespace}/${apiProductName}`,
      );

      if (apiProductResponse.ok) {
        const apiProduct = await apiProductResponse.json();
        const plans = apiProduct.spec?.plans || [];
        setEditDialogState({ open: true, request, plans });
      } else {
        setEditDialogState({ open: true, request, plans: [] });
      }
    } catch (err) {
      console.error("Error fetching plans:", err);
      setEditDialogState({ open: true, request, plans: [] });
    }
  };

  const handleDeleteClick = () => {
    if (!menuRequest) return;
    const request = menuRequest;
    handleMenuClose();
    setDeleteDialogState({ open: true, request });
  };

  const handleDeleteConfirm = async () => {
    if (!deleteDialogState.request) return;

    const request = deleteDialogState.request;
    const requestName = request.metadata.name;

    setOptimisticallyDeleted((prev) => new Set(prev).add(requestName));
    setDeleting(requestName);

    try {
      const response = await fetchApi.fetch(
        `${backendUrl}/api/kuadrant/requests/${request.metadata.namespace}/${request.metadata.name}`,
        { method: "DELETE" },
      );

      if (!response.ok) {
        throw new Error("Failed to delete request");
      }

      setRefresh((r) => r + 1);
      alertApi.post({
        message: "API key deleted",
        severity: "success",
        display: "transient",
      });
      setDeleteDialogState({ open: false, request: null });
    } catch (err) {
      console.error("Error deleting request:", err);
      setOptimisticallyDeleted((prev) => {
        const next = new Set(prev);
        next.delete(requestName);
        return next;
      });
      alertApi.post({
        message: "Failed to delete API key",
        severity: "error",
        display: "transient",
      });
    } finally {
      setDeleting(null);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteDialogState({ open: false, request: null });
  };

  const columns: TableColumn<APIKey>[] = [
    {
      title: "API Product",
      field: "spec.apiProductRef.name",
      render: (row: APIKey) => {
        const apiProductName = row.spec.apiProductRef?.name || "unknown";
        return (
          <Link to={`/catalog/default/api/${apiProductName}/api-keys`}>
            <strong>{apiProductName}</strong>
          </Link>
        );
      },
    },
    {
      title: "Owner",
      field: "owner",
      render: (row: APIKey) => {
        const key = `${row.metadata.namespace}/${row.spec.apiProductRef?.name}`;
        const owner = data?.ownerMap?.get(key) || "unknown";
        // strip 'user:default/' prefix if present
        const displayOwner = owner.replace(/^user:default\//, "");
        return <Typography variant="body2">{displayOwner}</Typography>;
      },
    },
    {
      title: "Status",
      field: "status.phase",
      render: (row: APIKey) => {
        const phase = row.status?.phase || "Pending";
        const label = phase === "Approved" ? "Active" : phase;
        return (
          <Chip label={label} size="small" style={getStatusChipStyle(phase)} />
        );
      },
    },
    {
      title: "Tier",
      field: "spec.planTier",
      render: (row: APIKey) => (
        <Chip label={row.spec.planTier} size="small" variant="outlined" />
      ),
    },
    {
      title: "API Key",
      field: "status.secretRef",
      filtering: false,
      render: (row: APIKey) => {
        if (row.status?.phase !== "Approved") {
          return (
            <Typography variant="body2" color="textSecondary">
              -
            </Typography>
          );
        }

        const key = `${row.metadata.namespace}/${row.metadata.name}`;
        const hasSecretRef = row.status?.secretRef?.name;
        const isVisible = visibleKeys.has(row.metadata.name);
        const isLoading = apiKeyLoading.has(key);
        const apiKeyValue = apiKeyValues.get(key);
        const canReadSecret = row.status?.canReadSecret !== false;
        const isAlreadyRead = alreadyReadKeys.has(key) || !canReadSecret;

        if (!hasSecretRef) {
          return (
            <Typography variant="body2" color="textSecondary">
              Awaiting secret...
            </Typography>
          );
        }

        if (isAlreadyRead && !apiKeyValue) {
          return (
            <Tooltip title="This API key has already been viewed and cannot be retrieved again">
              <Box display="flex" alignItems="center">
                <Typography
                  variant="body2"
                  color="textSecondary"
                  style={{ fontFamily: "monospace", marginRight: 8 }}
                >
                  Already viewed
                </Typography>
                <VisibilityOffIcon fontSize="small" color="disabled" />
              </Box>
            </Tooltip>
          );
        }

        const handleRevealClick = () => {
          if (isVisible) {
            clearApiKeyValue(row.metadata.namespace, row.metadata.name);
            toggleKeyVisibility(row.metadata.name);
          } else if (!isAlreadyRead) {
            setPendingKeyReveal({
              namespace: row.metadata.namespace,
              name: row.metadata.name,
            });
            setShowOnceWarningOpen(true);
          }
        };

        const handleCopy = async () => {
          if (apiKeyValue) {
            await navigator.clipboard.writeText(apiKeyValue);
            alertApi.post({
              message: "API key copied to clipboard",
              severity: "success",
              display: "transient",
            });
          }
        };

        return (
          <Box display="flex" alignItems="center" style={{ gap: 8 }}>
            <Box fontFamily="monospace" fontSize="0.875rem">
              {isLoading
                ? "Loading..."
                : isVisible && apiKeyValue
                  ? apiKeyValue
                  : "•".repeat(20) + "..."}
            </Box>
            {isVisible && apiKeyValue && (
              <Tooltip title="Copy to clipboard">
                <IconButton size="small" onClick={handleCopy}>
                  <FileCopyIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
            <Tooltip
              title={
                isVisible ? "Hide API key" : "Reveal API key (one-time only)"
              }
            >
              <span>
                <IconButton
                  size="small"
                  onClick={handleRevealClick}
                  disabled={isLoading || (isAlreadyRead && !apiKeyValue)}
                >
                  {isVisible ? (
                    <VisibilityOffIcon fontSize="small" />
                  ) : (
                    <VisibilityIcon fontSize="small" />
                  )}
                </IconButton>
              </span>
            </Tooltip>
          </Box>
        );
      },
    },
    {
      title: "Requested",
      field: "metadata.creationTimestamp",
      render: (row: APIKey) => {
        if (!row.metadata.creationTimestamp) {
          return <Typography variant="body2">-</Typography>;
        }
        const date = new Date(row.metadata.creationTimestamp);
        return (
          <Typography variant="body2">{date.toLocaleDateString()}</Typography>
        );
      },
    },
    {
      title: "Actions",
      filtering: false,
      width: "100px",
      render: (row: APIKey) => {
        const isDeleting = deleting === row.metadata.name;
        if (isDeleting) {
          return <CircularProgress size={20} />;
        }
        return (
          <Box display="flex" style={{ gap: 4 }}>
            <Tooltip title="View details">
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(
                    `/kuadrant/api-keys/${row.metadata.namespace}/${row.metadata.name}`,
                  );
                }}
              >
                <VisibilityIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Delete">
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  setDeleteDialogState({ open: true, request: row });
                }}
              >
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
        );
      },
    },
  ];

  const detailPanelConfig = useMemo(
    () => [
      {
        render: (data: any) => {
          const request = data.rowData as APIKey;
          if (!request?.metadata?.name) {
            return <Box />;
          }
          return <ExpandedRowContent request={request} />;
        },
      },
    ],
    [],
  );

  if (loading) {
    return <Progress />;
  }

  if (error) {
    return <ResponseErrorPanel error={error} />;
  }

  const isPending = (row: APIKey) =>
    !row.status || row.status.phase === "Pending";

  return (
    <>
      <Box className={classes.container}>
        <FilterPanel
          sections={filterSections}
          filters={filters}
          onChange={setFilters}
        />
        <Box className={classes.tableContainer}>
          {filteredRequests.length === 0 ? (
            <Box p={4} textAlign="center">
              <Typography variant="body1" color="textSecondary">
                {allRequests.length === 0
                  ? "No API keys found. Request access to an API to get started."
                  : "No API keys match the selected filters."}
              </Typography>
            </Box>
          ) : (
            <Table
              options={{
                paging: filteredRequests.length > 10,
                pageSize: 20,
                search: true,
                filtering: false,
                debounceInterval: 300,
                toolbar: true,
                emptyRowsWhenPaging: false,
              }}
              columns={columns}
              data={filteredRequests.map((item: APIKey) => ({
                ...item,
                id: item.metadata.name,
              }))}
              detailPanel={detailPanelConfig}
            />
          )}
        </Box>
      </Box>

      <Menu
        id="myapikeys-menu"
        open={Boolean(menuAnchor)}
        onClose={handleMenuClose}
        anchorReference="anchorPosition"
        anchorPosition={menuAnchor || { top: 0, left: 0 }}
      >
        {menuRequest &&
          (() => {
            const items = [];
            items.push(
              <MenuItem
                key="view"
                onClick={() => {
                  navigate(
                    `/kuadrant/api-keys/${menuRequest.metadata.namespace}/${menuRequest.metadata.name}`,
                  );
                  handleMenuClose();
                }}
              >
                View Details
              </MenuItem>,
            );
            if (isPending(menuRequest)) {
              items.push(
                <MenuItem key="edit" onClick={handleEdit}>
                  Edit
                </MenuItem>,
              );
            }
            items.push(
              <MenuItem key="delete" onClick={handleDeleteClick}>
                Delete
              </MenuItem>,
            );
            return items;
          })()}
      </Menu>

      {editDialogState.request && (
        <EditAPIKeyDialog
          open={editDialogState.open}
          request={editDialogState.request}
          availablePlans={editDialogState.plans}
          onClose={() =>
            setEditDialogState({ open: false, request: null, plans: [] })
          }
          onSuccess={() => {
            setEditDialogState({ open: false, request: null, plans: [] });
            setRefresh((r) => r + 1);
          }}
        />
      )}

      <ConfirmDeleteDialog
        open={deleteDialogState.open}
        title="Delete API Key"
        description={`Are you sure you want to delete this API key for ${deleteDialogState.request?.spec.apiProductRef?.name || "this API"}?`}
        deleting={deleting !== null}
        onConfirm={handleDeleteConfirm}
        onCancel={handleDeleteCancel}
      />

      <Dialog
        open={showOnceWarningOpen}
        onClose={() => {
          setShowOnceWarningOpen(false);
          setPendingKeyReveal(null);
        }}
        maxWidth="sm"
      >
        <DialogTitle>
          <Box display="flex" alignItems="center">
            <WarningIcon color="primary" style={{ marginRight: 8 }} />
            View API Key
          </Box>
        </DialogTitle>
        <DialogContent>
          <Typography variant="body1" paragraph>
            This API key can only be viewed <strong>once</strong>. After you
            reveal it, you will not be able to retrieve it again.
          </Typography>
          <Typography variant="body2" color="textSecondary">
            Make sure to copy and store it securely before closing this view.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setShowOnceWarningOpen(false);
              setPendingKeyReveal(null);
            }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            color="primary"
            onClick={() => {
              if (pendingKeyReveal) {
                fetchApiKeyFromSecret(
                  pendingKeyReveal.namespace,
                  pendingKeyReveal.name,
                );
                toggleKeyVisibility(pendingKeyReveal.name);
              }
              setShowOnceWarningOpen(false);
              setPendingKeyReveal(null);
            }}
          >
            Reveal API Key
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};
