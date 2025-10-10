import { useState } from 'react';
import { useApi, fetchApiRef, identityApiRef } from '@backstage/core-plugin-api';
import { useAsync } from 'react-use';
import {
  Table,
  TableColumn,
  Progress,
  ResponseErrorPanel,
} from '@backstage/core-components';
import {
  Card,
  CardContent,
  CardHeader,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Chip,
} from '@material-ui/core';
import CheckCircleIcon from '@material-ui/icons/CheckCircle';
import CancelIcon from '@material-ui/icons/Cancel';

interface ApiKeyRequest {
  metadata: {
    name: string;
    creationTimestamp: string;
  };
  data: {
    userId: string;
    userEmail: string;
    apiName: string;
    apiNamespace: string;
    planTier: string;
    useCase: string;
    requestedAt: string;
  };
}

interface ApprovalDialogProps {
  open: boolean;
  request: ApiKeyRequest | null;
  action: 'approve' | 'reject';
  onClose: () => void;
  onConfirm: (comment: string) => void;
}

const ApprovalDialog = ({ open, request, action, onClose, onConfirm }: ApprovalDialogProps) => {
  const [comment, setComment] = useState('');

  const handleConfirm = () => {
    onConfirm(comment);
    setComment('');
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        {action === 'approve' ? 'Approve' : 'Reject'} API Key Request
      </DialogTitle>
      <DialogContent>
        {request && (
          <>
            <p><strong>User:</strong> {request.data.userId}</p>
            <p><strong>API:</strong> {request.data.apiName}</p>
            <p><strong>Plan:</strong> {request.data.planTier}</p>
            <p><strong>Use Case:</strong> {request.data.useCase}</p>
            <TextField
              label="Comment (optional)"
              multiline
              rows={3}
              fullWidth
              margin="normal"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          onClick={handleConfirm}
          color={action === 'approve' ? 'primary' : 'secondary'}
          variant="contained"
        >
          {action === 'approve' ? 'Approve' : 'Reject'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export const ApprovalQueueCard = () => {
  const fetchApi = useApi(fetchApiRef);
  const identityApi = useApi(identityApiRef);
  const [refresh, setRefresh] = useState(0);
  const [dialogState, setDialogState] = useState<{
    open: boolean;
    request: ApiKeyRequest | null;
    action: 'approve' | 'reject';
  }>({
    open: false,
    request: null,
    action: 'approve',
  });

  const { value, loading, error } = useAsync(async () => {
    const identity = await identityApi.getBackstageIdentity();
    const reviewedBy = identity.userEntityRef;

    const response = await fetchApi.fetch(
      '/api/kuadrant/requests?status=pending'
    );
    if (!response.ok) {
      throw new Error('failed to fetch pending requests');
    }
    const data = await response.json();
    return { requests: data.items || [], reviewedBy };
  }, [refresh]);

  const handleApprove = (request: ApiKeyRequest) => {
    setDialogState({ open: true, request, action: 'approve' });
  };

  const handleReject = (request: ApiKeyRequest) => {
    setDialogState({ open: true, request, action: 'reject' });
  };

  const handleConfirm = async (comment: string) => {
    if (!dialogState.request || !value) return;

    const endpoint = dialogState.action === 'approve'
      ? `/api/kuadrant/requests/${dialogState.request.metadata.name}/approve`
      : `/api/kuadrant/requests/${dialogState.request.metadata.name}/reject`;

    try {
      const response = await fetchApi.fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          comment,
          reviewedBy: value.reviewedBy,
        }),
      });

      if (!response.ok) {
        throw new Error(`failed to ${dialogState.action} request`);
      }

      setDialogState({ open: false, request: null, action: 'approve' });
      setRefresh(r => r + 1);
    } catch (err) {
      console.error(`error ${dialogState.action}ing request:`, err);
    }
  };

  if (loading) {
    return <Progress />;
  }

  if (error) {
    return <ResponseErrorPanel error={error} />;
  }

  const requests = value?.requests || [];

  const columns: TableColumn<ApiKeyRequest>[] = [
    {
      title: 'User',
      field: 'data.userId',
      render: (row) => row.data.userId,
    },
    {
      title: 'API',
      field: 'data.apiName',
      render: (row) => row.data.apiName,
    },
    {
      title: 'Namespace',
      field: 'data.apiNamespace',
      render: (row) => row.data.apiNamespace,
    },
    {
      title: 'Plan',
      field: 'data.planTier',
      render: (row) => (
        <Chip
          label={row.data.planTier}
          size="small"
          color={
            row.data.planTier === 'gold' ? 'primary' :
            row.data.planTier === 'silver' ? 'default' : 'secondary'
          }
        />
      ),
    },
    {
      title: 'Use Case',
      field: 'data.useCase',
      render: (row) => row.data.useCase,
    },
    {
      title: 'Requested',
      field: 'data.requestedAt',
      render: (row) => new Date(row.data.requestedAt).toLocaleString(),
    },
    {
      title: 'Actions',
      render: (row) => (
        <>
          <Button
            size="small"
            startIcon={<CheckCircleIcon />}
            onClick={() => handleApprove(row)}
            style={{ marginRight: 8 }}
          >
            Approve
          </Button>
          <Button
            size="small"
            startIcon={<CancelIcon />}
            onClick={() => handleReject(row)}
          >
            Reject
          </Button>
        </>
      ),
    },
  ];

  return (
    <>
      <Card>
        <CardHeader title="Pending API Key Requests" />
        <CardContent>
          {requests.length === 0 ? (
            <p>no pending requests</p>
          ) : (
            <Table
              options={{ paging: true, pageSize: 10, search: false }}
              data={requests}
              columns={columns}
            />
          )}
        </CardContent>
      </Card>
      <ApprovalDialog
        open={dialogState.open}
        request={dialogState.request}
        action={dialogState.action}
        onClose={() => setDialogState({ open: false, request: null, action: 'approve' })}
        onConfirm={handleConfirm}
      />
    </>
  );
};
