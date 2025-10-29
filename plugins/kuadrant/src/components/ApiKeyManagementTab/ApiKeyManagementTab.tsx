import { useState } from 'react';
import { useAsync } from 'react-use';
import {
  Table,
  TableColumn,
  Progress,
  ResponseErrorPanel,
} from '@backstage/core-components';
import {
  IconButton,
  Typography,
  Box,
  Chip,
  Grid,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
} from '@material-ui/core';
import { useApi, configApiRef, identityApiRef, fetchApiRef } from '@backstage/core-plugin-api';
import { useEntity } from '@backstage/plugin-catalog-react';
import VisibilityIcon from '@material-ui/icons/Visibility';
import VisibilityOffIcon from '@material-ui/icons/VisibilityOff';
import DeleteIcon from '@material-ui/icons/Delete';
import HourglassEmptyIcon from '@material-ui/icons/HourglassEmpty';
import CancelIcon from '@material-ui/icons/Cancel';
import AddIcon from '@material-ui/icons/Add';
import { APIKeyRequest } from '../../types/api-management';

interface Secret {
  metadata: {
    name: string;
    namespace: string;
    creationTimestamp: string;
    annotations?: {
      'secret.kuadrant.io/plan-id'?: string;
      'secret.kuadrant.io/user-id'?: string;
    };
    labels?: {
      app?: string;
    };
  };
  data?: {
    api_key?: string;
  };
}

interface APIProduct {
  metadata: {
    name: string;
    namespace: string;
  };
  spec: {
    plans?: Array<{
      tier: string;
      description?: string;
      limits?: any;
    }>;
  };
}

interface Plan {
  tier: string;
  limits: any;
}

export interface ApiKeyManagementTabProps {
  namespace?: string;
}

