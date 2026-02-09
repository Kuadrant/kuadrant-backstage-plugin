import React, { useState } from "react";
import { useEntity } from "@backstage/plugin-catalog-react";
import {
  useApi,
  identityApiRef,
  alertApiRef,
} from "@backstage/core-plugin-api";
import { kuadrantApiRef } from '../../api';
import { useAsync } from "react-use";
import {
  Table,
  TableColumn,
  Progress,
  ResponseErrorPanel,
} from "@backstage/core-components";
import { kuadrantApiKeyApprovePermission } from "../../permissions";
import { useKuadrantPermission } from "../../utils/permissions";
import {
  Box,
  Typography,
  Chip,
  IconButton,
  Tooltip,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  CircularProgress,
  makeStyles,
} from "@material-ui/core";
import CheckCircleIcon from "@material-ui/icons/CheckCircle";
import CancelIcon from "@material-ui/icons/Cancel";
import { APIKey } from "../../types/api-management";
import { getApprovalQueueStatusChipStyle } from "../../utils/styles";

const useStyles = makeStyles((theme) => ({
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
}));

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

interface ApprovalDialogProps {
  open: boolean;
  request: APIKey | null;
  action: "approve" | "reject";
  processing: boolean;
  onClose: () => void;
  onConfirm: (confirmText: string) => void;
}

