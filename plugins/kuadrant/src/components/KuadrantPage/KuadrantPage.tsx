import React, { useState } from 'react';
import { Typography, Grid, Box, Chip, Button, IconButton, Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions } from '@material-ui/core';
import AddIcon from '@material-ui/icons/Add';
import DeleteIcon from '@material-ui/icons/Delete';
import EditIcon from '@material-ui/icons/Edit';
import {
  InfoCard,
  Header,
  Page,
  Content,
  SupportButton,
  Progress,
  ResponseErrorPanel,
  Link,
  Table,
  TableColumn,
} from '@backstage/core-components';
import useAsync from 'react-use/lib/useAsync';
import { useApi, configApiRef, fetchApiRef } from '@backstage/core-plugin-api';
import { ApprovalQueueCard } from '../ApprovalQueueCard';
import { MyApiKeysCard } from '../MyApiKeysCard';
import { PermissionGate } from '../PermissionGate';
import { CreateAPIProductDialog } from '../CreateAPIProductDialog';
import {
  kuadrantApiProductCreatePermission,
  kuadrantApiProductDeleteOwnPermission,
  kuadrantApiProductDeleteAllPermission,
  kuadrantApiProductUpdateOwnPermission,
  kuadrantApiProductUpdateAllPermission,
  kuadrantApiProductListPermission,
  kuadrantApiKeyRequestReadAllPermission,
  kuadrantPlanPolicyListPermission,
} from '../../permissions';
import { useKuadrantPermission } from '../../utils/permissions';
import { EditAPIProductDialog } from '../EditAPIProductDialog';

type KuadrantResource = {
  metadata: {
    name: string;
    namespace: string;
    creationTimestamp: string;
  };
  spec?: any;
};

type KuadrantList = {
  items: KuadrantResource[];
};

