import React, { useState, useMemo } from 'react';
import { useAsync } from 'react-use';
import {
  Table,
  TableColumn,
  Progress,
  ResponseErrorPanel,
  CodeSnippet,
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
  Tabs,
  Tab,
  Menu,
} from '@material-ui/core';
import { useApi, configApiRef, identityApiRef, fetchApiRef } from '@backstage/core-plugin-api';
import { useEntity } from '@backstage/plugin-catalog-react';
import VisibilityIcon from '@material-ui/icons/Visibility';
import VisibilityOffIcon from '@material-ui/icons/VisibilityOff';
import HourglassEmptyIcon from '@material-ui/icons/HourglassEmpty';
import CancelIcon from '@material-ui/icons/Cancel';
import AddIcon from '@material-ui/icons/Add';
import MoreVertIcon from '@material-ui/icons/MoreVert';
import { APIKeyRequest } from '../../types/api-management';
import {
  kuadrantApiKeyRequestCreatePermission,
  kuadrantApiKeyDeleteOwnPermission,
  kuadrantApiKeyDeleteAllPermission,
  kuadrantApiKeyRequestUpdateOwnPermission,
} from '../../permissions';
import { useKuadrantPermission, canDeleteResource } from '../../utils/permissions';
import { EditAPIKeyRequestDialog } from '../EditAPIKeyRequestDialog';

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
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [requestToEdit, setRequestToEdit] = useState<APIKeyRequest | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<{ top: number; left: number } | null>(null);
  const [menuRequest, setMenuRequest] = useState<APIKeyRequest | null>(null);

  // get apiproduct name from entity annotation (set by entity provider)
  const apiProductName = entity.metadata.annotations?.['kuadrant.io/apiproduct'] || entity.metadata.name;
  const namespace = entity.metadata.annotations?.['kuadrant.io/namespace'] || propNamespace || 'default';

  useAsync(async () => {
    const identity = await identityApi.getBackstageIdentity();
    const profile = await identityApi.getProfileInfo();
    setUserId(identity.userEntityRef.split('/')[1] || 'guest');
    setUserEmail(profile.email || '');
  }, [identityApi]);

  const { value: requests, loading: requestsLoading, error: requestsError } = useAsync(async () => {
    const response = await fetchApi.fetch(
      `${backendUrl}/api/kuadrant/requests/my?namespace=${namespace}`
    );
    if (!response.ok) {
      throw new Error('failed to fetch requests');
    }
    const data = await response.json();
    // filter by apiproduct name, not httproute name
    return (data.items || []).filter(
      (r: APIKeyRequest) => r.spec.apiName === apiProductName && r.spec.apiNamespace === namespace
    );
  }, [apiProductName, namespace, refresh, fetchApi, backendUrl]);

  const { value: apiProduct, loading: plansLoading, error: plansError } = useAsync(async () => {
    const response = await fetchApi.fetch(`${backendUrl}/api/kuadrant/apiproducts`);
    if (!response.ok) {
      throw new Error('failed to fetch api products');
    }
    const data = await response.json();

    const product = data.items?.find((p: APIProduct) =>
      p.metadata.namespace === namespace &&
      p.metadata.name === apiProductName
    );

    return product;
  }, [namespace, apiProductName, fetchApi]);

  // check permissions with resource reference once we have the apiproduct
  const resourceRef = apiProduct ? `apiproduct:${apiProduct.metadata.namespace}/${apiProduct.metadata.name}` : undefined;

  const {
    allowed: canCreateRequest,
    loading: createRequestPermissionLoading,
    error: createRequestPermissionError,
  } = useKuadrantPermission(kuadrantApiKeyRequestCreatePermission, resourceRef);

  const {
    allowed: canDeleteOwnKey,
    loading: deleteOwnPermissionLoading,
    error: deleteOwnPermissionError,
  } = useKuadrantPermission(kuadrantApiKeyDeleteOwnPermission);

  const {
    allowed: canDeleteAllKeys,
    loading: deleteAllPermissionLoading,
    error: deleteAllPermissionError,
  } = useKuadrantPermission(kuadrantApiKeyDeleteAllPermission);

  const {
    allowed: canUpdateRequest,
    loading: updateRequestPermissionLoading,
    error: updateRequestPermissionError,
  } = useKuadrantPermission(kuadrantApiKeyRequestUpdateOwnPermission);

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

  const handleEditRequest = (request: APIKeyRequest) => {
    setRequestToEdit(request);
    setEditDialogOpen(true);
  };

  const handleEditSuccess = () => {
    setRefresh(r => r + 1);
    setEditDialogOpen(false);
    setRequestToEdit(null);
  };

  const handleMenuClose = () => {
    setMenuAnchor(null);
    setMenuRequest(null);
  };

  const handleMenuEdit = () => {
    if (!menuRequest) return;
    handleEditRequest(menuRequest);
    handleMenuClose();
  };

  const handleMenuDelete = async () => {
    if (!menuRequest) return;
    const requestName = menuRequest.metadata.name;
    handleMenuClose();

    if (!window.confirm('Are you sure you want to delete this request?')) {
      return;
    }

    await handleDeleteRequest(requestName);
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
          apiName: apiProductName,
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

  const detailPanelConfig = useMemo(() => [
    {
      render: (data: any) => {
        // backstage Table wraps the data in { rowData: actualData }
        const request = data.rowData as APIKeyRequest;
        if (!request?.metadata?.name) {
          return <Box />;
        }

        return <DetailPanelContent request={request} apiName={apiProductName} />;
      },
    },
  ], [apiProductName]);

  // separate component to isolate state
  const DetailPanelContent = ({ request, apiName: api }: { request: APIKeyRequest; apiName: string }) => {
    const [selectedLanguage, setSelectedLanguage] = useState(0);
    const hostname = request.status?.apiHostname || `${api}.apps.example.com`;

    return (
      <Box p={3} bgcolor="background.default" onClick={(e) => e.stopPropagation()}>
        <Typography variant="h6" gutterBottom>
          Usage Examples
        </Typography>
        <Typography variant="body2" paragraph>
          Use these code examples to test the API with your {request.spec.planTier} tier key.
        </Typography>
        <Box onClick={(e) => e.stopPropagation()}>
          <Tabs
            value={selectedLanguage}
            onChange={(e, newValue) => {
              e.stopPropagation();
              setSelectedLanguage(newValue);
            }}
            indicatorColor="primary"
          >
            <Tab label="cURL" onClick={(e) => e.stopPropagation()} />
            <Tab label="Node.js" onClick={(e) => e.stopPropagation()} />
            <Tab label="Python" onClick={(e) => e.stopPropagation()} />
            <Tab label="Go" onClick={(e) => e.stopPropagation()} />
          </Tabs>
        </Box>
            <Box mt={2}>
              {selectedLanguage === 0 && (
                <CodeSnippet
                  text={`curl -X GET https://${hostname}/api/v1/endpoint \\
  -H "Authorization: Bearer ${request.status?.apiKey}"`}
                  language="bash"
                  showCopyCodeButton
                />
              )}
              {selectedLanguage === 1 && (
                <CodeSnippet
                  text={`const fetch = require('node-fetch');

const apiKey = '${request.status?.apiKey}';
const endpoint = 'https://${hostname}/api/v1/endpoint';

fetch(endpoint, {
  method: 'GET',
  headers: {
    'Authorization': \`Bearer \${apiKey}\`
  }
})
  .then(response => response.json())
  .then(data => console.log(data))
  .catch(error => console.error('Error:', error));`}
                  language="javascript"
                  showCopyCodeButton
                />
              )}
              {selectedLanguage === 2 && (
                <CodeSnippet
                  text={`import requests

api_key = '${request.status?.apiKey}'
endpoint = 'https://${hostname}/api/v1/endpoint'

headers = {
    'Authorization': f'Bearer {api_key}'
}

response = requests.get(endpoint, headers=headers)
print(response.json())`}
                  language="python"
                  showCopyCodeButton
                />
              )}
              {selectedLanguage === 3 && (
                <CodeSnippet
                  text={`package main

import (
    "fmt"
    "net/http"
    "io"
)

func main() {
    apiKey := "${request.status?.apiKey}"
    endpoint := "https://${hostname}/api/v1/endpoint"

    client := &http.Client{}
    req, _ := http.NewRequest("GET", endpoint, nil)
    req.Header.Add("Authorization", "Bearer " + apiKey)

    resp, err := client.Do(req)
    if err != nil {
        fmt.Println("Error:", err)
        return
    }
    defer resp.Body.Close()

    body, _ := io.ReadAll(resp.Body)
    fmt.Println(string(body))
}`}
                  language="go"
                  showCopyCodeButton
                />
              )}
        </Box>
      </Box>
    );
  };

  const loading = requestsLoading || plansLoading || createRequestPermissionLoading || deleteOwnPermissionLoading || deleteAllPermissionLoading || updateRequestPermissionLoading;
  const error = requestsError || plansError;
  const permissionError = createRequestPermissionError || deleteOwnPermissionError || deleteAllPermissionError || updateRequestPermissionError;

  if (loading) {
    return <Progress />;
  }

  if (error) {
    return <ResponseErrorPanel error={error} />;
  }

  if (permissionError) {
    const failedPermission = createRequestPermissionError ? 'kuadrant.apikeyrequest.create' :
                            deleteOwnPermissionError ? 'kuadrant.apikey.delete.own' :
                            deleteAllPermissionError ? 'kuadrant.apikey.delete.all' :
                            updateRequestPermissionError ? 'kuadrant.apikeyrequest.update.own' : 'unknown';
    return (
      <Box p={2}>
        <Typography color="error">
          Unable to check permissions: {permissionError.message}
        </Typography>
        <Typography variant="body2" color="textSecondary">
          Permission: {failedPermission}
        </Typography>
        <Typography variant="body2" color="textSecondary">
          Please try again or contact your administrator
        </Typography>
      </Box>
    );
  }

  const myRequests = (requests || []) as APIKeyRequest[];
  const plans = (apiProduct?.spec?.plans || []) as Plan[];

  const pendingRequests = myRequests.filter(r => !r.status?.phase || r.status.phase === 'Pending');
  const approvedRequests = myRequests.filter(r => r.status?.phase === 'Approved');
  const rejectedRequests = myRequests.filter(r => r.status?.phase === 'Rejected');

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
    {
      title: '',
      field: 'actions',
      searchable: false,
      render: (row: APIKeyRequest) => {
        const ownerId = row.spec.requestedBy.userId;
        const canDelete = canDeleteResource(ownerId, userId, canDeleteOwnKey, canDeleteAllKeys);
        if (!canDelete) return null;
        return (
          <IconButton
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              const rect = e.currentTarget.getBoundingClientRect();
              setMenuAnchor({ top: rect.bottom, left: rect.left });
              setMenuRequest(row);
            }}
            title="Actions"
            aria-controls={menuAnchor ? 'actions-menu' : undefined}
            aria-haspopup="true"
          >
              <MoreVertIcon />
            </IconButton>
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
      title: '',
      field: 'actions',
      searchable: false,
      render: (row: APIKeyRequest) => {
        const isPending = !row.status?.phase || row.status.phase === 'Pending';
        const ownerId = row.spec.requestedBy.userId;
        const canDelete = canDeleteResource(ownerId, userId, canDeleteOwnKey, canDeleteAllKeys);
        const canEdit = canUpdateRequest && ownerId === userId;
        if (!isPending || (!canEdit && !canDelete)) return null;
        return (
          <IconButton
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              const rect = e.currentTarget.getBoundingClientRect();
              setMenuAnchor({ top: rect.bottom, left: rect.left });
              setMenuRequest(row);
            }}
            title="Actions"
            aria-controls={menuAnchor ? 'actions-menu' : undefined}
            aria-haspopup="true"
          >
              <MoreVertIcon />
            </IconButton>
        );
      },
    },
  ];

  return (
    <Box p={2}>
      <Grid container spacing={3} direction="column">
        {canCreateRequest && (
          <Grid item>
            <Box display="flex" flexDirection="column" alignItems="flex-end" mb={2}>
              <Button
                variant="contained"
                color="primary"
                startIcon={<AddIcon />}
                onClick={() => setOpen(true)}
                disabled={plans.length === 0}
              >
                Request API Access
              </Button>
              {plans.length === 0 && (
                <Typography variant="caption" color="textSecondary" style={{ marginTop: 4 }}>
                  {!apiProduct ? 'API product not found' : 'No plans available'}
                </Typography>
              )}
            </Box>
          </Grid>
        )}
        {pendingRequests.length === 0 && rejectedRequests.length === 0 && approvedRequests.length === 0 && (
          <Grid item>
            <Box p={3} textAlign="center">
              <Typography variant="body1" color="textSecondary">
                No API keys yet. Request access to get started.
              </Typography>
            </Box>
          </Grid>
        )}
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
              key="api-keys-table"
              title="API Keys"
              options={{
                paging: false,
                search: false,
              }}
              columns={approvedColumns}
              data={approvedRequests}
              detailPanel={detailPanelConfig}
            />
          </Grid>
        )}
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

      <Menu
        id="actions-menu"
        open={Boolean(menuAnchor)}
        onClose={handleMenuClose}
        anchorReference="anchorPosition"
        anchorPosition={menuAnchor || { top: 0, left: 0 }}
      >
        {menuRequest && (() => {
          const isPending = !menuRequest.status?.phase || menuRequest.status.phase === 'Pending';
          const ownerId = menuRequest.spec.requestedBy.userId;
          const canEdit = canUpdateRequest && ownerId === userId && isPending;

          const items = [];
          if (canEdit) {
            items.push(<MenuItem key="edit" onClick={handleMenuEdit}>Edit</MenuItem>);
          }
          items.push(<MenuItem key="delete" onClick={handleMenuDelete}>Delete</MenuItem>);
          return items;
        })()}
      </Menu>

      {requestToEdit && (
        <EditAPIKeyRequestDialog
          open={editDialogOpen}
          onClose={() => {
            setEditDialogOpen(false);
            setRequestToEdit(null);
          }}
          onSuccess={handleEditSuccess}
          request={requestToEdit}
          availablePlans={plans}
        />
      )}
    </Box>
  );
};