export const ApiKeyManagementTab = ({ namespace: propNamespace }: ApiKeyManagementTabProps) => {
  const { entity } = useEntity();
  const config = useApi(configApiRef);
  const identityApi = useApi(identityApiRef);
  const fetchApi = useApi(fetchApiRef);
  const backendUrl = config.getString('backend.baseUrl');
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());
  const [refresh, setRefresh] = useState(0);
  const [userId, setUserId] = useState<string>('guest');
  const [userEmail, setUserEmail] = useState<string>('');
  const [open, setOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState('');
  const [useCase, setUseCase] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const httproute = entity.metadata.annotations?.['kuadrant.io/httproute'] || entity.metadata.name;
  const namespace = entity.metadata.annotations?.['kuadrant.io/namespace'] || propNamespace || 'default';
  const apiName = httproute;

  useAsync(async () => {
    const identity = await identityApi.getBackstageIdentity();
    const profile = await identityApi.getProfileInfo();
    setUserId(identity.userEntityRef.split('/')[1] || 'guest');
    setUserEmail(profile.email || '');
  }, [identityApi]);

  const { value: apiKeys, loading: keysLoading, error: keysError } = useAsync(async () => {
    if (!userId) return [];
    const response = await fetchApi.fetch(
      `${backendUrl}/api/kuadrant/apikeys?namespace=${namespace}&userId=${userId}`
    );
    if (!response.ok) {
      throw new Error('failed to fetch api keys');
    }
    const data = await response.json();
    return data.items || [];
  }, [namespace, userId, refresh, fetchApi]);

  const { value: requests, loading: requestsLoading, error: requestsError } = useAsync(async () => {
    if (!userId) return [];
    const response = await fetchApi.fetch(
      `${backendUrl}/api/kuadrant/requests/my?userId=${userId}&namespace=${namespace}`
    );
    if (!response.ok) {
      throw new Error('failed to fetch requests');
    }
    const data = await response.json();
    return (data.items || []).filter(
      (r: APIKeyRequest) => r.spec.apiName === apiName && r.spec.apiNamespace === namespace
    );
  }, [userId, apiName, namespace, refresh, fetchApi]);

  const { value: apiProduct, loading: plansLoading, error: plansError } = useAsync(async () => {
    const response = await fetchApi.fetch(`${backendUrl}/api/kuadrant/apiproducts`);
    if (!response.ok) {
      throw new Error('failed to fetch api products');
    }
    const data = await response.json();

    const product = data.items?.find((p: APIProduct) =>
      p.metadata.namespace === namespace &&
      (p.metadata.name === apiName || p.metadata.name === `${apiName}-api`)
    );

    return product;
  }, [namespace, apiName, fetchApi]);

  const handleDelete = async (name: string) => {
    try {
      const response = await fetchApi.fetch(
        `${backendUrl}/api/kuadrant/apikeys/${namespace}/${name}`,
        { method: 'DELETE' }
      );
      if (!response.ok) {
        throw new Error('failed to delete api key');
      }
      setRefresh(r => r + 1);
    } catch (err) {
      console.error('error deleting api key:', err);
    }
  };

  const handleDeleteRequest = async (name: string) => {
    try {
      const response = await fetchApi.fetch(
        `${backendUrl}/api/kuadrant/requests/${namespace}/${name}`,
        { method: 'DELETE' }
      );
      if (!response.ok) {
        throw new Error('failed to delete request');
      }
      setRefresh(r => r + 1);
    } catch (err) {
      console.error('error deleting request:', err);
    }
  };

  const toggleVisibility = (keyName: string) => {
    setVisibleKeys(prev => {
      const newSet = new Set(prev);
      if (newSet.has(keyName)) {
        newSet.delete(keyName);
      } else {
        newSet.add(keyName);
      }
      return newSet;
    });
  };

  const handleRequestAccess = async () => {
    if (!selectedPlan) return;

    setCreating(true);
    setCreateError(null);
    try {
      const response = await fetchApi.fetch(`${backendUrl}/api/kuadrant/requests`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          apiName,
          apiNamespace: namespace,
          userId,
          userEmail,
          planTier: selectedPlan,
          useCase: useCase.trim() || '',
          namespace,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `failed to create request: ${response.status}`);
      }

      setOpen(false);
      setSelectedPlan('');
      setUseCase('');
      setRefresh(r => r + 1);
    } catch (err) {
      console.error('error creating api key request:', err);
      setCreateError(err instanceof Error ? err.message : 'unknown error occurred');
    } finally {
      setCreating(false);
    }
  };

  const loading = keysLoading || requestsLoading || plansLoading;
  const error = keysError || requestsError || plansError;

  if (loading) {
    return <Progress />;
  }

  if (error) {
    return <ResponseErrorPanel error={error} />;
  }

  const secrets = (apiKeys || []) as Secret[];
  const myRequests = (requests || []) as APIKeyRequest[];
  const plans = (apiProduct?.spec?.plans || []) as Plan[];

  const pendingRequests = myRequests.filter(r => !r.status?.phase || r.status.phase === 'Pending');
  const approvedRequests = myRequests.filter(r => r.status?.phase === 'Approved');
  const rejectedRequests = myRequests.filter(r => r.status?.phase === 'Rejected');

  const columns: TableColumn<Secret>[] = [
    {
      title: 'Name',
      field: 'metadata.name',
      render: (row: Secret) => (
        <Typography variant="body2">{row.metadata.name}</Typography>
      ),
    },
    {
      title: 'API',
      field: 'metadata.labels.app',
      render: (row: Secret) => (
        <Typography variant="body2">{row.metadata.labels?.app || 'N/A'}</Typography>
      ),
    },
    {
      title: 'Plan Tier',
      field: 'planTier',
      render: (row: Secret) => (
        <Chip
          label={row.metadata.annotations?.['secret.kuadrant.io/plan-id'] || 'Unknown'}
          color="primary"
          size="small"
        />
      ),
      customFilterAndSearch: (filter: string, row: Secret) => {
        const planTier = row.metadata.annotations?.['secret.kuadrant.io/plan-id'] || 'Unknown';
        return planTier.toLowerCase().includes(filter.toLowerCase());
      },
    },
    {
      title: 'Created',
      field: 'metadata.creationTimestamp',
      render: (row: Secret) => (
        <Typography variant="body2">
          {new Date(row.metadata.creationTimestamp).toLocaleDateString()}
        </Typography>
      ),
    },
    {
      title: 'API Key',
      field: 'data.api_key',
      searchable: false,
      render: (row: Secret) => {
        const isVisible = visibleKeys.has(row.metadata.name);
        const apiKey = row.data?.api_key
          ? atob(row.data.api_key)
          : 'N/A';

        return (
          <Box display="flex" alignItems="center">
            <Typography
              variant="body2"
              style={{
                fontFamily: 'monospace',
                marginRight: 8,
              }}
            >
              {isVisible ? apiKey : '••••••••••••••••'}
            </Typography>
            <IconButton
              size="small"
              onClick={() => toggleVisibility(row.metadata.name)}
            >
              {isVisible ? <VisibilityOffIcon /> : <VisibilityIcon />}
            </IconButton>
          </Box>
        );
      },
    },
    {
      title: 'Actions',
      field: 'actions',
      searchable: false,
      render: (row: Secret) => (
        <IconButton
          size="small"
          onClick={() => handleDelete(row.metadata.name)}
          color="secondary"
        >
          <DeleteIcon />
        </IconButton>
      ),
    },
  ];

  const approvedColumns: TableColumn<APIKeyRequest>[] = [
    {
      title: 'Plan Tier',
      field: 'spec.planTier',
      render: (row: APIKeyRequest) => (
        <Chip label={row.spec.planTier} color="primary" size="small" />
      ),
    },
    {
      title: 'Approved',
      field: 'status.reviewedAt',
      render: (row: APIKeyRequest) => (
        <Typography variant="body2">
          {row.status?.reviewedAt ? new Date(row.status.reviewedAt).toLocaleDateString() : '-'}
        </Typography>
      ),
    },
    {
      title: 'API Key',
      field: 'status.apiKey',
      searchable: false,
      render: (row: APIKeyRequest) => {
        const isVisible = visibleKeys.has(row.metadata.name);
        const apiKey = row.status?.apiKey || 'N/A';

        return (
          <Box display="flex" alignItems="center">
            <Typography
              variant="body2"
              style={{
                fontFamily: 'monospace',
                marginRight: 8,
              }}
            >
              {isVisible ? apiKey : '••••••••••••••••'}
            </Typography>
            <IconButton
              size="small"
              onClick={() => toggleVisibility(row.metadata.name)}
            >
              {isVisible ? <VisibilityOffIcon /> : <VisibilityIcon />}
            </IconButton>
          </Box>
        );
      },
    },
  ];

  const requestColumns: TableColumn<APIKeyRequest>[] = [
    {
      title: 'Status',
      field: 'status.phase',
      render: (row: APIKeyRequest) => {
        const phase = row.status?.phase || 'Pending';
        const isPending = phase === 'Pending';
        return (
          <Chip
            label={phase}
            size="small"
            icon={isPending ? <HourglassEmptyIcon /> : <CancelIcon />}
            color={isPending ? 'default' : 'secondary'}
          />
        );
      },
    },
    {
      title: 'Plan Tier',
      field: 'spec.planTier',
      render: (row: APIKeyRequest) => (
        <Chip label={row.spec.planTier} color="primary" size="small" />
      ),
    },
    {
      title: 'Use Case',
      field: 'spec.useCase',
      render: (row: APIKeyRequest) => (
        <Typography variant="body2">{row.spec.useCase || '-'}</Typography>
      ),
    },
    {
      title: 'Requested',
      field: 'spec.requestedAt',
      render: (row: APIKeyRequest) => (
        <Typography variant="body2">
          {row.spec.requestedAt ? new Date(row.spec.requestedAt).toLocaleDateString() : '-'}
        </Typography>
      ),
    },
    {
      title: 'Reviewed',
      field: 'status.reviewedAt',
      render: (row: APIKeyRequest) => {
        if (!row.status?.reviewedAt) return <Typography variant="body2">-</Typography>;
        return (
          <Typography variant="body2">
            {new Date(row.status.reviewedAt).toLocaleDateString()}
          </Typography>
        );
      },
    },
    {
      title: 'Reason',
      field: 'status.reason',
      render: (row: APIKeyRequest) => (
        <Typography variant="body2">{row.status?.reason || '-'}</Typography>
      ),
    },
    {
      title: 'Actions',
      field: 'actions',
      searchable: false,
      render: (row: APIKeyRequest) => {
        const isPending = !row.status?.phase || row.status.phase === 'Pending';
        if (!isPending) return null;
        return (
          <IconButton
            size="small"
            onClick={() => handleDeleteRequest(row.metadata.name)}
            color="secondary"
          >
            <DeleteIcon />
          </IconButton>
        );
      },
    },
  ];

  return (
    <Box p={2}>
      <Grid container spacing={3} direction="column">
        <Grid item>
          <Box display="flex" justifyContent="flex-end" mb={2}>
            <Button
              variant="contained"
              color="primary"
              startIcon={<AddIcon />}
              onClick={() => setOpen(true)}
              disabled={plans.length === 0}
            >
              Request API Access
            </Button>
          </Box>
        </Grid>
        {pendingRequests.length > 0 && (
          <Grid item>
            <Table
              title="Pending Requests"
              options={{
                paging: false,
                search: false,
              }}
              columns={requestColumns}
              data={pendingRequests}
            />
          </Grid>
        )}
        {rejectedRequests.length > 0 && (
          <Grid item>
            <Table
              title="Rejected Requests"
              options={{
                paging: false,
                search: false,
              }}
              columns={requestColumns}
              data={rejectedRequests}
            />
          </Grid>
        )}
        {approvedRequests.length > 0 && (
          <Grid item>
            <Table
              title="Approved Requests"
              options={{
                paging: false,
                search: false,
              }}
              columns={approvedColumns}
              data={approvedRequests}
            />
          </Grid>
        )}
        <Grid item>
          <Table
            title="API Keys (from Secrets)"
            options={{
              paging: true,
              search: true,
              pageSize: 10,
            }}
            columns={columns}
            data={secrets}
            emptyContent={
              <Box p={4}>
                <Typography align="center">
                  No API keys found
                </Typography>
              </Box>
            }
          />
        </Grid>
      </Grid>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Request API Access</DialogTitle>
        <DialogContent>
          {createError && (
            <Box mb={2} p={2} bgcolor="error.main" color="error.contrastText" borderRadius={1}>
              <Typography variant="body2">{createError}</Typography>
            </Box>
          )}
          <FormControl fullWidth margin="normal">
            <InputLabel>Select Plan Tier</InputLabel>
            <Select
              value={selectedPlan}
              onChange={(e) => setSelectedPlan(e.target.value as string)}
            >
              {plans.map((plan: Plan) => {
                const limitDesc = Object.entries(plan.limits || {})
                  .map(([key, val]) => `${val} per ${key}`)
                  .join(', ');
                return (
                  <MenuItem key={plan.tier} value={plan.tier}>
                    {plan.tier} {limitDesc ? `(${limitDesc})` : ''}
                  </MenuItem>
                );
              })}
            </Select>
          </FormControl>
          <TextField
            label="Use Case (optional)"
            placeholder="Describe how you plan to use this API"
            multiline
            rows={3}
            fullWidth
            margin="normal"
            value={useCase}
            onChange={(e) => setUseCase(e.target.value)}
            helperText="Explain your intended use of this API for admin review"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            onClick={handleRequestAccess}
            color="primary"
            disabled={!selectedPlan || creating}
          >
            {creating ? 'Submitting...' : 'Submit Request'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
