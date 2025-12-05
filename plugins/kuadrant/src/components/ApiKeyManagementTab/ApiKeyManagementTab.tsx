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
  Tooltip,
  CircularProgress,
} from '@material-ui/core';
import { useApi, configApiRef, identityApiRef, fetchApiRef, alertApiRef } from '@backstage/core-plugin-api';
import { useEntity } from '@backstage/plugin-catalog-react';
import VisibilityIcon from '@material-ui/icons/Visibility';
import VisibilityOffIcon from '@material-ui/icons/VisibilityOff';
import HourglassEmptyIcon from '@material-ui/icons/HourglassEmpty';
import CancelIcon from '@material-ui/icons/Cancel';
import AddIcon from '@material-ui/icons/Add';
import MoreVertIcon from '@material-ui/icons/MoreVert';
import FileCopyIcon from '@material-ui/icons/FileCopy';
import WarningIcon from '@material-ui/icons/Warning';
import { APIKey } from '../../types/api-management';
import {
  kuadrantApiKeyCreatePermission,
  kuadrantApiKeyDeleteOwnPermission,
  kuadrantApiKeyDeleteAllPermission,
  kuadrantApiKeyUpdateOwnPermission,
} from '../../permissions';
import { useKuadrantPermission, canDeleteResource } from '../../utils/permissions';
import { EditAPIKeyDialog } from '../EditAPIKeyDialog';
import { ConfirmDeleteDialog } from '../ConfirmDeleteDialog';

