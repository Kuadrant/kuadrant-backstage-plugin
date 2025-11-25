import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  CircularProgress,
} from '@material-ui/core';
import { useApi, configApiRef, fetchApiRef } from '@backstage/core-plugin-api';
import { APIKeyRequest } from '../../types/api-management';

interface EditAPIKeyRequestDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  request: APIKeyRequest;
  availablePlans: Array<{
    tier: string;
    description?: string;
    limits?: any;
  }>;
}

export const EditAPIKeyRequestDialog = ({
  open,
  onClose,
  onSuccess,
  request,
  availablePlans,
}: EditAPIKeyRequestDialogProps) => {
  const config = useApi(configApiRef);
  const fetchApi = useApi(fetchApiRef);
  const backendUrl = config.getString('backend.baseUrl');

  const [planTier, setPlanTier] = useState('');
  const [useCase, setUseCase] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open && request) {
      setPlanTier(request.spec.planTier || '');
      setUseCase(request.spec.useCase || '');
      setError('');
    }
  }, [open, request]);

  const handleSave = async () => {
    if (!planTier) {
      setError('Please select a plan tier');
      return;
    }

    setError('');
    setSaving(true);

    try {
      const patch = {
        spec: {
          planTier,
          useCase: useCase.trim(),
        },
      };

      const response = await fetchApi.fetch(
        `${backendUrl}/api/kuadrant/requests/${request.metadata.namespace}/${request.metadata.name}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(patch),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to update request: ${response.status}`);
      }

      onSuccess();
      onClose();
    } catch (err) {
      console.error('Error updating API key request:', err);
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    if (!saving) {
      setError('');
      onClose();
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Edit API Access Request</DialogTitle>
      <DialogContent>
        {error && (
          <Box mb={2} p={2} bgcolor="error.main" color="error.contrastText" borderRadius={1}>
            <Typography variant="body2">{error}</Typography>
          </Box>
        )}

        <FormControl fullWidth margin="normal">
          <InputLabel>Plan Tier</InputLabel>
          <Select
            value={planTier}
            onChange={(e) => setPlanTier(e.target.value as string)}
            disabled={saving}
          >
            {availablePlans.map((plan) => {
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
          label="Use Case"
          placeholder="Describe how you plan to use this API"
          multiline
          rows={3}
          fullWidth
          margin="normal"
          value={useCase}
          onChange={(e) => setUseCase(e.target.value)}
          disabled={saving}
          helperText="Explain your intended use of this API for admin review"
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={saving}>
          Cancel
        </Button>
        <Button
          onClick={handleSave}
          color="primary"
          variant="contained"
          disabled={!planTier || saving}
          startIcon={saving ? <CircularProgress size={16} color="inherit" /> : undefined}
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