export const ResourceList = () => {
  const config = useApi(configApiRef);
  const fetchApi = useApi(fetchApiRef);
  const backendUrl = config.getString('backend.baseUrl');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [apiProductToDelete, setApiProductToDelete] = useState<{ namespace: string; name: string } | null>(null);
  const [apiProductToEdit, setApiProductToEdit] = useState<{ namespace: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const {
    allowed: canCreateApiProduct,
    loading: createPermissionLoading,
    error: createPermissionError,
  } = useKuadrantPermission(kuadrantApiProductCreatePermission);

  const {
    allowed: canViewApprovalQueue,
    loading: approvalQueuePermissionLoading,
    error: approvalQueuePermissionError,
  } = useKuadrantPermission(kuadrantApiKeyRequestReadAllPermission);

  const {
    allowed: canDeleteOwnApiProduct,
    loading: deleteOwnPermissionLoading,
  } = useKuadrantPermission(kuadrantApiProductDeleteOwnPermission);

  const {
    allowed: canDeleteAllApiProducts,
    loading: deleteAllPermissionLoading,
    error: deletePermissionError,
  } = useKuadrantPermission(kuadrantApiProductDeleteAllPermission);

  const {
    allowed: canUpdateOwnApiProduct,
  } = useKuadrantPermission(kuadrantApiProductUpdateOwnPermission);

  const {
    allowed: canUpdateAllApiProducts,
  } = useKuadrantPermission(kuadrantApiProductUpdateAllPermission);

  const canDeleteApiProduct = canDeleteOwnApiProduct || canDeleteAllApiProducts;
  const canUpdateApiProduct = canUpdateOwnApiProduct || canUpdateAllApiProducts;
  const deletePermissionLoading = deleteOwnPermissionLoading || deleteAllPermissionLoading;

  const {
    allowed: canListPlanPolicies,
    loading: planPolicyPermissionLoading,
    error: planPolicyPermissionError,
  } = useKuadrantPermission(kuadrantPlanPolicyListPermission);

  const { value: apiProducts, loading: apiProductsLoading, error: apiProductsError } = useAsync(async (): Promise<KuadrantList> => {
    const response = await fetchApi.fetch(`${backendUrl}/api/kuadrant/apiproducts`);
    return await response.json();
  }, [backendUrl, fetchApi, refreshTrigger]);

  const { value: planPolicies, loading: planPoliciesLoading, error: planPoliciesError } = useAsync(async (): Promise<KuadrantList> => {
    const response = await fetchApi.fetch(`${backendUrl}/api/kuadrant/planpolicies`);
    return await response.json();
  }, [backendUrl, fetchApi, refreshTrigger]);

  const loading = apiProductsLoading || planPoliciesLoading || createPermissionLoading || approvalQueuePermissionLoading || deletePermissionLoading || planPolicyPermissionLoading;
  const error = apiProductsError || planPoliciesError;
  const permissionError = createPermissionError || approvalQueuePermissionError || deletePermissionError || planPolicyPermissionError;

  const handleCreateSuccess = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  const handleEditClick = (namespace: string, name: string) => {
    setApiProductToEdit({ namespace, name });
    setEditDialogOpen(true);
  };

  const handleEditSuccess = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  const handleDeleteClick = (namespace: string, name: string) => {
    setApiProductToDelete({ namespace, name });
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!apiProductToDelete) return;

    setDeleting(true);
    try {
      const response = await fetchApi.fetch(
        `${backendUrl}/api/kuadrant/apiproducts/${apiProductToDelete.namespace}/${apiProductToDelete.name}`,
        { method: 'DELETE' }
      );

      if (!response.ok) {
        throw new Error('failed to delete apiproduct');
      }

      setRefreshTrigger(prev => prev + 1);
    } catch (err) {
      console.error('error deleting apiproduct:', err);
    } finally {
      setDeleting(false);
      setDeleteDialogOpen(false);
      setApiProductToDelete(null);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteDialogOpen(false);
    setApiProductToDelete(null);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-GB', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const columns: TableColumn[] = [
    {
      title: 'Name',
      field: 'name',
      render: (row: any) => (
        <Link to={`/catalog/default/api/${row.metadata.name}/api-product`}>
          <strong>{row.spec?.displayName || row.metadata.name}</strong>
        </Link>
      ),
    },
    {
      title: 'Resource Name',
      field: 'metadata.name',
    },
    {
      title: 'Version',
      field: 'spec.version',
      render: (row: any) => row.spec?.version || '-',
    },
    {
      title: 'HTTPRoute',
      field: 'spec.targetRef.name',
      render: (row: any) => row.spec?.targetRef?.name || '-',
    },
    {
      title: 'Publish Status',
      field: 'spec.publishStatus',
      render: (row: any) => {
        const status = row.spec?.publishStatus || 'Draft';
        return (
          <Chip
            label={status}
            size="small"
            color={status === 'Published' ? 'primary' : 'default'}
          />
        );
      },
    },
    {
      title: 'Approval Mode',
      field: 'spec.approvalMode',
      render: (row: any) => {
        const mode = row.spec?.approvalMode || 'manual';
        return (
          <Chip
            label={mode}
            size="small"
            color={mode === 'automatic' ? 'secondary' : 'default'}
          />
        );
      },
    },
    {
      title: 'Namespace',
      field: 'metadata.namespace',
    },
    {
      title: 'Created',
      field: 'metadata.creationTimestamp',
      render: (row: any) => formatDate(row.metadata.creationTimestamp),
    },
    {
      title: 'Actions',
      field: 'actions',
      render: (row: any) => (
        <Box display="flex" style={{ gap: 4 }}>
          {canUpdateApiProduct && (
            <IconButton
              size="small"
              onClick={() => handleEditClick(row.metadata.namespace, row.metadata.name)}
              title="Edit API Product"
            >
              <EditIcon fontSize="small" />
            </IconButton>
          )}
          
          {canDeleteApiProduct && (
            <IconButton
              size="small"
              onClick={() => handleDeleteClick(row.metadata.namespace, row.metadata.name)}
              title="Delete API Product"
            >
              <DeleteIcon fontSize="small" />
            </IconButton>
          )}
        </Box>
      ),
    },
  ];

  const planPolicyColumns: TableColumn[] = [
    {
      title: 'Name',
      field: 'metadata.name',
      render: (row: any) => (
        <Link to={`/kuadrant/planpolicy/${row.metadata.namespace}/${row.metadata.name}`}>
          <strong>{row.metadata.name}</strong>
        </Link>
      ),
    },
    {
      title: 'Namespace',
      field: 'metadata.namespace',
    },
  ];

  const renderResources = (resources: KuadrantResource[] | undefined) => {
    if (!resources || resources.length === 0) {
      return <Typography variant="body2" color="textSecondary">No API products found</Typography>;
    }
    return (
      <Table
        options={{ paging: false, search: false, toolbar: false }}
        columns={columns}
        data={resources}
      />
    );
  };

  const renderPlanPolicies = (resources: KuadrantResource[] | undefined) => {
    if (!resources || resources.length === 0) {
      return <Typography variant="body2" color="textSecondary">No plan policies found</Typography>;
    }
    return (
      <Table
        options={{ paging: false, search: false, toolbar: false }}
        columns={planPolicyColumns}
        data={resources}
      />
    );
  };

  return (
    <Page themeId="tool">
      <Header title="Kuadrant" subtitle="API management for Kubernetes">
        <SupportButton>Manage API products and access requests</SupportButton>
      </Header>
      <Content>
        {loading && <Progress />}
        {error && <ResponseErrorPanel error={error} />}
        {permissionError && (
          <Box p={2}>
            <Typography color="error">
              unable to check permissions: {permissionError.message}
            </Typography>
            <Typography variant="body2" color="textSecondary">
              permission: {createPermissionError ? 'kuadrant.apiproduct.create' :
                         deletePermissionError ? 'kuadrant.apiproduct.delete' :
                         approvalQueuePermissionError ? 'kuadrant.apikeyrequest.read.all' :
                         planPolicyPermissionError ? 'kuadrant.planpolicy.list' : 'unknown'}
            </Typography>
            <Typography variant="body2" color="textSecondary">
              please try again or contact your administrator
            </Typography>
          </Box>
        )}
        {!loading && !error && !permissionError && (
          <Grid container spacing={3} direction="column">
            <Grid item>
              <MyApiKeysCard />
            </Grid>

            <Grid item>
              <InfoCard
                title="API Products"
                action={
                  canCreateApiProduct ? (
                    <Box display="flex" alignItems="center" height="100%" mt={1}>
                      <Button
                        variant="contained"
                        color="primary"
                        size="small"
                        startIcon={<AddIcon />}
                        onClick={() => setCreateDialogOpen(true)}
                      >
                        Create API Product
                      </Button>
                    </Box>
                  ) : undefined
                }
              >
                {renderResources(apiProducts?.items)}
              </InfoCard>
            </Grid>

            {canListPlanPolicies && (
              <Grid item>
                <InfoCard title="Plan Policies">
                  {renderPlanPolicies(planPolicies?.items)}
                </InfoCard>
              </Grid>
            )}

            {canViewApprovalQueue && (
              <Grid item>
                <ApprovalQueueCard />
              </Grid>
            )}
          </Grid>
        )}
        <CreateAPIProductDialog
          open={createDialogOpen}
          onClose={() => setCreateDialogOpen(false)}
          onSuccess={handleCreateSuccess}
        />
        <EditAPIProductDialog
          open={editDialogOpen}
          onClose={() => setEditDialogOpen(false)}
          onSuccess={handleEditSuccess}
          namespace={apiProductToEdit?.namespace || ''}
          name={apiProductToEdit?.name || ''}
        />
        <Dialog open={deleteDialogOpen} onClose={handleDeleteCancel}>
          <DialogTitle>Delete API Product</DialogTitle>
          <DialogContent>
            <DialogContentText>
              Are you sure you want to delete {apiProductToDelete?.name} from namespace {apiProductToDelete?.namespace}?
              This will permanently remove the API Product from Kubernetes.
            </DialogContentText>
          </DialogContent>
          <DialogActions>
            <Button onClick={handleDeleteCancel} color="primary">
              Cancel
            </Button>
            <Button onClick={handleDeleteConfirm} color="secondary" disabled={deleting}>
              {deleting ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogActions>
        </Dialog>
      </Content>
    </Page>
  );
};

export const KuadrantPage = () => {
  return (
    <PermissionGate
      permission={kuadrantApiProductListPermission}
      errorMessage="you don't have permission to view the Kuadrant page"
    >
      <ResourceList />
    </PermissionGate>
  );
};
