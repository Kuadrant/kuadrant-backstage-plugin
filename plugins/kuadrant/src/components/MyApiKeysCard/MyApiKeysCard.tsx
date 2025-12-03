import React, { useState } from 'react';
import { InfoCard, Table, TableColumn, Link, Progress } from '@backstage/core-components';
import { useApi, configApiRef, fetchApiRef, identityApiRef, alertApiRef } from '@backstage/core-plugin-api';
import useAsync from 'react-use/lib/useAsync';
import { Box, Chip, Typography, Tabs, Tab, IconButton, Tooltip, Menu, MenuItem, CircularProgress } from '@material-ui/core';
import VisibilityIcon from '@material-ui/icons/Visibility';
import VisibilityOffIcon from '@material-ui/icons/VisibilityOff';
import MoreVertIcon from '@material-ui/icons/MoreVert';
import { EditAPIKeyRequestDialog } from '../EditAPIKeyRequestDialog';
import { ConfirmDeleteDialog } from '../ConfirmDeleteDialog';
import { APIKey } from '../../types/api-management';

export const MyApiKeysCard = () => {
  const config = useApi(configApiRef);
  const fetchApi = useApi(fetchApiRef);
  const identityApi = useApi(identityApiRef);
  const alertApi = useApi(alertApiRef);
  const backendUrl = config.getString('backend.baseUrl');
  const [selectedTab, setSelectedTab] = useState(0);
  const [, setUserId] = useState<string>('');
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());
  const [menuAnchor, setMenuAnchor] = useState<{ top: number; left: number } | null>(null);
  const [menuRequest, setMenuRequest] = useState<APIKey | null>(null);
  const [editDialogState, setEditDialogState] = useState<{ open: boolean; request: APIKey | null; plans: any[] }>({
    open: false,
    request: null,
    plans: [],
  });
  const [refresh, setRefresh] = useState(0);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deleteDialogState, setDeleteDialogState] = useState<{
    open: boolean;
    request: APIKey | null;
  }>({ open: false, request: null });
  const [apiKeyValues, setApiKeyValues] = useState<Map<string, string>>(new Map());
  const [apiKeyLoading, setApiKeyLoading] = useState<Set<string>>(new Set());

  useAsync(async () => {
    const identity = await identityApi.getBackstageIdentity();
    const extractedUserId = identity.userEntityRef.split('/')[1] || 'guest';
    console.log(`MyApiKeysCard: setting userId from userEntityRef: ${identity.userEntityRef} -> "${extractedUserId}"`);
    setUserId(extractedUserId);
  }, [identityApi]);

  const [optimisticallyDeleted, setOptimisticallyDeleted] = useState<Set<string>>(new Set());

  const { value: requests, loading, error } = useAsync(async () => {
    const response = await fetchApi.fetch(
      `${backendUrl}/api/kuadrant/requests/my`
    );
    if (!response.ok) {
      throw new Error('failed to fetch requests');
    }
    const data = await response.json();
    return data.items || [];
  }, [backendUrl, fetchApi, refresh]);

  if (loading) {
    return (
      <InfoCard title="My API Keys">
        <Progress />
      </InfoCard>
    );
  }

  if (error) {
    return (
      <InfoCard title="My API Keys">
        <Typography color="error">Error loading API keys: {error.message}</Typography>
      </InfoCard>
    );
  }

  const allRequests = (requests || []).filter(
    (r: APIKey) => !optimisticallyDeleted.has(r.metadata.name)
  );
  const approvedRequests = allRequests.filter((r: APIKey) => r.status?.phase === 'Approved');
  const pendingRequests = allRequests.filter((r: APIKey) => !r.status?.phase || r.status.phase === 'Pending');
  const rejectedRequests = allRequests.filter((r: APIKey) => r.status?.phase === 'Rejected');

  const toggleKeyVisibility = (keyName: string) => {
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

  const fetchApiKeyFromSecret = async (requestNamespace: string, requestName: string) => {
    const key = `${requestNamespace}/${requestName}`;
    if (apiKeyLoading.has(key)) {
      return;
    }

    setApiKeyLoading(prev => new Set(prev).add(key));
    try {
      const response = await fetchApi.fetch(
        `${backendUrl}/api/kuadrant/requests/${requestNamespace}/${requestName}/secret`
      );
      if (response.ok) {
        const data = await response.json();
        setApiKeyValues(prev => new Map(prev).set(key, data.apiKey));
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

  const handleMenuClose = () => {
    setMenuAnchor(null);
    setMenuRequest(null);
  };

  const handleEdit = async () => {
    if (!menuRequest) return;

    const request = menuRequest;
    handleMenuClose();

    // Fetch available plans for this API
    try {
      const apiProductName = request.spec.apiProductRef?.name;
      const apiProductNamespace = request.metadata.namespace;
      const apiProductResponse = await fetchApi.fetch(
        `${backendUrl}/api/kuadrant/apiproducts/${apiProductNamespace}/${apiProductName}`
      );

      if (apiProductResponse.ok) {
        const apiProduct = await apiProductResponse.json();
        const plans = apiProduct.spec?.plans || [];
        setEditDialogState({ open: true, request, plans });
      } else {
        console.error('Failed to fetch API product');
        setEditDialogState({ open: true, request, plans: [] });
      }
    } catch (err) {
      console.error('Error fetching plans:', err);
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

    // optimistic update - remove from UI immediately
    setOptimisticallyDeleted(prev => new Set(prev).add(requestName));
    setDeleting(requestName);

    try {
      const response = await fetchApi.fetch(
        `${backendUrl}/api/kuadrant/requests/${request.metadata.namespace}/${request.metadata.name}`,
        { method: 'DELETE' }
      );

      if (!response.ok) {
        throw new Error('Failed to delete request');
      }

      setRefresh(r => r + 1);
      alertApi.post({ message: 'Request deleted', severity: 'success', display: 'transient' });
      setDeleteDialogState({ open: false, request: null });
    } catch (err) {
      console.error('Error deleting request:', err);
      // rollback optimistic update on error
      setOptimisticallyDeleted(prev => {
        const next = new Set(prev);
        next.delete(requestName);
        return next;
      });
      alertApi.post({ message: 'Failed to delete request', severity: 'error', display: 'transient' });
    } finally {
      setDeleting(null);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteDialogState({ open: false, request: null });
  };

  const columns: TableColumn<APIKey>[] = [
    {
      title: 'API Product',
      field: 'spec.apiProductRef.name',
      render: (row: APIKey) => {
        const apiProductName = row.spec.apiProductRef?.name || 'unknown';
        return (
          <Link to={`/catalog/default/api/${apiProductName}/api-keys`}>
            <strong>{apiProductName}</strong>
          </Link>
        );
      },
    },
    {
      title: 'Tier',
      field: 'spec.planTier',
      render: (row: APIKey) => {
        const color = row.spec.planTier === 'gold' ? 'primary' :
                     row.spec.planTier === 'silver' ? 'default' : 'secondary';
        return <Chip label={row.spec.planTier} color={color} size="small" />;
      },
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
      title: 'Status',
      field: 'status.phase',
      render: (row: APIKey) => {
        const phase = row.status?.phase || 'Pending';
        const color = phase === 'Approved' ? 'primary' :
                     phase === 'Rejected' ? 'secondary' : 'default';
        return <Chip label={phase} color={color} size="small" />;
      },
    },
    {
      title: 'Reviewed By',
      field: 'status.reviewedBy',
      render: (row: APIKey) => {
        if ((row.status?.phase === 'Approved' || row.status?.phase === 'Rejected') && row.status.reviewedBy) {
          const reviewedDate = row.status.reviewedAt ? new Date(row.status.reviewedAt).toLocaleDateString() : '';
          return (
            <Box>
              <Typography variant="body2">{row.status.reviewedBy}</Typography>
              {reviewedDate && (
                <Typography variant="caption" color="textSecondary">
                  {reviewedDate}
                </Typography>
              )}
            </Box>
          );
        }
        return <Typography variant="body2" color="textSecondary">-</Typography>;
      },
    },
    {
      title: 'API Key',
      field: 'status.secretRef',
      filtering: false,
      render: (row: APIKey) => {
        if (row.status?.phase !== 'Approved') {
          return <Typography variant="body2" color="textSecondary">-</Typography>;
        }

        const key = `${row.metadata.namespace}/${row.metadata.name}`;
        const hasSecretRef = row.status?.secretRef?.name;
        const isVisible = visibleKeys.has(row.metadata.name);
        const isLoading = apiKeyLoading.has(key);
        const apiKeyValue = apiKeyValues.get(key);

        if (!hasSecretRef) {
          return (
            <Typography variant="body2" color="textSecondary">
              Awaiting secret...
            </Typography>
          );
        }

        const handleToggle = () => {
          if (isVisible) {
            // hiding - clear the value from memory
            clearApiKeyValue(row.metadata.namespace, row.metadata.name);
            toggleKeyVisibility(row.metadata.name);
          } else {
            // showing - fetch fresh value
            fetchApiKeyFromSecret(row.metadata.namespace, row.metadata.name);
            toggleKeyVisibility(row.metadata.name);
          }
        };

        return (
          <Box display="flex" alignItems="center" style={{ gap: 8 }}>
            <Box fontFamily="monospace" fontSize="0.875rem">
              {isLoading ? 'Loading...' : isVisible && apiKeyValue ? apiKeyValue : '•'.repeat(20) + '...'}
            </Box>
            <Tooltip title={isVisible ? 'hide key' : 'show key'}>
              <IconButton
                size="small"
                onClick={handleToggle}
                disabled={isLoading}
              >
                {isVisible ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
              </IconButton>
            </Tooltip>
          </Box>
        );
      },
    },
    {
      title: 'Requested',
      field: 'metadata.creationTimestamp',
      render: (row: APIKey) => {
        if (!row.metadata.creationTimestamp) {
          return <Typography variant="body2">-</Typography>;
        }
        const date = new Date(row.metadata.creationTimestamp);
        return <Typography variant="body2">{date.toLocaleDateString()}</Typography>;
      },
    },
    {
      title: '',
      filtering: false,
      render: (row: APIKey) => {
        const isDeleting = deleting === row.metadata.name;
        if (isDeleting) {
          return <CircularProgress size={20} />;
        }
        return (
          <IconButton
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              const rect = e.currentTarget.getBoundingClientRect();
              setMenuAnchor({ top: rect.bottom, left: rect.left });
              setMenuRequest(row);
            }}
            aria-controls={menuAnchor ? 'myapikeys-menu' : undefined}
            aria-haspopup="true"
          >
            <MoreVertIcon />
          </IconButton>
        );
      },
    },
  ];

  const getTabData = () => {
    switch (selectedTab) {
      case 0:
        return approvedRequests;
      case 1:
        return pendingRequests;
      case 2:
        return rejectedRequests;
      default:
        return allRequests;
    }
  };

  const getTabColumns = () => {
    switch (selectedTab) {
      case 0: // Active - no Reason
        return columns.filter(col => col.title !== 'Reason');
      case 1: // Pending - no Reason, Reviewed By, API Key
        return columns.filter(col =>
          col.title !== 'Reason' &&
          col.title !== 'Reviewed By' &&
          col.title !== 'API Key'
        );
      case 2: // Rejected - no API Key
        return columns.filter(col => col.title !== 'API Key');
      default:
        return columns;
    }
  };

  const tabData = getTabData();
  const tabColumns = getTabColumns();
  const isPending = (row: APIKey) => !row.status || row.status.phase === 'Pending';

  return (
    <>
      <InfoCard
        title="My API Keys"
        subheader={`${approvedRequests.length} active, ${pendingRequests.length} pending`}
      >
        <Box mb={2}>
          <Tabs
            value={selectedTab}
            onChange={(_, newValue) => setSelectedTab(newValue)}
            indicatorColor="primary"
            textColor="primary"
          >
            <Tab label={`Active (${approvedRequests.length})`} />
            <Tab label={`Pending (${pendingRequests.length})`} />
            <Tab label={`Rejected (${rejectedRequests.length})`} />
          </Tabs>
        </Box>
        {tabData.length === 0 ? (
          <Box p={3} textAlign="center">
            <Typography variant="body1" color="textSecondary">
              {selectedTab === 0 && 'No active API keys. Request access to an API to get started.'}
              {selectedTab === 1 && 'No pending requests.'}
              {selectedTab === 2 && 'No rejected requests.'}
            </Typography>
          </Box>
        ) : (
          <Table
            options={{
              paging: tabData.length > 5,
              pageSize: 20,
              search: true,
              filtering: true,
              debounceInterval: 300,
              toolbar: true,
              emptyRowsWhenPaging: false,
            }}
            columns={tabColumns}
            data={tabData.map((item: APIKey) => ({
              ...item,
              id: item.metadata.name,
            }))}
          />
        )}
      </InfoCard>

      <Menu
        id="myapikeys-menu"
        open={Boolean(menuAnchor)}
        onClose={handleMenuClose}
        anchorReference="anchorPosition"
        anchorPosition={menuAnchor || { top: 0, left: 0 }}
      >
        {menuRequest && (() => {
          const items = [];
          if (isPending(menuRequest)) {
            items.push(<MenuItem key="edit" onClick={handleEdit}>Edit</MenuItem>);
          }
          items.push(<MenuItem key="delete" onClick={handleDeleteClick}>Delete</MenuItem>);
          return items;
        })()}
      </Menu>

      {editDialogState.request && (
        <EditAPIKeyRequestDialog
          open={editDialogState.open}
          request={editDialogState.request}
          availablePlans={editDialogState.plans}
          onClose={() => setEditDialogState({ open: false, request: null, plans: [] })}
          onSuccess={() => {
            setEditDialogState({ open: false, request: null, plans: [] });
            setRefresh(r => r + 1);
          }}
        />
      )}

      <ConfirmDeleteDialog
        open={deleteDialogState.open}
        title="Delete API Key Request"
        description={`Are you sure you want to delete the API key request for ${deleteDialogState.request?.spec.apiProductRef?.name || 'this API'}?`}
        deleting={deleting !== null}
        onConfirm={handleDeleteConfirm}
        onCancel={handleDeleteCancel}
      />
    </>
  );
};
