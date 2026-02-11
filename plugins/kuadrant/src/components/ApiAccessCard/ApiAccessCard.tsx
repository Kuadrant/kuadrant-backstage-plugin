import React, { useState } from 'react';
import { useAsync } from 'react-use';
import {
  InfoCard,
  ResponseErrorPanel,
} from '@backstage/core-components';
import {
  Typography,
  Box,
  Chip,
  Button,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@material-ui/core';
import { Skeleton } from '@material-ui/lab';
import AddIcon from '@material-ui/icons/Add';
import VisibilityIcon from '@material-ui/icons/Visibility';
import VisibilityOffIcon from '@material-ui/icons/VisibilityOff';
import FileCopyIcon from '@material-ui/icons/FileCopy';
import WarningIcon from '@material-ui/icons/Warning';
import { useApi, configApiRef, identityApiRef, fetchApiRef, alertApiRef } from '@backstage/core-plugin-api';
import { useEntity } from '@backstage/plugin-catalog-react';
import { RequestAccessDialog, Plan } from '../RequestAccessDialog';
import { useKuadrantPermission } from '../../utils/permissions';
import { kuadrantApiKeyCreatePermission } from '../../permissions';
import {handleFetchError} from "../../utils/errors.ts";

interface APIKey {
  metadata: {
    name: string;
    namespace: string;
  };
  spec: {
    apiProductRef: {
      name: string;
    };
    planTier: string;
  };
  status?: {
    phase: 'Pending' | 'Approved' | 'Rejected';
    secretRef?: {
      name: string;
      key: string;
    };
    canReadSecret?: boolean;
  };
}

interface APIProduct {
  metadata: {
    name: string;
    namespace: string;
  };
  status?: {
    discoveredPlans?: Plan[];
  };
}

export interface ApiAccessCardProps {
  // deprecated: use entity annotations instead
  namespace?: string;
}

export const ApiAccessCard = ({ namespace: propNamespace }: ApiAccessCardProps) => {
  const { entity } = useEntity();
  const config = useApi(configApiRef);
  const identityApi = useApi(identityApiRef);
  const fetchApi = useApi(fetchApiRef);
  const alertApi = useApi(alertApiRef);
  const backendUrl = config.getString('backend.baseUrl');
  const [userEmail, setUserEmail] = useState<string>('');
  const [requestDialogOpen, setRequestDialogOpen] = useState(false);
  const [refresh, setRefresh] = useState(0);

  // key reveal state
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());
  const [apiKeyValues, setApiKeyValues] = useState<Map<string, string>>(new Map());
  const [apiKeyLoading, setApiKeyLoading] = useState<Set<string>>(new Set());
  const [alreadyReadKeys, setAlreadyReadKeys] = useState<Set<string>>(new Set());
  const [showOnceWarningOpen, setShowOnceWarningOpen] = useState(false);
  const [pendingKeyReveal, setPendingKeyReveal] = useState<{
    namespace: string;
    name: string;
  } | null>(null);

  // get apiproduct name from entity annotation (set by entity provider)
  const apiProductName = entity.metadata.annotations?.['kuadrant.io/apiproduct'] || entity.metadata.name;
  const namespace = entity.metadata.annotations?.['kuadrant.io/namespace'] || propNamespace || 'default';

  // get current user identity
  useAsync(async () => {
    const profile = await identityApi.getProfileInfo();
    setUserEmail(profile.email || '');
  }, [identityApi]);

  // fetch user's approved keys
  const { value: requests, loading: keysLoading, error: keysError } = useAsync(async () => {
    const url = namespace
      ? `${backendUrl}/api/kuadrant/requests/my?namespace=${namespace}`
      : `${backendUrl}/api/kuadrant/requests/my`;
    const response = await fetchApi.fetch(url);
    if (!response.ok) {
      const error = await handleFetchError(response);
      throw new Error(`failed to fetch api key requests ${error}`);
    }
    const data = await response.json();
    const allRequests = data.items || [];
    return allRequests.filter((r: APIKey) =>
      r.spec.apiProductRef?.name === apiProductName && r.status?.phase === 'Approved'
    );
  }, [namespace, apiProductName, backendUrl, fetchApi, refresh]);

  // fetch apiproduct to get available plans
  const { value: apiProduct, loading: productLoading } = useAsync(async () => {
    const response = await fetchApi.fetch(`${backendUrl}/api/kuadrant/apiproducts`);
    if (!response.ok) {
      return null;
    }
    const data = await response.json();
    return data.items?.find(
      (p: APIProduct) =>
        p.metadata.namespace === namespace &&
        p.metadata.name === apiProductName,
    );
  }, [namespace, apiProductName, fetchApi, backendUrl]);

  const resourceRef = apiProduct
    ? `apiproduct:${apiProduct.metadata.namespace}/${apiProduct.metadata.name}`
    : undefined;

  const { allowed: canCreateRequest, loading: permissionLoading } = useKuadrantPermission(
    kuadrantApiKeyCreatePermission,
    resourceRef,
  );

  const fetchApiKeyFromSecret = async (requestNamespace: string, requestName: string) => {
    const key = `${requestNamespace}/${requestName}`;
    if (apiKeyLoading.has(key)) {
      return;
    }

    setApiKeyLoading((prev) => new Set(prev).add(key));
    try {
      const response = await fetchApi.fetch(
        `${backendUrl}/api/kuadrant/apikeys/${requestNamespace}/${requestName}/secret`,
      );
      if (response.ok) {
        const data = await response.json();
        setApiKeyValues((prev) => new Map(prev).set(key, data.apiKey));
        setAlreadyReadKeys((prev) => new Set(prev).add(key));
      } else if (response.status === 403) {
        setAlreadyReadKeys((prev) => new Set(prev).add(key));
        alertApi.post({
          message: 'This API key has already been viewed and cannot be retrieved again.',
          severity: 'warning',
          display: 'transient',
        });
      }
    } catch (err) {
      console.error('failed to fetch api key:', err);
      const errorMessage = err instanceof Error ? err.message : "unknown error occurred";
      alertApi.post({
        message: `Failed to fetch APIKey. ${errorMessage}`,
        severity: 'error',
        display: 'transient',
      });
    } finally {
      setApiKeyLoading((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  const clearApiKeyValue = (requestNamespace: string, requestName: string) => {
    const key = `${requestNamespace}/${requestName}`;
    setApiKeyValues((prev) => {
      const next = new Map(prev);
      next.delete(key);
      return next;
    });
  };

  const toggleVisibility = (keyName: string) => {
    setVisibleKeys((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(keyName)) {
        newSet.delete(keyName);
      } else {
        newSet.add(keyName);
      }
      return newSet;
    });
  };

  const loading = keysLoading || productLoading || permissionLoading;

  if (loading) {
    return (
      <InfoCard title="Kuadrant API Keys">
        <Box p={2}>
          <Skeleton variant="text" width="80%" />
          <Skeleton variant="text" width="60%" />
          <Skeleton variant="text" width="70%" />
        </Box>
      </InfoCard>
    );
  }

  if (keysError) {
    return <ResponseErrorPanel error={keysError} />;
  }

  const keys = (requests as APIKey[]) || [];
  const plans = (apiProduct?.status?.discoveredPlans || []) as Plan[];
  const canRequest = canCreateRequest && plans.length > 0;

  const renderKeyRow = (request: APIKey) => {
    const key = `${request.metadata.namespace}/${request.metadata.name}`;
    const isVisible = visibleKeys.has(request.metadata.name);
    const isLoading = apiKeyLoading.has(key);
    const apiKeyValue = apiKeyValues.get(key);
    const hasSecretRef = request.status?.secretRef?.name;
    const canReadSecret = request.status?.canReadSecret !== false;
    const isAlreadyRead = alreadyReadKeys.has(key) || !canReadSecret;

    const handleRevealClick = () => {
      if (isVisible) {
        clearApiKeyValue(request.metadata.namespace, request.metadata.name);
        toggleVisibility(request.metadata.name);
      } else if (!isAlreadyRead) {
        setPendingKeyReveal({
          namespace: request.metadata.namespace,
          name: request.metadata.name,
        });
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
      <Box
        key={request.metadata.name}
        mb={1}
        p={1.5}
        border={1}
        borderColor="grey.300"
        borderRadius={4}
      >
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
          <Typography variant="body2" style={{ fontWeight: 500 }}>
            {request.metadata.name}
          </Typography>
          <Chip label={request.spec.planTier} color="primary" size="small" />
        </Box>
        {hasSecretRef && (
          <Box display="flex" alignItems="center">
            <Typography
              variant="body2"
              style={{
                fontFamily: 'monospace',
                fontSize: '0.8rem',
                flex: 1,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {isLoading
                ? 'Loading...'
                : isVisible && apiKeyValue
                  ? apiKeyValue
                  : isAlreadyRead && !apiKeyValue
                    ? 'Already viewed'
                    : '••••••••••••••••'}
            </Typography>
            {isVisible && apiKeyValue && (
              <Tooltip title="Copy to clipboard">
                <IconButton size="small" onClick={handleCopy}>
                  <FileCopyIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
            <Tooltip
              title={
                isAlreadyRead && !apiKeyValue
                  ? 'Key already viewed'
                  : isVisible
                    ? 'Hide API key'
                    : 'Reveal API key (one-time only)'
              }
            >
              <span>
                <IconButton
                  size="small"
                  onClick={handleRevealClick}
                  disabled={isLoading || (isAlreadyRead && !apiKeyValue)}
                >
                  {isVisible ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
                </IconButton>
              </span>
            </Tooltip>
          </Box>
        )}
      </Box>
    );
  };

  return (
    <>
      <InfoCard title="Kuadrant API Keys">
        <Box p={2}>
          {keys.length > 0 ? (
            <>
              <Typography variant="body2" color="textSecondary" gutterBottom>
                {keys.length} active key{keys.length !== 1 ? 's' : ''}
              </Typography>
              {keys.map(renderKeyRow)}
            </>
          ) : (
            <Typography variant="body1" gutterBottom>
              You don't have any API keys for this API yet
            </Typography>
          )}
          <Box mt={2}>
            {canRequest ? (
              <Button
                variant="contained"
                color="primary"
                size="small"
                startIcon={<AddIcon />}
                onClick={() => setRequestDialogOpen(true)}
                data-testid="request-api-access-button"
              >
                Request API Access
              </Button>
            ) : (
              <Typography variant="caption" color="textSecondary">
                Visit the API Keys tab to view and manage access
              </Typography>
            )}
          </Box>
        </Box>
      </InfoCard>

      <RequestAccessDialog
        open={requestDialogOpen}
        onClose={() => setRequestDialogOpen(false)}
        onSuccess={() => {
          setRequestDialogOpen(false);
          setRefresh((r) => r + 1);
        }}
        apiProductName={apiProductName}
        namespace={namespace}
        userEmail={userEmail}
        plans={plans}
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
            This API key can only be viewed <strong>once</strong>. After you
            reveal it, you will not be able to retrieve it again.
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
                fetchApiKeyFromSecret(
                  pendingKeyReveal.namespace,
                  pendingKeyReveal.name,
                );
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
    </>
  );
};