interface APIProduct {
  metadata: {
    name: string;
    namespace: string;
  };
  spec: {
    displayName?: string;
  };
  status?: {
    discoveredPlans?: Array<{
      tier: string;
      description?: string;
      limits?: any;
    }>;
    conditions?: Array<{
      type: string;
      status: 'True' | 'False' | 'Unknown';
      reason?: string;
      message?: string;
      lastTransitionTime?: string;
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
  const alertApi = useApi(alertApiRef);
  const backendUrl = config.getString('backend.baseUrl');
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());
  const [refresh, setRefresh] = useState(0);
  const [userId, setUserId] = useState<string>('');
  const [userEmail, setUserEmail] = useState<string>('');
  const [open, setOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState('');
  const [useCase, setUseCase] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [requestToEdit, setRequestToEdit] = useState<APIKey | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<{ top: number; left: number } | null>(null);
  const [menuRequest, setMenuRequest] = useState<APIKey | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [optimisticallyDeleted, setOptimisticallyDeleted] = useState<Set<string>>(new Set());
  const [deleteDialogState, setDeleteDialogState] = useState<{
    open: boolean;
    request: APIKey | null;
  }>({ open: false, request: null });
  const [apiKeyValues, setApiKeyValues] = useState<Map<string, string>>(new Map());
  const [apiKeyLoading, setApiKeyLoading] = useState<Set<string>>(new Set());
  const [alreadyReadKeys, setAlreadyReadKeys] = useState<Set<string>>(new Set());
  const [showOnceWarningOpen, setShowOnceWarningOpen] = useState(false);
  const [pendingKeyReveal, setPendingKeyReveal] = useState<{ namespace: string; name: string } | null>(null);

  // get apiproduct name from entity annotation (set by entity provider)
  const apiProductName = entity.metadata.annotations?.['kuadrant.io/apiproduct'] || entity.metadata.name;
  const namespace = entity.metadata.annotations?.['kuadrant.io/namespace'] || propNamespace || 'default';

  useAsync(async () => {
    const identity = await identityApi.getBackstageIdentity();
    const profile = await identityApi.getProfileInfo();
    setUserId(identity.userEntityRef);
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
      (r: APIKey) => r.spec.apiProductRef.name === apiProductName && r.metadata.namespace === namespace // APIProducts and APIKeys (and its Secret) will be in the same NS
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
  } = useKuadrantPermission(kuadrantApiKeyCreatePermission, resourceRef);

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
  } = useKuadrantPermission(kuadrantApiKeyUpdateOwnPermission);

  const handleDeleteRequest = async (name: string) => {
    // optimistic update - remove from UI immediately
    setOptimisticallyDeleted(prev => new Set(prev).add(name));
    setDeleting(name);
    try {
      const response = await fetchApi.fetch(
        `${backendUrl}/api/kuadrant/requests/${namespace}/${name}`,
        { method: 'DELETE' }
      );
      if (!response.ok) {
        throw new Error('failed to delete request');
      }
      alertApi.post({
        message: 'API key request deleted successfully',
        severity: 'success',
        display: 'transient',
      });
      setRefresh(r => r + 1);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'unknown error occurred';
      // rollback optimistic update on error
      setOptimisticallyDeleted(prev => {
        const next = new Set(prev);
        next.delete(name);
        return next;
      });
      alertApi.post({
        message: `Failed to delete API key request: ${errorMessage}`,
        severity: 'error',
        display: 'transient',
      });
    } finally {
      setDeleting(null);
    }
  };

  const fetchApiKeyFromSecret = async (requestNamespace: string, requestName: string) => {
    const key = `${requestNamespace}/${requestName}`;
    if (apiKeyLoading.has(key)) {
      return;
    }

    setApiKeyLoading(prev => new Set(prev).add(key));
    try {
      const response = await fetchApi.fetch(
        `${backendUrl}/api/kuadrant/apikeys/${requestNamespace}/${requestName}/secret`
      );
      if (response.ok) {
        const data = await response.json();
        setApiKeyValues(prev => new Map(prev).set(key, data.apiKey));
        // after successful read, mark as already read (show-once behaviour)
        setAlreadyReadKeys(prev => new Set(prev).add(key));
      } else if (response.status === 403) {
        // secret has already been read
        setAlreadyReadKeys(prev => new Set(prev).add(key));
        alertApi.post({
          message: 'This API key has already been viewed and cannot be retrieved again.',
          severity: 'warning',
          display: 'transient',
        });
      }
    } catch (err) {
      console.error('failed to fetch api key:', err);
    } finally {
      setApiKeyLoading(prev => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  const clearApiKeyValue = (requestNamespace: string, requestName: string) => {
    const key = `${requestNamespace}/${requestName}`;
    setApiKeyValues(prev => {
      const next = new Map(prev);
      next.delete(key);
      return next;
    });
  };

  const handleEditRequest = (request: APIKey) => {
    setRequestToEdit(request);
    setEditDialogOpen(true);
  };

  const handleEditSuccess = () => {
    setRefresh(r => r + 1);
    setEditDialogOpen(false);
    alertApi.post({ message: 'Request updated', severity: 'success', display: 'transient' });
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

  const handleMenuDeleteClick = () => {
    if (!menuRequest) return;
    const request = menuRequest;
    handleMenuClose();
    setDeleteDialogState({ open: true, request });
  };

  const handleDeleteConfirm = async () => {
    if (!deleteDialogState.request) return;
    await handleDeleteRequest(deleteDialogState.request.metadata.name);
    setDeleteDialogState({ open: false, request: null });
  };

  const handleDeleteCancel = () => {
    setDeleteDialogState({ open: false, request: null });
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
          apiProductName,
          namespace,
          planTier: selectedPlan,
          useCase: useCase.trim() || '',
          userEmail,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `failed to create request: ${response.status}`);
      }

      alertApi.post({
        message: 'API access request submitted successfully',
        severity: 'success',
        display: 'transient',
      });

      setOpen(false);
      setSelectedPlan('');
      setUseCase('');
      setRefresh(r => r + 1);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'unknown error occurred';
      alertApi.post({
        message: `Failed to create API access request: ${errorMessage}`,
        severity: 'error',
        display: 'transient',
      });
      setCreateError(errorMessage);
    } finally {
      setCreating(false);
    }
  };

  const detailPanelConfig = useMemo(() => [
    {
      render: (data: any) => {
        // backstage Table wraps the data in { rowData: actualData }
        const request = data.rowData as APIKey;
        if (!request?.metadata?.name) {
          return <Box />;
        }

        // pass already-revealed key from parent state (don't auto-fetch - that consumes show-once)
        const key = `${request.metadata.namespace}/${request.metadata.name}`;
        const revealedKey = apiKeyValues.get(key);
        return <DetailPanelContent request={request} apiName={apiProductName} revealedApiKey={revealedKey} />;
      },
    },
  ], [apiProductName, apiKeyValues]);

  // separate component to isolate state
  const DetailPanelContent = ({ request, apiName: api, revealedApiKey }: { request: APIKey; apiName: string; revealedApiKey?: string }) => {
    const [selectedLanguage, setSelectedLanguage] = useState(0);
    const hostname = request.status?.apiHostname || `${api}.apps.example.com`;

    // use revealed key if available, otherwise show placeholder
    const displayApiKey = revealedApiKey || '<your-api-key>';

    return (
      <Box p={3} bgcolor="background.default" onClick={(e) => e.stopPropagation()}>
        {request.spec.useCase && (
          <Box mb={3}>
            <Typography variant="h6" gutterBottom>
              Use Case
            </Typography>
            <Box p={2} bgcolor="background.paper" borderRadius={1} border="1px solid rgba(0, 0, 0, 0.12)">
              <Typography
                variant="body2"
                style={{
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  overflowWrap: 'break-word',
                }}
              >
                {request.spec.useCase}
              </Typography>
            </Box>
          </Box>
        )}
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
  -H "Authorization: Bearer ${displayApiKey}"`} // notsecret - template for user's own api key
              language="bash"
              showCopyCodeButton
            />
          )}
          {selectedLanguage === 1 && (
            <CodeSnippet
              text={`const fetch = require('node-fetch');

const apiKey = '${displayApiKey}';
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

api_key = '${displayApiKey}'
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
    apiKey := "${displayApiKey}"
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
    const failedPermission = createRequestPermissionError ? 'kuadrant.apikey.create' :
      deleteOwnPermissionError ? 'kuadrant.apikey.delete.own' :
        deleteAllPermissionError ? 'kuadrant.apikey.delete.all' :
          updateRequestPermissionError ? 'kuadrant.apikey.update.own' : 'unknown';
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

  const myRequests = ((requests || []) as APIKey[]).filter(
    r => !optimisticallyDeleted.has(r.metadata.name)
  );
  const plans = (apiProduct?.status?.discoveredPlans || []) as Plan[];

  const pendingRequests = myRequests.filter(r => !r.status?.phase || r.status.phase === 'Pending');
  const approvedRequests = myRequests.filter(r => r.status?.phase === 'Approved');
  const rejectedRequests = myRequests.filter(r => r.status?.phase === 'Rejected');

  const approvedColumns: TableColumn<APIKey>[] = [
    {
      title: 'Tier',
      field: 'spec.planTier',
      render: (row: APIKey) => (
        <Chip label={row.spec.planTier} color="primary" size="small" />
      ),
    },
    {
      title: 'Approved',
      field: 'status.reviewedAt',
      render: (row: APIKey) => (
        <Typography variant="body2">
          {row.status?.reviewedAt ? new Date(row.status.reviewedAt).toLocaleDateString() : '-'}
        </Typography>
      ),
    },
    {
      title: 'API Key',
      field: 'status.secretRef',
      searchable: false,
      filtering: false,
      render: (row: APIKey) => {
        const key = `${row.metadata.namespace}/${row.metadata.name}`;
        const isVisible = visibleKeys.has(row.metadata.name);
        const isLoading = apiKeyLoading.has(key);
        const apiKeyValue = apiKeyValues.get(key);
        const hasSecretRef = row.status?.secretRef?.name;
        const canReadSecret = row.status?.canReadSecret !== false;
        const isAlreadyRead = alreadyReadKeys.has(key) || !canReadSecret;

        if (!hasSecretRef) {
          return (
            <Typography variant="body2" color="textSecondary">
              Awaiting secret...
            </Typography>
          );
        }

        // key has already been viewed and cannot be retrieved again
        if (isAlreadyRead && !apiKeyValue) {
          return (
            <Tooltip title="This API key has already been viewed and cannot be retrieved again">
              <Box display="flex" alignItems="center">
                <Typography
                  variant="body2"
                  color="textSecondary"
                  style={{ fontFamily: 'monospace', marginRight: 8 }}
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
            // hiding - clear the value from memory
            clearApiKeyValue(row.metadata.namespace, row.metadata.name);
            toggleVisibility(row.metadata.name);
          } else if (!isAlreadyRead) {
            // show warning dialog before first reveal
            setPendingKeyReveal({ namespace: row.metadata.namespace, name: row.metadata.name });
            setShowOnceWarningOpen(true);
          }
        };

        const handleCopy = async () => {
          if (apiKeyValue) {
            await navigator.clipboard.writeText(apiKeyValue);
            alertApi.post({
              message: 'API key copied to clipboard',
              severity: 'success',
              display: 'transient',
            });
          }
        };

        return (
          <Box display="flex" alignItems="center">
            <Typography
              variant="body2"
              style={{
                fontFamily: 'monospace',
                marginRight: 8,
              }}
            >
              {isLoading ? 'Loading...' : isVisible && apiKeyValue ? apiKeyValue : '••••••••••••••••'}
            </Typography>
            {isVisible && apiKeyValue && (
              <Tooltip title="Copy to clipboard">
                <IconButton size="small" onClick={handleCopy}>
                  <FileCopyIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
            <Tooltip title={isVisible ? 'Hide API key' : 'Reveal API key (one-time only)'}>
              <span>
                <IconButton
                  size="small"
                  onClick={handleRevealClick}
                  disabled={isLoading || (isAlreadyRead && !apiKeyValue)}
                >
                  {isVisible ? <VisibilityOffIcon /> : <VisibilityIcon />}
                </IconButton>
              </span>
            </Tooltip>
          </Box>
        );
      },
    },
    {
      title: '',
      field: 'actions',
      searchable: false,
      filtering: false,
      render: (row: APIKey) => {
        const isDeleting = deleting === row.metadata.name;
        if (isDeleting) {
          return <CircularProgress size={20} />;
        }
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

  const requestColumns: TableColumn<APIKey>[] = [
    {
      title: 'Status',
      field: 'status.phase',
      render: (row: APIKey) => {
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
      title: 'Tier',
      field: 'spec.planTier',
      render: (row: APIKey) => (
        <Chip label={row.spec.planTier} color="primary" size="small" />
      ),
    },
    {
      title: 'Use Case',
      field: 'spec.useCase',
      render: (row: APIKey) => {
        if (!row.spec.useCase) {
          return <Typography variant="body2">-</Typography>;
        }
        return (
          <Tooltip title={row.spec.useCase} placement="top">
            <Typography
              variant="body2"
              style={{
                maxWidth: '200px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {row.spec.useCase}
            </Typography>
          </Tooltip>
        );
      },
    },
    {
      title: 'Requested',
      field: 'metadata.creationTimestamp',
      render: (row: APIKey) => (
        <Typography variant="body2">
          {row.metadata.creationTimestamp ? new Date(row.metadata.creationTimestamp).toLocaleDateString() : '-'}
        </Typography>
      ),
    },
    {
      title: 'Reviewed',
      field: 'status.reviewedAt',
      render: (row: APIKey) => {
        if (!row.status?.reviewedAt) return <Typography variant="body2">-</Typography>;
        return (
          <Typography variant="body2">
            {new Date(row.status.reviewedAt).toLocaleDateString()}
          </Typography>
        );
      },
    },
    {
      title: '',
      field: 'actions',
      searchable: false,
      filtering: false,
      render: (row: APIKey) => {
        const isDeleting = deleting === row.metadata.name;
        if (isDeleting) {
          return <CircularProgress size={20} />;
        }
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

  // Filter columns for pending requests (no Reviewed or Reason)
  const pendingRequestColumns = requestColumns.filter(
    col => col.title !== 'Reviewed' && col.title !== 'Reason'
  );

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
                  {!apiProduct ? 'API product not found' : (() => {
                    const readyCondition = apiProduct.status?.conditions?.find((c: any) => c.type === 'Ready');
                    const planCondition = apiProduct.status?.conditions?.find((c: any) => c.type === 'PlanPolicyDiscovered');

                    if (readyCondition?.status !== 'True') {
                      return `HTTPRoute not ready: ${readyCondition?.message || 'unknown'}`;
                    }
                    if (planCondition?.status !== 'True') {
                      return `No plans discovered: ${planCondition?.message || 'no PlanPolicy found'}`;
                    }
                    return 'No plans available';
                  })()}
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
                paging: pendingRequests.length > 5,
                pageSize: 20,
                search: true,
                filtering: true,
                debounceInterval: 300,
                toolbar: true,
                emptyRowsWhenPaging: false,
              }}
              columns={pendingRequestColumns}
              data={pendingRequests}
            />
          </Grid>
        )}
        {rejectedRequests.length > 0 && (
          <Grid item>
            <Table
              title="Rejected Requests"
              options={{
                paging: rejectedRequests.length > 5,
                pageSize: 20,
                search: true,
                filtering: true,
                debounceInterval: 300,
                toolbar: true,
                emptyRowsWhenPaging: false,
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
                paging: approvedRequests.length > 5,
                pageSize: 20,
                search: true,
                filtering: true,
                debounceInterval: 300,
                toolbar: true,
                emptyRowsWhenPaging: false,
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
          <FormControl fullWidth margin="normal" disabled={creating}>
            <InputLabel>Select Tier</InputLabel>
            <Select
              value={selectedPlan}
              onChange={(e) => setSelectedPlan(e.target.value as string)}
              disabled={creating}
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
            disabled={creating}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)} disabled={creating}>Cancel</Button>
          <Button
            onClick={handleRequestAccess}
            color="primary"
            variant="contained"
            disabled={!selectedPlan || creating}
            startIcon={creating ? <CircularProgress size={16} color="inherit" /> : undefined}
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
          items.push(<MenuItem key="delete" onClick={handleMenuDeleteClick}>Delete</MenuItem>);
          return items;
        })()}
      </Menu>

      {requestToEdit && (
        <EditAPIKeyDialog
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

      <ConfirmDeleteDialog
        open={deleteDialogState.open}
        title="Delete Request"
        description={`Are you sure you want to delete this ${deleteDialogState.request?.status?.phase === 'Approved' ? 'API key' : 'request'}?`}
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
            This API key can only be viewed <strong>once</strong>. After you reveal it, you will not be able to retrieve it again.
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
                fetchApiKeyFromSecret(pendingKeyReveal.namespace, pendingKeyReveal.name);
                toggleVisibility(pendingKeyReveal.name);
              }
              setShowOnceWarningOpen(false);
              setPendingKeyReveal(null);
            }}
          >
            Reveal API Key
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
