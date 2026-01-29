import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Typography,
  CircularProgress,
  FormHelperText,
} from '@material-ui/core';
import {
  useApi,
  configApiRef,
  fetchApiRef,
  alertApiRef,
  identityApiRef,
} from '@backstage/core-plugin-api';
import useAsync from 'react-use/lib/useAsync';

export interface SimpleRequestAccessDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

type ApiProduct = {
  metadata: {
    name: string;
    namespace: string;
  };
  spec?: {
    publishStatus?: string;
  };
  status?: {
    discoveredPlans?: Array<{
      tier: string;
      limits?: Record<string, number>;
    }>;
  };
};

export const SimpleRequestAccessDialog = ({
  open,
  onClose,
  onSuccess,
}: SimpleRequestAccessDialogProps) => {
  const config = useApi(configApiRef);
  const fetchApi = useApi(fetchApiRef);
  const alertApi = useApi(alertApiRef);
  const identityApi = useApi(identityApiRef);
  const backendUrl = config.getString('backend.baseUrl');

  const [selectedApi, setSelectedApi] = useState('');
  const [selectedTier, setSelectedTier] = useState('');
  const [useCase, setUseCase] = useState('');
  const [creating, setCreating] = useState(false);

  // Fetch all published API products
  const {
    value: apiProducts,
    loading: loadingProducts,
  } = useAsync(async () => {
    if (!open) return [];
    const response = await fetchApi.fetch(
      `${backendUrl}/api/kuadrant/apiproducts`,
    );
    if (!response.ok) {
      throw new Error('Failed to fetch API products');
    }
    const data = await response.json();
    // Filter to only show Published products
    return (data.items || []).filter(
      (p: ApiProduct) => p.spec?.publishStatus === 'Published',
    );
  }, [backendUrl, fetchApi, open]);

  // Get user email
  const { value: userEmail } = useAsync(async () => {
    const identity = await identityApi.getBackstageIdentity();

    // Extract username from userEntityRef (e.g., "user:default/john" -> "john")
    const username = identity.userEntityRef.split('/')[1] || 'unknown';

    // Construct email from username
    return `${username}@example.com`;
  }, [identityApi]);

  // Get available tiers for selected API
  const selectedProduct = apiProducts?.find(
    (p: ApiProduct) =>
      `${p.metadata.namespace}/${p.metadata.name}` === selectedApi,
  );
  const availableTiers = selectedProduct?.status?.discoveredPlans || [];

  const handleClose = () => {
    setSelectedApi('');
    setSelectedTier('');
    setUseCase('');
    onClose();
  };

  const handleSubmit = async () => {
    if (!selectedApi || !selectedTier) return;

    const [namespace, apiProductName] = selectedApi.split('/');

    setCreating(true);
    try {
      const response = await fetchApi.fetch(
        `${backendUrl}/api/kuadrant/requests`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            apiProductName,
            namespace,
            planTier: selectedTier,
            useCase: useCase.trim() || '',
            userEmail: userEmail || 'unknown',
          }),
        },
      );

      if (!response.ok) {
        let errorData;
        try {
          errorData = await response.json();
        } catch {
          errorData = { error: `Server returned ${response.status} ${response.statusText}` };
        }

        console.error('Backend error response:', {
          status: response.status,
          statusText: response.statusText,
          errorData,
          requestBody: {
            apiProductName,
            namespace,
            planTier: selectedTier,
            useCase: useCase.trim() || '',
            userEmail: userEmail || 'unknown',
          }
        });

        // Extract user-friendly error message
        const rawError = errorData.error || errorData.message || `Server returned ${response.status}`;

        // Try to extract validation error details from Kubernetes error messages
        // Example: "failed to create apikeys: APIKey.devportal.kuadrant.io "name" is invalid: spec.requestedBy.email: Invalid value: "admin": spec.requestedBy.email in body should match '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'"
        let errorMsg = rawError;

        if (rawError.includes('spec.requestedBy.email')) {
          errorMsg = 'Invalid email format. Please contact your administrator to update your profile email.';
        } else if (rawError.includes('is invalid:')) {
          // Extract the validation message after "is invalid:"
          const match = rawError.match(/is invalid: (.+?)(?:\s+\(|$)/);
          if (match) {
            errorMsg = `Validation error: ${match[1]}`;
          }
        } else if (response.status === 403) {
          errorMsg = 'You do not have permission to request access to this API.';
        } else if (response.status === 404) {
          errorMsg = 'The selected API or tier was not found.';
        } else if (response.status >= 500) {
          errorMsg = `Server error: ${rawError}`;
        }

        throw new Error(errorMsg);
      }

      alertApi.post({
        message: 'API key requested successfully',
        severity: 'success',
        display: 'transient',
      });

      handleClose();
      onSuccess();
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'unknown error occurred';
      console.error('Failed to create API key request:', {
        error: err,
        selectedApi,
        selectedTier,
        userEmail,
      });
      alertApi.post({
        message: `Failed to request API key: ${errorMessage}`,
        severity: 'error',
        display: 'permanent',
      });
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Request API key</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="textSecondary">
          Submit your request to generate an API key.
        </Typography>

        <FormControl fullWidth margin="normal" disabled={creating || loadingProducts}>
          <InputLabel id="api-select-label" required>
            API
          </InputLabel>
          <Select
            labelId="api-select-label"
            value={selectedApi}
            onChange={e => {
              setSelectedApi(e.target.value as string);
              setSelectedTier(''); // Reset tier when API changes
            }}
            disabled={creating || loadingProducts}
            data-testid="api-select"
          >
            {loadingProducts ? (
              <MenuItem disabled>Loading...</MenuItem>
            ) : (
              apiProducts?.map((product: ApiProduct) => (
                <MenuItem
                  key={`${product.metadata.namespace}/${product.metadata.name}`}
                  value={`${product.metadata.namespace}/${product.metadata.name}`}
                >
                  {product.metadata.name}
                </MenuItem>
              ))
            )}
          </Select>
          <FormHelperText>
            Select one API. Please submit separate requests for multiple APIs.
          </FormHelperText>
        </FormControl>

        <FormControl
          fullWidth
          margin="normal"
          disabled={creating || !selectedApi}
          required
        >
          <InputLabel id="tier-select-label">Tiers</InputLabel>
          <Select
            labelId="tier-select-label"
            value={selectedTier}
            onChange={e => setSelectedTier(e.target.value as string)}
            disabled={creating || !selectedApi}
            data-testid="tier-select"
          >
            {!selectedApi ? (
              <MenuItem disabled>Select an API first</MenuItem>
            ) : availableTiers.length === 0 ? (
              <MenuItem disabled>No tiers available</MenuItem>
            ) : (
              availableTiers.map((plan: { tier: string; limits?: Record<string, number> }) => {
                const limitDesc = Object.entries(plan.limits || {})
                  .map(([key, val]) => `${val} per ${key}`)
                  .join(', ');
                return (
                  <MenuItem key={plan.tier} value={plan.tier}>
                    {plan.tier} {limitDesc ? `(${limitDesc})` : ''}
                  </MenuItem>
                );
              })
            )}
          </Select>
          <FormHelperText>Select an API to view available tiers.</FormHelperText>
        </FormControl>

        <TextField
          label="Use case"
          placeholder="Briefly describe your specific use case of using this API key"
          multiline
          rows={2}
          fullWidth
          margin="normal"
          value={useCase}
          onChange={e => setUseCase(e.target.value)}
          disabled={creating}
          inputProps={{ 'data-testid': 'usecase-input' }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={creating} data-testid="cancel-button">
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          color="primary"
          variant="contained"
          disabled={!selectedApi || !selectedTier || creating}
          startIcon={
            creating ? (
              <CircularProgress size={16} color="inherit" />
            ) : undefined
          }
          data-testid="submit-button"
        >
          {creating ? 'Submitting...' : 'Request'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
