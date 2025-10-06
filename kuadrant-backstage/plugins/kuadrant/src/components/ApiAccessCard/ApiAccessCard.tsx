import { useState } from 'react';
import { useAsync } from 'react-use';
import {
  InfoCard,
  Progress,
  ResponseErrorPanel,
} from '@backstage/core-components';
import {
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Typography,
  Box,
  IconButton,
  Chip,
} from '@material-ui/core';
import { useApi, configApiRef, identityApiRef } from '@backstage/core-plugin-api';
import { useEntity } from '@backstage/plugin-catalog-react';
import VisibilityIcon from '@material-ui/icons/Visibility';
import VisibilityOffIcon from '@material-ui/icons/VisibilityOff';
import DeleteIcon from '@material-ui/icons/Delete';

interface Plan {
  tier: string;
  limits: {
    [key: string]: number;
  };
}

interface PlanPolicy {
  metadata: {
    name: string;
    namespace: string;
  };
  spec: {
    plans: Plan[];
  };
}

interface ApiKey {
  metadata: {
    name: string;
    namespace: string;
    annotations?: {
      'secret.kuadrant.io/plan-id'?: string;
      'secret.kuadrant.io/user-id'?: string;
    };
  };
  data?: {
    api_key?: string;
  };
}

interface ApiAccessCardProps {
  // deprecated: use entity annotations instead
  apiName?: string;
  namespace?: string;
}

export const ApiAccessCard = ({ apiName: propApiName, namespace: propNamespace }: ApiAccessCardProps) => {
  const { entity } = useEntity();
  const config = useApi(configApiRef);
  const identityApi = useApi(identityApiRef);
  const backendUrl = config.getString('backend.baseUrl');
  const [open, setOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());
  const [refresh, setRefresh] = useState(0);
  const [userId, setUserId] = useState<string>('guest');

  // read from entity annotations, fallback to props for backwards compat
  const httproute = entity.metadata.annotations?.['kuadrant.io/httproute'] || propApiName || entity.metadata.name;
  const namespace = entity.metadata.annotations?.['kuadrant.io/namespace'] || propNamespace || 'default';
  const apiName = httproute; // use httproute name as api name

  // get current user identity
  useAsync(async () => {
    const identity = await identityApi.getBackstageIdentity();
    setUserId(identity.userEntityRef.split('/')[1] || 'guest');
  }, [identityApi]);

  const { value, loading, error } = useAsync(async () => {
    const response = await fetch(`${backendUrl}/api/kuadrant/planpolicies`);
    if (!response.ok) {
      throw new Error('failed to fetch plan policies');
    }
    const data = await response.json();

    // find plan policy for this api
    const planPolicy = data.items?.find((policy: PlanPolicy) =>
      policy.metadata.namespace === namespace
    );

    return planPolicy;
  }, []);

  const { value: apiKeys, loading: keysLoading, error: keysError } = useAsync(async () => {
    const response = await fetch(`${backendUrl}/api/kuadrant/apikeys?namespace=${namespace}&userId=${userId}`);
    if (!response.ok) {
      throw new Error('failed to fetch api keys');
    }
    const data = await response.json();
    return data.items || [];
  }, [namespace, userId, refresh]);

  const handleRequestAccess = async () => {
    if (!selectedPlan) return;

    setCreating(true);
    setCreateError(null);
    try {
      const response = await fetch(`${backendUrl}/api/kuadrant/apikeys`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          apiName,
          namespace,
          userId,
          planTier: selectedPlan,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to create API key: ${response.status}`);
      }

      setOpen(false);
      setSelectedPlan('');
      setRefresh(r => r + 1);
    } catch (err) {
      console.error('Error creating API key:', err);
      setCreateError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteKey = async (name: string) => {
    try {
      const response = await fetch(`${backendUrl}/api/kuadrant/apikeys/${namespace}/${name}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error('Failed to delete API key');
      }
      setRefresh(r => r + 1);
    } catch (err) {
      console.error('Error deleting API key:', err);
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

  if (loading || keysLoading) {
    return <Progress />;
  }

  if (error || keysError) {
    return <ResponseErrorPanel error={(error || keysError)!} />;
  }

  const plans = value?.spec?.plans || [];
  const keys = (apiKeys as ApiKey[]) || [];

  return (
    <>
      <InfoCard title="Kuadrant API Keys">
        <Box p={2}>
          {plans.length === 0 ? (
            <Typography>No plans available for this API</Typography>
          ) : (
            <>
              <Typography variant="body1" gutterBottom>
                Available Plans:
              </Typography>
              {plans.map((plan: Plan) => (
                <Box key={plan.tier} mb={2}>
                  <Typography variant="h6">{plan.tier}</Typography>
                  <Typography variant="body2" color="textSecondary">
                    Limits: {JSON.stringify(plan.limits)}
                  </Typography>
                </Box>
              ))}
              <Button
                variant="contained"
                color="primary"
                onClick={() => setOpen(true)}
                style={{ marginBottom: 16 }}
              >
                Request Access
              </Button>

              {keys.length > 0 && (
                <>
                  <Typography variant="h6" gutterBottom style={{ marginTop: 16 }}>
                    Your API Keys:
                  </Typography>
                  {keys.map((key: ApiKey) => {
                    const isVisible = visibleKeys.has(key.metadata.name);
                    const apiKey = key.data?.api_key ? atob(key.data.api_key) : 'N/A';
                    const planTier = key.metadata.annotations?.['secret.kuadrant.io/plan-id'] || 'Unknown';

                    return (
                      <Box key={key.metadata.name} mb={2} p={2} border={1} borderColor="grey.300" borderRadius={4}>
                        <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                          <Typography variant="body2" style={{ fontWeight: 'bold' }}>
                            {key.metadata.name}
                          </Typography>
                          <Chip label={planTier} color="primary" size="small" />
                        </Box>
                        <Box display="flex" alignItems="center" justifyContent="space-between">
                          <Box display="flex" alignItems="center" flex={1}>
                            <Typography
                              variant="body2"
                              style={{ fontFamily: 'monospace', marginRight: 8 }}
                            >
                              {isVisible ? apiKey : '••••••••••••••••'}
                            </Typography>
                            <IconButton
                              size="small"
                              onClick={() => toggleVisibility(key.metadata.name)}
                            >
                              {isVisible ? <VisibilityOffIcon /> : <VisibilityIcon />}
                            </IconButton>
                          </Box>
                          <IconButton
                            size="small"
                            onClick={() => handleDeleteKey(key.metadata.name)}
                            color="secondary"
                          >
                            <DeleteIcon />
                          </IconButton>
                        </Box>
                      </Box>
                    );
                  })}
                </>
              )}
            </>
          )}
        </Box>
      </InfoCard>

      <Dialog open={open} onClose={() => setOpen(false)}>
        <DialogTitle>Request API Access</DialogTitle>
        <DialogContent>
          {createError && (
            <Box mb={2} p={2} bgcolor="error.main" color="error.contrastText" borderRadius={1}>
              <Typography variant="body2">{createError}</Typography>
            </Box>
          )}
          <FormControl fullWidth>
            <InputLabel>Select Plan Tier</InputLabel>
            <Select
              value={selectedPlan}
              onChange={(e) => setSelectedPlan(e.target.value as string)}
            >
              {plans.map((plan: Plan) => (
                <MenuItem key={plan.tier} value={plan.tier}>
                  {plan.tier} - {JSON.stringify(plan.limits)}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            onClick={handleRequestAccess}
            color="primary"
            disabled={!selectedPlan || creating}
          >
            {creating ? 'Creating...' : 'Create API Key'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};
