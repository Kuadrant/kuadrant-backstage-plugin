import React, { useState, useMemo } from "react";
import {
  useApi,
  fetchApiRef,
  identityApiRef,
  configApiRef,
  alertApiRef,
} from "@backstage/core-plugin-api";
import { useAsync } from "react-use";
import {
  Table,
  TableColumn,
  Progress,
  ResponseErrorPanel,
  Link,
} from "@backstage/core-components";
import {
  kuadrantApiKeyUpdateAllPermission,
  kuadrantApiKeyUpdateOwnPermission,
} from "../../permissions";
import { useKuadrantPermission } from "../../utils/permissions";
import {
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Chip,
  Typography,
  Box,
  CircularProgress,
  TextField,
  makeStyles,
} from "@material-ui/core";
import CheckCircleIcon from "@material-ui/icons/CheckCircle";
import CancelIcon from "@material-ui/icons/Cancel";
import { FilterPanel, FilterSection, FilterState } from "../FilterPanel";
import { APIKey } from "../../types/api-management";
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
  bulkActions: {
    padding: theme.spacing(2),
    backgroundColor: theme.palette.background.default,
    borderBottom: `1px solid ${theme.palette.divider}`,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
}));

interface ApprovalDialogProps {
  open: boolean;
  request: APIKey | null;
  action: "approve" | "reject";
  processing: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

const ApprovalDialog = ({
  open,
  request,
  action,
  processing,
  onClose,
  onConfirm,
}: ApprovalDialogProps) => {
  const [confirmInput, setConfirmInput] = React.useState("");
  const actionLabel = action === "approve" ? "Approve" : "Reject";
  const processingLabel =
    action === "approve" ? "Approving..." : "Rejecting...";

  const isReject = action === "reject";
  const confirmText = request?.spec.requestedBy?.userId || "";
  const canConfirm = isReject ? confirmInput === confirmText : true;

  // reset input when dialog closes
  React.useEffect(() => {
    if (!open) {
      setConfirmInput("");
    }
  }, [open]);

  return (
    <Dialog
      open={open}
      onClose={processing ? undefined : onClose}
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle>
        {isReject ? (
          <Box display="flex" alignItems="center" style={{ gap: 8 }}>
            <CancelIcon color="error" />
            <span>{actionLabel} API Key</span>
          </Box>
        ) : (
          <span>{actionLabel} API Key</span>
        )}
      </DialogTitle>
      <DialogContent>
        {request && (
          <>
            <p>
              <strong>User:</strong> {request.spec.requestedBy.userId}
            </p>
            <p>
              <strong>API:</strong>{" "}
              {request.spec.apiProductRef?.name || "unknown"}
            </p>
            <p>
              <strong>Tier:</strong> {request.spec.planTier}
            </p>
            <Box mb={2}>
              <Typography
                variant="body2"
                component="span"
                style={{ fontWeight: "bold" }}
              >
                Use Case:
              </Typography>{" "}
              <Typography
                variant="body2"
                component="span"
                style={{ whiteSpace: "pre-wrap" }}
              >
                {request.spec.useCase || "-"}
              </Typography>
            </Box>
            {isReject && (
              <Box mt={2}>
                <Typography variant="body2" color="textSecondary" gutterBottom>
                  Type <strong>{confirmText}</strong> to confirm rejection:
                </Typography>
                <TextField
                  fullWidth
                  variant="outlined"
                  size="small"
                  value={confirmInput}
                  onChange={(e) => setConfirmInput(e.target.value)}
                  disabled={processing}
                  autoFocus
                  placeholder={confirmText}
                />
              </Box>
            )}
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={processing}>
          Cancel
        </Button>
        <Button
          onClick={onConfirm}
          color={action === "approve" ? "primary" : "secondary"}
          variant="contained"
          disabled={processing || !canConfirm}
          startIcon={
            processing ? (
              <CircularProgress size={16} color="inherit" />
            ) : undefined
          }
        >
          {processing ? processingLabel : actionLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

interface BulkActionDialogProps {
  open: boolean;
  requests: APIKey[];
  action: "approve" | "reject";
  processing: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

const BulkActionDialog = ({
  open,
  requests,
  action,
  processing,
  onClose,
  onConfirm,
}: BulkActionDialogProps) => {
  const isApprove = action === "approve";
  const actionLabel = isApprove ? "Approve All" : "Reject All";
  const processingLabel = isApprove ? "Approving..." : "Rejecting...";

  return (
    <Dialog
      open={open}
      onClose={processing ? undefined : onClose}
      maxWidth="md"
      fullWidth
    >
      <DialogTitle>
        {isApprove ? "Approve" : "Reject"} {requests.length} API Keys
      </DialogTitle>
      <DialogContent>
        <Typography variant="body2" paragraph>
          You are about to {isApprove ? "approve" : "reject"} the following API
          keys:
        </Typography>
        <Box mb={2} maxHeight={200} overflow="auto">
          {requests.map((request) => (
            <Box
              key={`${request.metadata.namespace}/${request.metadata.name}`}
              mb={1}
              p={1}
              bgcolor="background.default"
            >
              <Typography variant="body2">
                <strong>{request.spec.requestedBy.userId}</strong> -{" "}
                {request.spec.apiProductRef?.name || "unknown"} (
                {request.spec.planTier})
              </Typography>
            </Box>
          ))}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={processing}>
          Cancel
        </Button>
        <Button
          onClick={onConfirm}
          color={isApprove ? "primary" : "secondary"}
          variant="contained"
          disabled={processing}
          startIcon={
            processing ? (
              <CircularProgress size={16} color="inherit" />
            ) : undefined
          }
        >
          {processing ? processingLabel : actionLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

interface ExpandedRowProps {
  request: APIKey;
}

const ExpandedRowContent = ({ request }: ExpandedRowProps) => {
  const classes = useStyles();

  return (
    <Box className={classes.useCasePanel} onClick={(e) => e.stopPropagation()}>
      <Typography className={classes.useCaseLabel}>Use Case</Typography>
      <Typography variant="body2">
        {request.spec.useCase || "No use case provided"}
      </Typography>
    </Box>
  );
};

export const ApprovalQueueTable = () => {
  const classes = useStyles();
  const config = useApi(configApiRef);
  const fetchApi = useApi(fetchApiRef);
  const identityApi = useApi(identityApiRef);
  const alertApi = useApi(alertApiRef);
  const backendUrl = config.getString("backend.baseUrl");
  const [refresh, setRefresh] = useState(0);
  const [selectedRequests, setSelectedRequests] = useState<APIKey[]>([]);
  const [dialogState, setDialogState] = useState<{
    open: boolean;
    request: APIKey | null;
    action: "approve" | "reject";
    processing: boolean;
  }>({
    open: false,
    request: null,
    action: "approve",
    processing: false,
  });
  const [bulkDialogState, setBulkDialogState] = useState<{
    open: boolean;
    requests: APIKey[];
    action: "approve" | "reject";
    processing: boolean;
  }>({
    open: false,
    requests: [],
    action: "approve",
    processing: false,
  });
  const [filters, setFilters] = useState<FilterState>({
    status: [],
    apiProduct: [],
    tier: [],
  });

  const {
    allowed: canUpdateAllRequests,
    loading: updateAllPermissionLoading,
    error: updateAllPermissionError,
  } = useKuadrantPermission(kuadrantApiKeyUpdateAllPermission);

  const {
    allowed: canUpdateOwnRequests,
    loading: updateOwnPermissionLoading,
    error: updateOwnPermissionError,
  } = useKuadrantPermission(kuadrantApiKeyUpdateOwnPermission);

  const updatePermissionLoading =
    updateAllPermissionLoading || updateOwnPermissionLoading;
  const updatePermissionError =
    updateAllPermissionError || updateOwnPermissionError;

  const { value, loading, error } = useAsync(async () => {
    const identity = await identityApi.getBackstageIdentity();
    const reviewedBy = identity.userEntityRef;

    const [requestsResponse, apiProductsResponse] = await Promise.all([
      fetchApi.fetch(`${backendUrl}/api/kuadrant/requests`),
      fetchApi.fetch(`${backendUrl}/api/kuadrant/apiproducts`),
    ]);

    if (!requestsResponse.ok) {
      return {
        allRequests: [] as APIKey[],
        reviewedBy,
        ownedApiProducts: new Set<string>(),
      };
    }

    const contentType = requestsResponse.headers.get("content-type");
    if (!contentType?.includes("application/json")) {
      alertApi.post({
        message: "Unexpected content-type from the server response.",
        display: "transient",
        severity: "warning",
      });
      return {
        allRequests: [] as APIKey[],
        reviewedBy,
        ownedApiProducts: new Set<string>(),
      };
    }

    const data = await requestsResponse.json();
    const allRequests = data.items || [];

    const ownedApiProducts = new Set<string>();
    if (apiProductsResponse.ok) {
      const apiProductsData = await apiProductsResponse.json();
      for (const product of apiProductsData.items || []) {
        const owner = product.metadata?.annotations?.["backstage.io/owner"];
        if (owner === reviewedBy) {
          ownedApiProducts.add(
            `${product.metadata.namespace}/${product.metadata.name}`,
          );
        }
      }
    }

    return { allRequests, reviewedBy, ownedApiProducts };
  }, [backendUrl, fetchApi, identityApi, refresh]);

  const filterSections: FilterSection[] = useMemo(() => {
    if (!value?.allRequests) return [];

    const statusCounts = { Approved: 0, Pending: 0, Rejected: 0 };
    const apiProductCounts = new Map<string, number>();
    const tierCounts = new Map<string, number>();

    value.allRequests.forEach((r: APIKey) => {
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
          { value: "Pending", label: "Pending", count: statusCounts.Pending },
          {
            value: "Approved",
            label: "Approved",
            count: statusCounts.Approved,
          },
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
  }, [value?.allRequests]);

  const filteredRequests = useMemo(() => {
    if (!value?.allRequests) return [];

    return value.allRequests.filter((r: APIKey) => {
      if (filters.status.length > 0) {
        const status = r.status?.phase || "Pending";
        if (!filters.status.includes(status)) return false;
      }
      if (filters.apiProduct.length > 0) {
        const apiProduct = r.spec.apiProductRef?.name || "unknown";
        if (!filters.apiProduct.includes(apiProduct)) return false;
      }
      if (filters.tier.length > 0) {
        const tier = r.spec.planTier || "unknown";
        if (!filters.tier.includes(tier)) return false;
      }
      return true;
    });
  }, [value?.allRequests, filters]);

  const handleApprove = (request: APIKey) => {
    setDialogState({
      open: true,
      request,
      action: "approve",
      processing: false,
    });
  };

  const handleReject = (request: APIKey) => {
    setDialogState({
      open: true,
      request,
      action: "reject",
      processing: false,
    });
  };

  const handleConfirm = async () => {
    if (!dialogState.request || !value) return;

    setDialogState((prev) => ({ ...prev, processing: true }));

    const endpoint =
      dialogState.action === "approve"
        ? `${backendUrl}/api/kuadrant/requests/${dialogState.request.metadata.namespace}/${dialogState.request.metadata.name}/approve`
        : `${backendUrl}/api/kuadrant/requests/${dialogState.request.metadata.namespace}/${dialogState.request.metadata.name}/reject`;

    try {
      const response = await fetchApi.fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewedBy: value.reviewedBy }),
      });

      if (!response.ok) {
        throw new Error(`failed to ${dialogState.action} request`);
      }

      setDialogState({
        open: false,
        request: null,
        action: "approve",
        processing: false,
      });
      // remove the processed request from selection
      setSelectedRequests((prev) =>
        prev.filter(
          (r) =>
            r.metadata.name !== dialogState.request?.metadata.name ||
            r.metadata.namespace !== dialogState.request?.metadata.namespace,
        ),
      );
      setRefresh((r) => r + 1);
      const action = dialogState.action === "approve" ? "approved" : "rejected";
      alertApi.post({
        message: `API key ${action}`,
        severity: "success",
        display: "transient",
      });
    } catch (err) {
      console.error(`error ${dialogState.action}ing request:`, err);
      setDialogState((prev) => ({ ...prev, processing: false }));
      alertApi.post({
        message: `Failed to ${dialogState.action} API key`,
        severity: "error",
        display: "transient",
      });
    }
  };

  const handleBulkApprove = () => {
    if (selectedRequests.length === 0) return;
    setBulkDialogState({
      open: true,
      requests: selectedRequests,
      action: "approve",
      processing: false,
    });
  };

  const handleBulkReject = () => {
    if (selectedRequests.length === 0) return;
    setBulkDialogState({
      open: true,
      requests: selectedRequests,
      action: "reject",
      processing: false,
    });
  };

  const handleBulkConfirm = async () => {
    if (!value || bulkDialogState.requests.length === 0) return;

    setBulkDialogState((prev) => ({ ...prev, processing: true }));

    const isApprove = bulkDialogState.action === "approve";
    const endpoint = isApprove
      ? `${backendUrl}/api/kuadrant/requests/bulk-approve`
      : `${backendUrl}/api/kuadrant/requests/bulk-reject`;

    try {
      const response = await fetchApi.fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requests: bulkDialogState.requests.map((r) => ({
            namespace: r.metadata.namespace,
            name: r.metadata.name,
          })),
          reviewedBy: value.reviewedBy,
        }),
      });

      if (!response.ok) {
        throw new Error(`failed to bulk ${bulkDialogState.action} requests`);
      }

      const count = bulkDialogState.requests.length;
      const action = isApprove ? "approved" : "rejected";
      setBulkDialogState({
        open: false,
        requests: [],
        action: "approve",
        processing: false,
      });
      setSelectedRequests([]);
      setRefresh((r) => r + 1);
      alertApi.post({
        message: `${count} API keys ${action}`,
        severity: "success",
        display: "transient",
      });
    } catch (err) {
      console.error(`error bulk ${bulkDialogState.action}ing requests:`, err);
      setBulkDialogState((prev) => ({ ...prev, processing: false }));
      alertApi.post({
        message: `Failed to bulk ${bulkDialogState.action} API keys`,
        severity: "error",
        display: "transient",
      });
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-GB", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const columns: TableColumn<APIKey>[] = [
    {
      title: "Requester",
      field: "spec.requestedBy.userId",
      render: (row) => (
        <Typography variant="body2">{row.spec.requestedBy.userId}</Typography>
      ),
    },
    {
      title: "API Product",
      field: "spec.apiProductRef.name",
      render: (row) => {
        const name = row.spec.apiProductRef?.name || "unknown";
        return (
          <Link to={`/catalog/default/api/${name}`}>
            <strong>{name}</strong>
          </Link>
        );
      },
    },
    {
      title: "Status",
      field: "status.phase",
      render: (row) => {
        const phase = row.status?.phase || "Pending";
        return (
          <Chip label={phase} size="small" style={getStatusChipStyle(phase)} />
        );
      },
    },
    {
      title: "Tier",
      field: "spec.planTier",
      render: (row) => (
        <Chip label={row.spec.planTier} size="small" variant="outlined" />
      ),
    },
    {
      title: "Requested",
      field: "metadata.creationTimestamp",
      render: (row) => (
        <Typography variant="body2">
          {row.metadata.creationTimestamp
            ? formatDate(row.metadata.creationTimestamp)
            : "-"}
        </Typography>
      ),
    },
    {
      title: "Reviewed By",
      field: "status.reviewedBy",
      render: (row) => {
        if (!row.status?.reviewedBy)
          return (
            <Typography variant="body2" color="textSecondary">
              -
            </Typography>
          );
        const reviewer = row.status.reviewedBy.replace(/^user:default\//, "");
        const isAutomatic = reviewer === "system";
        return (
          <Box>
            <Typography variant="body2">
              {isAutomatic ? "Automatic" : reviewer}
            </Typography>
            {row.status.reviewedAt && (
              <Typography variant="caption" color="textSecondary">
                {formatDate(row.status.reviewedAt)}
              </Typography>
            )}
          </Box>
        );
      },
    },
    {
      title: "Actions",
      filtering: false,
      render: (row) => {
        const phase = row.status?.phase || "Pending";
        if (phase !== "Pending") return null;

        const apiProductKey = `${row.metadata.namespace}/${row.spec.apiProductRef?.name || "unknown"}`;
        const ownsApiProduct =
          value?.ownedApiProducts?.has(apiProductKey) ?? false;
        const canUpdate =
          canUpdateAllRequests || (canUpdateOwnRequests && ownsApiProduct);
        if (!canUpdate) return null;

        return (
          <Box display="flex" style={{ gap: 8 }}>
            <Button
              size="small"
              startIcon={<CheckCircleIcon />}
              onClick={() => handleApprove(row)}
              color="primary"
              variant="outlined"
            >
              Approve
            </Button>
            <Button
              size="small"
              startIcon={<CancelIcon />}
              onClick={() => handleReject(row)}
              color="secondary"
              variant="outlined"
            >
              Reject
            </Button>
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

  if (loading || updatePermissionLoading) {
    return <Progress />;
  }

  if (error) {
    return <ResponseErrorPanel error={error} />;
  }

  if (updatePermissionError) {
    return (
      <Box p={2}>
        <Typography color="error">
          Unable to check permissions: {updatePermissionError.message}
        </Typography>
      </Box>
    );
  }

  const canSelectRows = canUpdateAllRequests || canUpdateOwnRequests;

  return (
    <>
      <Box className={classes.container}>
        <FilterPanel
          sections={filterSections}
          filters={filters}
          onChange={setFilters}
        />
        <Box className={classes.tableContainer}>
          {selectedRequests.length > 0 && (
            <Box className={classes.bulkActions}>
              <Typography variant="body2">
                {selectedRequests.length} request
                {selectedRequests.length !== 1 ? "s" : ""} selected
              </Typography>
              <Box display="flex" style={{ gap: 8 }}>
                <Button
                  size="small"
                  variant="contained"
                  color="primary"
                  startIcon={<CheckCircleIcon />}
                  onClick={handleBulkApprove}
                >
                  Approve Selected
                </Button>
                <Button
                  size="small"
                  variant="contained"
                  color="secondary"
                  startIcon={<CancelIcon />}
                  onClick={handleBulkReject}
                >
                  Reject Selected
                </Button>
              </Box>
            </Box>
          )}

          {filteredRequests.length === 0 ? (
            <Box p={4} textAlign="center">
              <Typography variant="body1" color="textSecondary">
                {value?.allRequests?.length === 0
                  ? "No API keys found."
                  : "No API keys match the selected filters."}
              </Typography>
            </Box>
          ) : (
            <Table
              options={{
                selection: canSelectRows,
                showSelectAllCheckbox: filteredRequests.some(
                  (r: APIKey) =>
                    !r.status?.phase || r.status.phase === "Pending",
                ),
                selectionProps: (row: APIKey) => ({
                  disabled:
                    row.status?.phase !== "Pending" &&
                    row.status?.phase !== undefined,
                }),
                paging: filteredRequests.length > 10,
                pageSize: 20,
                search: true,
                filtering: false,
                debounceInterval: 300,
                showTextRowsSelected: false,
                toolbar: true,
                emptyRowsWhenPaging: false,
              }}
              columns={columns}
              data={filteredRequests.map((item: APIKey) => {
                const isSelected = selectedRequests.some(
                  (selected) =>
                    selected.metadata.name === item.metadata.name &&
                    selected.metadata.namespace === item.metadata.namespace,
                );
                return {
                  ...item,
                  id: item.metadata.name,
                  tableData: { checked: isSelected },
                };
              })}
              onSelectionChange={(rows) => {
                // only allow selecting pending requests
                const pendingOnly = (rows as APIKey[]).filter(
                  (r) => !r.status?.phase || r.status.phase === "Pending",
                );
                setSelectedRequests(pendingOnly);
              }}
              detailPanel={detailPanelConfig}
            />
          )}
        </Box>
      </Box>

      <ApprovalDialog
        open={dialogState.open}
        request={dialogState.request}
        action={dialogState.action}
        processing={dialogState.processing}
        onClose={() =>
          setDialogState({
            open: false,
            request: null,
            action: "approve",
            processing: false,
          })
        }
        onConfirm={handleConfirm}
      />
      <BulkActionDialog
        open={bulkDialogState.open}
        requests={bulkDialogState.requests}
        action={bulkDialogState.action}
        processing={bulkDialogState.processing}
        onClose={() =>
          setBulkDialogState({
            open: false,
            requests: [],
            action: "approve",
            processing: false,
          })
        }
        onConfirm={handleBulkConfirm}
      />
    </>
  );
};
