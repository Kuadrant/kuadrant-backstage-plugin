import React, { useState } from 'react';
import { useApi, fetchApiRef, identityApiRef, configApiRef } from '@backstage/core-plugin-api';
import { useAsync } from 'react-use';
import {
  Table,
  TableColumn,
  Progress,
  ResponseErrorPanel,
  InfoCard,
} from '@backstage/core-components';
import {
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Chip,
  Typography,
  Box,
} from '@material-ui/core';
import CheckCircleIcon from '@material-ui/icons/CheckCircle';
import CancelIcon from '@material-ui/icons/Cancel';
import { APIKeyRequest } from '../../types/api-management';

interface ApprovalDialogProps {
  open: boolean;
  request: APIKeyRequest | null;
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
            <p><strong>User:</strong> {request.spec.requestedBy.userId}</p>
            <p><strong>API:</strong> {request.spec.apiName}</p>
            <p><strong>Plan:</strong> {request.spec.planTier}</p>
            <p><strong>Use Case:</strong> {request.spec.useCase || '-'}</p>
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
  const config = useApi(configApiRef);
  const fetchApi = useApi(fetchApiRef);
  const identityApi = useApi(identityApiRef);
  const backendUrl = config.getString('backend.baseUrl');
  const [refresh, setRefresh] = useState(0);
  const [dialogState, setDialogState] = useState<{
    open: boolean;
    request: APIKeyRequest | null;
    action: 'approve' | 'reject';
  }>({
    open: false,
    request: null,
    action: 'approve',
  });

