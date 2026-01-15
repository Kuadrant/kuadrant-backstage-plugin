import React, { useState } from "react";
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
  InfoCard,
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
  Tabs,
  Tab,
  Tooltip,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  CircularProgress,
} from "@material-ui/core";
import CheckCircleIcon from "@material-ui/icons/CheckCircle";
import CancelIcon from "@material-ui/icons/Cancel";
import ExpandMoreIcon from "@material-ui/icons/ExpandMore";
import { APIKey } from "../../types/api-management";

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
  const actionLabel = action === "approve" ? "Approve" : "Reject";
  const processingLabel =
    action === "approve" ? "Approving..." : "Rejecting...";

  return (
    <Dialog
      open={open}
      onClose={processing ? undefined : onClose}
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle>{actionLabel} API Key</DialogTitle>
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

export const ApprovalQueueCard = () => {
  const config = useApi(configApiRef);
  const fetchApi = useApi(fetchApiRef);
  const identityApi = useApi(identityApiRef);
  const alertApi = useApi(alertApiRef);
  const backendUrl = config.getString("backend.baseUrl");
  const [refresh, setRefresh] = useState(0);
  const [selectedTab, setSelectedTab] = useState(0);
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

    console.log(
      "ApprovalQueueCard: fetching all requests from",
      `${backendUrl}/api/kuadrant/requests`,
    );

    // fetch requests and api products in parallel
    const [requestsResponse, apiProductsResponse] = await Promise.all([
      fetchApi.fetch(`${backendUrl}/api/kuadrant/requests`),
      fetchApi.fetch(`${backendUrl}/api/kuadrant/apiproducts`),
    ]);

    if (!requestsResponse.ok) {
      console.log(
        "ApprovalQueueCard: failed to fetch requests, status:",
        requestsResponse.status,
      );
      return {
        pending: [] as APIKey[],
        approved: [] as APIKey[],
        rejected: [] as APIKey[],
        reviewedBy,
        ownedApiProducts: new Set<string>(),
      };
    }

    // check content-type before parsing json
    const contentType = requestsResponse.headers.get("content-type");
    if (!contentType?.includes("application/json")) {
      console.error("ApprovalQueueCard: received non-json response");
      alertApi.post({
        message:
          "Unexpected content-type from the server response. Please contact support.",
        display: "transient",
        severity: "warning",
      });
      return {
        pending: [] as APIKey[],
        approved: [] as APIKey[],
        rejected: [] as APIKey[],
        reviewedBy,
        ownedApiProducts: new Set<string>(),
      };
    }

    const data = await requestsResponse.json();
    const allRequests = data.items || [];

    // build set of api products owned by current user
    const ownedApiProducts = new Set<string>();
    if (apiProductsResponse.ok) {
      const apiProductsData = await apiProductsResponse.json();
      for (const product of apiProductsData.items || []) {
        const owner = product.metadata?.annotations?.["backstage.io/owner"];
        if (owner === reviewedBy) {
          // key is namespace/name to match against request's namespace/apiProductRef.name
          ownedApiProducts.add(
            `${product.metadata.namespace}/${product.metadata.name}`,
          );
        }
      }
    }

    console.log(
      "ApprovalQueueCard: received",
      allRequests.length,
      "total requests",
    );
    console.log(
      "ApprovalQueueCard: user owns",
      ownedApiProducts.size,
      "api products",
    );

    // group by status (field is 'phase' not 'status')
    const pending = allRequests.filter((r: APIKey) => {
      const phase = (r.status as any)?.phase || "Pending";
      return phase === "Pending";
    });
    const approved = allRequests.filter((r: APIKey) => {
      const phase = (r.status as any)?.phase;
      return phase === "Approved";
    });
    const rejected = allRequests.filter((r: APIKey) => {
      const phase = (r.status as any)?.phase;
      return phase === "Rejected";
    });

    console.log("ApprovalQueueCard: grouped -", {
      pending: pending.length,
      approved: approved.length,
      rejected: rejected.length,
    });

    return { pending, approved, rejected, reviewedBy, ownedApiProducts };
  }, [backendUrl, fetchApi, identityApi, refresh]);

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
        body: JSON.stringify({
          reviewedBy: value.reviewedBy,
        }),
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
        <Typography variant="body2" color="textSecondary">
          Permission: kuadrant.apikey.update.all
        </Typography>
        <Typography variant="body2" color="textSecondary">
          Please try again or contact your administrator
        </Typography>
      </Box>
    );
  }

  const pending = value?.pending || [];
  const approved = value?.approved || [];
  const rejected = value?.rejected || [];

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-GB", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const pendingColumns: TableColumn<APIKey>[] = [
    {
      title: "Name",
      field: "metadata.name",
      render: (row) => (
        <Typography variant="body2">{row.metadata.name}</Typography>
      ),
    },
    {
      title: "User",
      field: "spec.requestedBy.userId",
      render: (row) => (
        <Typography variant="body2">{row.spec.requestedBy.userId}</Typography>
      ),
    },
    {
      title: "API",
      field: "spec.apiProductRef.name",
      render: (row) => (
        <Typography variant="body2">
          <strong>{row.spec.apiProductRef?.name || "unknown"}</strong>
        </Typography>
      ),
    },
    {
      title: "Namespace",
      field: "metadata.namespace",
      render: (row) => (
        <Typography variant="body2">{row.metadata.namespace}</Typography>
      ),
    },
    {
      title: "Tier",
      field: "spec.planTier",
      render: (row) => <Chip label={row.spec.planTier} size="small" />,
    },
    {
      title: "Use Case",
      field: "spec.useCase",
      render: (row) => {
        if (!row.spec.useCase) {
          return <Typography variant="body2">-</Typography>;
        }
        return (
          <Tooltip title={row.spec.useCase} placement="top">
            <Typography
              variant="body2"
              style={{
                maxWidth: "200px",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {row.spec.useCase}
            </Typography>
          </Tooltip>
        );
      },
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
      title: "Actions",
      filtering: false,
      render: (row) => {
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

  const approvedColumns: TableColumn<APIKey>[] = [
    {
      title: "Name",
      field: "metadata.name",
      render: (row) => (
        <Typography variant="body2">{row.metadata.name}</Typography>
      ),
    },
    {
      title: "User",
      field: "spec.requestedBy.userId",
      render: (row) => (
        <Typography variant="body2">{row.spec.requestedBy.userId}</Typography>
      ),
    },
    {
      title: "API",
      field: "spec.apiProductRef.name",
      render: (row) => (
        <Typography variant="body2">
          <strong>{row.spec.apiProductRef?.name || "unknown"}</strong>
        </Typography>
      ),
    },
    {
      title: "Namespace",
      field: "metadata.namespace",
      render: (row) => (
        <Typography variant="body2">{row.metadata.namespace}</Typography>
      ),
    },
    {
      title: "Tier",
      field: "spec.planTier",
      render: (row) => <Chip label={row.spec.planTier} size="small" />,
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
      title: "Approved",
      field: "status.reviewedAt",
      render: (row) => (
        <Typography variant="body2">
          {row.status?.reviewedAt ? formatDate(row.status.reviewedAt) : "-"}
        </Typography>
      ),
    },
    {
      title: "Reviewed By",
      field: "status.reviewedBy",
      render: (row) => (
        <Typography variant="body2">{row.status?.reviewedBy || "-"}</Typography>
      ),
    },
    {
      title: "Approval Type",
      field: "status.reviewedBy",
      render: (row) => {
        const isAutomatic = row.status?.reviewedBy === "system";
        return (
          <Chip
            label={isAutomatic ? "Automatic" : "Manual"}
            size="small"
            color={isAutomatic ? "default" : "primary"}
          />
        );
      },
    },
  ];

  const rejectedColumns: TableColumn<APIKey>[] = [
    {
      title: "Name",
      field: "metadata.name",
      render: (row) => (
        <Typography variant="body2">{row.metadata.name}</Typography>
      ),
    },
    {
      title: "User",
      field: "spec.requestedBy.userId",
      render: (row) => (
        <Typography variant="body2">{row.spec.requestedBy.userId}</Typography>
      ),
    },
    {
      title: "API",
      field: "spec.apiProductRef.name",
      render: (row) => (
        <Typography variant="body2">
          <strong>{row.spec.apiProductRef?.name || "unknown"}</strong>
        </Typography>
      ),
    },
    {
      title: "Namespace",
      field: "metadata.namespace",
      render: (row) => (
        <Typography variant="body2">{row.metadata.namespace}</Typography>
      ),
    },
    {
      title: "Tier",
      field: "spec.planTier",
      render: (row) => <Chip label={row.spec.planTier} size="small" />,
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
      title: "Rejected",
      field: "status.reviewedAt",
      render: (row) => (
        <Typography variant="body2">
          {row.status?.reviewedAt ? formatDate(row.status.reviewedAt) : "-"}
        </Typography>
      ),
    },
    {
      title: "Reviewed By",
      field: "status.reviewedBy",
      render: (row) => (
        <Typography variant="body2">{row.status?.reviewedBy || "-"}</Typography>
      ),
    },
  ];

  const getTabData = () => {
    const addIds = (data: APIKey[]) =>
      data.map((item) => ({ ...item, id: item.metadata.name }));

    switch (selectedTab) {
      case 0:
        // pending tab - add tableData.checked to control checkbox state
        const pendingWithSelection = pending.map((row: APIKey) => {
          const isSelected = selectedRequests.some(
            (selected) =>
              selected.metadata.name === row.metadata.name &&
              selected.metadata.namespace === row.metadata.namespace,
          );
          return {
            ...row,
            tableData: { checked: isSelected },
          };
        });
        return {
          data: pendingWithSelection,
          columns: pendingColumns,
          showSelection: true,
        };
      case 1:
        return {
          data: addIds(approved),
          columns: approvedColumns,
          showSelection: false,
        };
      case 2:
        return {
          data: addIds(rejected),
          columns: rejectedColumns,
          showSelection: false,
        };
      default:
        return {
          data: addIds(pending),
          columns: pendingColumns,
          showSelection: true,
        };
    }
  };

  const tabData = getTabData();

  // group requests by api product (namespace/name)
  const groupByApiProduct = (requests: APIKey[]) => {
    const grouped = new Map<string, APIKey[]>();
    requests.forEach((request) => {
      const key = `${request.metadata.namespace}/${request.spec.apiProductRef?.name || "unknown"}`;
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(request);
    });
    return grouped;
  };

  const groupedData = groupByApiProduct(tabData.data);
  const apiProductKeys = Array.from(groupedData.keys()).sort();

  return (
    <>
      <InfoCard
        title="API Access Requests"
        subheader={`${pending.length} pending, ${approved.length} approved, ${rejected.length} rejected`}
      >
        <Box mb={2} data-testid="approval-queue-card">
          <Tabs
            value={selectedTab}
            onChange={(_, newValue) => {
              setSelectedTab(newValue);
              setSelectedRequests([]);
            }}
            indicatorColor="primary"
            textColor="primary"
            data-testid="approval-queue-tabs"
          >
            <Tab
              label={`Pending (${pending.length})`}
              data-testid="approval-queue-pending-tab"
            />
            <Tab
              label={`Approved (${approved.length})`}
              data-testid="approval-queue-approved-tab"
            />
            <Tab
              label={`Rejected (${rejected.length})`}
              data-testid="approval-queue-rejected-tab"
            />
          </Tabs>
        </Box>

        {selectedTab === 0 && selectedRequests.length > 0 && (
          <Box
            mb={2}
            display="flex"
            alignItems="center"
            justifyContent="space-between"
            p={2}
            bgcolor="background.default"
          >
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

        {tabData.data.length === 0 ? (
          <Box p={3} textAlign="center">
            <Typography variant="body1" color="textSecondary">
              {selectedTab === 0 && "No pending requests."}
              {selectedTab === 1 && "No approved requests."}
              {selectedTab === 2 && "No rejected requests."}
            </Typography>
          </Box>
        ) : (
          <Box>
            {apiProductKeys.map((apiProductKey) => {
              const requests = groupedData.get(apiProductKey) || [];
              const displayName =
                requests[0]?.spec.apiProductRef?.name || apiProductKey;
              const ownsThisApiProduct =
                value?.ownedApiProducts?.has(apiProductKey) ?? false;
              const canSelectRows =
                canUpdateAllRequests ||
                (canUpdateOwnRequests && ownsThisApiProduct);
              return (
                <Accordion
                  key={apiProductKey}
                  defaultExpanded={apiProductKeys.length === 1}
                >
                  <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Box
                      display="flex"
                      alignItems="center"
                      justifyContent="space-between"
                      width="100%"
                    >
                      <Typography variant="h6">{displayName}</Typography>
                      <Chip
                        label={`${requests.length} request${requests.length !== 1 ? "s" : ""}`}
                        size="small"
                        color="primary"
                        style={{ marginRight: 16 }}
                      />
                    </Box>
                  </AccordionSummary>
                  <AccordionDetails>
                    <Box width="100%">
                      <Table
                        options={{
                          selection: canSelectRows && tabData.showSelection,
                          paging: requests.length > 5,
                          pageSize: 20,
                          search: true,
                          filtering: true,
                          debounceInterval: 300,
                          showTextRowsSelected: false,
                          toolbar: true,
                          emptyRowsWhenPaging: false,
                        }}
                        data={requests}
                        columns={tabData.columns}
                        onSelectionChange={(rows) => {
                          // merge selections from this api product with selections from other products
                          const otherSelections = selectedRequests.filter(
                            (r) =>
                              `${r.metadata.namespace}/${r.spec.apiProductRef?.name || "unknown"}` !==
                              apiProductKey,
                          );
                          setSelectedRequests([
                            ...otherSelections,
                            ...(rows as APIKey[]),
                          ]);
                        }}
                      />
                    </Box>
                  </AccordionDetails>
                </Accordion>
              );
            })}
          </Box>
        )}
      </InfoCard>
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