const ApprovalDialog = ({
  open,
  request,
  action,
  processing,
  onClose,
  onConfirm,
}: ApprovalDialogProps) => {
  const [confirmText, setConfirmText] = useState("");

  const handleClose = () => {
    setConfirmText("");
    onClose();
  };

  const handleConfirm = () => {
    onConfirm(confirmText);
    setConfirmText("");
  };

  const isReject = action === "reject";
  const expectedText = request?.metadata.name || "";
  const isConfirmValid = confirmText === expectedText;

  return (
    <Dialog
      open={open}
      onClose={processing ? undefined : handleClose}
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle>
        {isReject ? "Reject API key" : "Approve API key"}
      </DialogTitle>
      <DialogContent>
        {request && (
          <>
            <Typography variant="body2" paragraph>
              <strong>Requester:</strong> {request.spec.requestedBy.userId}
            </Typography>
            <Typography variant="body2" paragraph>
              <strong>Tier:</strong> {request.spec.planTier}
            </Typography>
            {request.spec.useCase && (
              <Typography variant="body2" paragraph>
                <strong>Use Case:</strong> {request.spec.useCase}
              </Typography>
            )}
            {isReject && (
              <Box mt={2} p={2} bgcolor="error.light" borderRadius={1}>
                <Typography variant="body2">
                  This action will permanently deny access. The user will need
                  to submit a new request.
                </Typography>
              </Box>
            )}
            <Box mt={2}>
              <TextField
                fullWidth
                label={`Type "${expectedText}" to confirm`}
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                disabled={processing}
                autoFocus
              />
            </Box>
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={processing}>
          Cancel
        </Button>
        <Button
          onClick={handleConfirm}
          color={isReject ? "secondary" : "primary"}
          variant="contained"
          disabled={!isConfirmValid || processing}
          startIcon={
            processing ? (
              <CircularProgress size={16} color="inherit" />
            ) : undefined
          }
        >
          {processing
            ? isReject
              ? "Rejecting..."
              : "Approving..."
            : isReject
              ? "Reject"
              : "Approve"}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export const EntityApiApprovalTab = () => {
  const { entity } = useEntity();
  const kuadrantApi = useApi(kuadrantApiRef);
  const identityApi = useApi(identityApiRef);
  const alertApi = useApi(alertApiRef);

  const apiProductName =
    entity.metadata.annotations?.["kuadrant.io/apiproduct"] ||
    entity.metadata.name;
  const namespace =
    entity.metadata.annotations?.["kuadrant.io/namespace"] || "default";

  const [refresh, setRefresh] = useState(0);
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

  const {
    allowed: canApprove,
    loading: permissionLoading,
    error: permissionError,
  } = useKuadrantPermission(kuadrantApiKeyApprovePermission);

  const { value, loading, error } = useAsync(async () => {
    const identity = await identityApi.getBackstageIdentity();
    const reviewedBy = identity.userEntityRef;

    const data = await kuadrantApi.getRequests();
    const allRequests: APIKey[] = data.items || [];

    // filter to this API product only
    const filtered = allRequests.filter(
      (r) =>
        r.spec.apiProductRef?.name === apiProductName &&
        r.metadata.namespace === namespace,
    );

    return { requests: filtered, reviewedBy };
  }, [kuadrantApi, identityApi, apiProductName, namespace, refresh]);

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

    try {
      if (dialogState.action === "approve") {
        await kuadrantApi.approveRequest(dialogState.request.metadata.namespace, dialogState.request.metadata.name);
      } else {
        await kuadrantApi.rejectRequest(dialogState.request.metadata.namespace, dialogState.request.metadata.name);
      }

      setDialogState({
        open: false,
        request: null,
        action: "approve",
        processing: false,
      });
      setRefresh((r) => r + 1);
      alertApi.post({
        message: `API key ${dialogState.action === "approve" ? "approved" : "rejected"}`,
        severity: "success",
        display: "transient",
      });
    } catch (err) {
      console.error(`Error ${dialogState.action}ing request:`, err);
      setDialogState((prev) => ({ ...prev, processing: false }));
      const errorMessage = err instanceof Error ? err.message : "unknown error occurred";
      alertApi.post({
        message: `Failed to ${dialogState.action} APIKey. ${errorMessage}`,
        severity: 'error',
        display: 'transient',
      });
    }
  };

  if (loading || permissionLoading) {
    return <Progress />;
  }

  if (error) {
    return <ResponseErrorPanel error={error} />;
  }

  if (permissionError) {
    return (
      <Box p={2}>
        <Typography color="error">
          Unable to check permissions: {permissionError.message}
        </Typography>
      </Box>
    );
  }

  if (!canApprove) {
    return (
      <Box p={3} textAlign="center">
        <Typography variant="body1" color="textSecondary">
          You don't have permission to view the approval queue for this API.
        </Typography>
      </Box>
    );
  }

  const requests = value?.requests || [];
  const pendingRequests = requests.filter(
    (r) => !r.status?.phase || r.status.phase === "Pending",
  );
  const approvedRequests = requests.filter(
    (r) => r.status?.phase === "Approved",
  );
  const rejectedRequests = requests.filter(
    (r) => r.status?.phase === "Rejected",
  );

  const columns: TableColumn<APIKey>[] = [
    {
      title: "Requester",
      field: "spec.requestedBy.userId",
      render: (row) => (
        <Typography variant="body2">{row.spec.requestedBy.userId}</Typography>
      ),
    },
    {
      title: "Status",
      field: "status.phase",
      render: (row) => {
        const phase = row.status?.phase || "Pending";
        const label = phase === "Approved" ? "Active" : phase;
        return (
          <Chip label={label} size="small" style={getApprovalQueueStatusChipStyle(phase)} />
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
      render: (row) => {
        if (!row.metadata.creationTimestamp)
          return <Typography variant="body2">-</Typography>;
        return (
          <Typography variant="body2">
            {new Date(row.metadata.creationTimestamp).toLocaleDateString()}
          </Typography>
        );
      },
    },
    {
      title: "Actions",
      filtering: false,
      render: (row) => {
        const phase = row.status?.phase || "Pending";
        if (phase !== "Pending") return null;
        return (
          <Box display="flex" style={{ gap: 4 }}>
            <Tooltip title="Approve">
              <IconButton size="small" onClick={() => handleApprove(row)}>
                <CheckCircleIcon color="primary" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Reject">
              <IconButton size="small" onClick={() => handleReject(row)}>
                <CancelIcon color="error" />
              </IconButton>
            </Tooltip>
          </Box>
        );
      },
    },
  ];

  const detailPanelConfig = [
    {
      render: (data: any) => {
        const request = data.rowData as APIKey;
        if (!request?.metadata?.name) return <Box />;
        return <ExpandedRowContent request={request} />;
      },
    },
  ];

  return (
    <Box p={2}>
      <Box mb={2}>
        <Typography variant="body2" color="textSecondary">
          {pendingRequests.length} pending, {approvedRequests.length} approved,{" "}
          {rejectedRequests.length} rejected
        </Typography>
      </Box>

      {requests.length === 0 ? (
        <Box p={3} textAlign="center">
          <Typography variant="body1" color="textSecondary">
            No API keys for this API.
          </Typography>
        </Box>
      ) : (
        <Table
          options={{
            paging: requests.length > 10,
            pageSize: 20,
            search: true,
            filtering: false,
            debounceInterval: 300,
            toolbar: true,
            emptyRowsWhenPaging: false,
          }}
          columns={columns}
          data={requests.map((item) => ({ ...item, id: item.metadata.name }))}
          detailPanel={detailPanelConfig}
        />
      )}

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
    </Box>
  );
};