  const { value, loading, error } = useAsync(async () => {
    const identity = await identityApi.getBackstageIdentity();
    const reviewedBy = identity.userEntityRef;

    console.log('ApprovalQueueCard: fetching all requests from', `${backendUrl}/api/kuadrant/requests`);

    const response = await fetchApi.fetch(
      `${backendUrl}/api/kuadrant/requests`
    );
    if (!response.ok) {
      console.log('ApprovalQueueCard: failed to fetch requests, status:', response.status);
      return { pending: [], approved: [], rejected: [], reviewedBy };
    }

    // check content-type before parsing json
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      console.log('ApprovalQueueCard: received non-json response');
      return { pending: [], approved: [], rejected: [], reviewedBy };
    }

    const data = await response.json();
    const allRequests = data.items || [];

    console.log('ApprovalQueueCard: received', allRequests.length, 'total requests');
    console.log('ApprovalQueueCard: raw requests:', allRequests);

    // group by status (field is 'phase' not 'status')
    const pending = allRequests.filter((r: APIKeyRequest) => {
      const phase = (r.status as any)?.phase || 'Pending';
      return phase === 'Pending';
    });
    const approved = allRequests.filter((r: APIKeyRequest) => {
      const phase = (r.status as any)?.phase;
      return phase === 'Approved';
    });
    const rejected = allRequests.filter((r: APIKeyRequest) => {
      const phase = (r.status as any)?.phase;
      return phase === 'Rejected';
    });

    console.log('ApprovalQueueCard: grouped -', {
      pending: pending.length,
      approved: approved.length,
      rejected: rejected.length,
    });

    return { pending, approved, rejected, reviewedBy };
  }, [backendUrl, fetchApi, identityApi, refresh]);

  const handleApprove = (request: APIKeyRequest) => {
    setDialogState({ open: true, request, action: 'approve' });
  };

  const handleReject = (request: APIKeyRequest) => {
    setDialogState({ open: true, request, action: 'reject' });
  };

  const handleConfirm = async (comment: string) => {
    if (!dialogState.request || !value) return;

    const endpoint = dialogState.action === 'approve'
      ? `${backendUrl}/api/kuadrant/requests/${dialogState.request.metadata.namespace}/${dialogState.request.metadata.name}/approve`
      : `${backendUrl}/api/kuadrant/requests/${dialogState.request.metadata.namespace}/${dialogState.request.metadata.name}/reject`;

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

  const pending = value?.pending || [];
  const approved = value?.approved || [];
  const rejected = value?.rejected || [];

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-GB', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const pendingColumns: TableColumn<APIKeyRequest>[] = [
    {
      title: 'Request Name',
      field: 'metadata.name',
      render: (row) => <Typography variant="body2">{row.metadata.name}</Typography>,
    },
    {
      title: 'User',
      field: 'spec.requestedBy.userId',
      render: (row) => <Typography variant="body2">{row.spec.requestedBy.userId}</Typography>,
    },
    {
      title: 'API',
      field: 'spec.apiName',
      render: (row) => <Typography variant="body2"><strong>{row.spec.apiName}</strong></Typography>,
    },
    {
      title: 'Namespace',
      field: 'spec.apiNamespace',
      render: (row) => <Typography variant="body2">{row.spec.apiNamespace}</Typography>,
    },
    {
      title: 'Plan',
      field: 'spec.planTier',
      render: (row) => (
        <Chip
          label={row.spec.planTier}
          size="small"
        />
      ),
    },
    {
      title: 'Use Case',
      field: 'spec.useCase',
      render: (row) => (
        <Typography variant="body2" style={{ maxWidth: 200 }} noWrap title={row.spec.useCase}>
          {row.spec.useCase || '-'}
        </Typography>
      ),
    },
    {
      title: 'Requested',
      field: 'spec.requestedAt',
      render: (row) => (
        <Typography variant="body2">
          {row.spec.requestedAt ? formatDate(row.spec.requestedAt) : '-'}
        </Typography>
      ),
    },
    {
      title: 'Actions',
      render: (row) => (
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
      ),
    },
  ];

  const approvedColumns: TableColumn<APIKeyRequest>[] = [
    {
      title: 'Request Name',
      field: 'metadata.name',
      render: (row) => <Typography variant="body2">{row.metadata.name}</Typography>,
    },
    {
      title: 'User',
      field: 'spec.requestedBy.userId',
      render: (row) => <Typography variant="body2">{row.spec.requestedBy.userId}</Typography>,
    },
    {
      title: 'API',
      field: 'spec.apiName',
      render: (row) => <Typography variant="body2"><strong>{row.spec.apiName}</strong></Typography>,
    },
    {
      title: 'Namespace',
      field: 'spec.apiNamespace',
      render: (row) => <Typography variant="body2">{row.spec.apiNamespace}</Typography>,
    },
    {
      title: 'Plan',
      field: 'spec.planTier',
      render: (row) => (
        <Chip
          label={row.spec.planTier}
          size="small"
        />
      ),
    },
    {
      title: 'Requested',
      field: 'spec.requestedAt',
      render: (row) => (
        <Typography variant="body2">
          {row.spec.requestedAt ? formatDate(row.spec.requestedAt) : '-'}
        </Typography>
      ),
    },
    {
      title: 'Approved',
      field: 'status.reviewedAt',
      render: (row) => (
        <Typography variant="body2">
          {row.status?.reviewedAt ? formatDate(row.status.reviewedAt) : '-'}
        </Typography>
      ),
    },
    {
      title: 'Reviewed By',
      field: 'status.reviewedBy',
      render: (row) => (
        <Typography variant="body2">
          {row.status?.reviewedBy || '-'}
        </Typography>
      ),
    },
    {
      title: 'Approval Type',
      field: 'status.reviewedBy',
      render: (row) => {
        const isAutomatic = row.status?.reviewedBy === 'system';
        return (
          <Chip
            label={isAutomatic ? 'Automatic' : 'Manual'}
            size="small"
            color={isAutomatic ? 'default' : 'primary'}
          />
        );
      },
    },
  ];

  const rejectedColumns: TableColumn<APIKeyRequest>[] = [
    {
      title: 'Request Name',
      field: 'metadata.name',
      render: (row) => <Typography variant="body2">{row.metadata.name}</Typography>,
    },
    {
      title: 'User',
      field: 'spec.requestedBy.userId',
      render: (row) => <Typography variant="body2">{row.spec.requestedBy.userId}</Typography>,
    },
    {
      title: 'API',
      field: 'spec.apiName',
      render: (row) => <Typography variant="body2"><strong>{row.spec.apiName}</strong></Typography>,
    },
    {
      title: 'Namespace',
      field: 'spec.apiNamespace',
      render: (row) => <Typography variant="body2">{row.spec.apiNamespace}</Typography>,
    },
    {
      title: 'Plan',
      field: 'spec.planTier',
      render: (row) => (
        <Chip
          label={row.spec.planTier}
          size="small"
        />
      ),
    },
    {
      title: 'Requested',
      field: 'spec.requestedAt',
      render: (row) => (
        <Typography variant="body2">
          {row.spec.requestedAt ? formatDate(row.spec.requestedAt) : '-'}
        </Typography>
      ),
    },
    {
      title: 'Rejected',
      field: 'status.reviewedAt',
      render: (row) => (
        <Typography variant="body2">
          {row.status?.reviewedAt ? formatDate(row.status.reviewedAt) : '-'}
        </Typography>
      ),
    },
    {
      title: 'Reviewed By',
      field: 'status.reviewedBy',
      render: (row) => (
        <Typography variant="body2">
          {row.status?.reviewedBy || '-'}
        </Typography>
      ),
    },
    {
      title: 'Reason',
      field: 'status.comment',
      render: (row) => (
        <Typography variant="body2" style={{ maxWidth: 200 }} noWrap title={row.status?.comment}>
          {row.status?.comment || '-'}
        </Typography>
      ),
    },
  ];

  return (
    <>
      <Box>
        <InfoCard title={`Pending Requests (${pending.length})`}>
          {pending.length === 0 ? (
            <Typography variant="body2" color="textSecondary">No pending requests</Typography>
          ) : (
            <Table
              options={{ paging: true, pageSize: 5, search: false, toolbar: false }}
              data={pending}
              columns={pendingColumns}
            />
          )}
        </InfoCard>

        {approved.length > 0 && (
          <Box mt={3}>
            <InfoCard title={`Approved Requests (${approved.length})`}>
              <Table
                options={{ paging: true, pageSize: 5, search: false, toolbar: false }}
                data={approved}
                columns={approvedColumns}
              />
            </InfoCard>
          </Box>
        )}

        {rejected.length > 0 && (
          <Box mt={3}>
            <InfoCard title={`Rejected Requests (${rejected.length})`}>
              <Table
                options={{ paging: true, pageSize: 5, search: false, toolbar: false }}
                data={rejected}
                columns={rejectedColumns}
              />
            </InfoCard>
          </Box>
        )}
      </Box>
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
