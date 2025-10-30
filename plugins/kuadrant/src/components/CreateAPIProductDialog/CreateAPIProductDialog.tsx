import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Typography,
  Chip,
  Grid,
  MenuItem,
} from '@material-ui/core';
import { useApi, configApiRef, fetchApiRef } from '@backstage/core-plugin-api';
import { Alert } from '@material-ui/lab';
import useAsync from 'react-use/lib/useAsync';

interface CreateAPIProductDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const CreateAPIProductDialog = ({ open, onClose, onSuccess }: CreateAPIProductDialogProps) => {
  const config = useApi(configApiRef);
  const fetchApi = useApi(fetchApiRef);
  const backendUrl = config.getString('backend.baseUrl');

  const [name, setName] = useState('');
  const [namespace, setNamespace] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [description, setDescription] = useState('');
  const [version, setVersion] = useState('v1');
  const [approvalMode, setApprovalMode] = useState<'automatic' | 'manual'>('manual');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [selectedPlanPolicy, setSelectedPlanPolicy] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactTeam, setContactTeam] = useState('');
  const [docsURL, setDocsURL] = useState('');
  const [openAPISpec, setOpenAPISpec] = useState('');
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);

  const { value: planPolicies, loading: planPoliciesLoading } = useAsync(async () => {
    const response = await fetchApi.fetch(`${backendUrl}/api/kuadrant/planpolicies`);
    const data = await response.json();
    return data.items || [];
  }, [backendUrl, fetchApi, open]);

  const handleAddTag = () => {
    if (tagInput.trim() && !tags.includes(tagInput.trim())) {
      setTags([...tags, tagInput.trim()]);
      setTagInput('');
    }
  };

  const handleDeleteTag = (tagToDelete: string) => {
    setTags(tags.filter(tag => tag !== tagToDelete));
  };

  const handleCreate = async () => {
    setError('');
    setCreating(true);

    try {
      if (!selectedPlanPolicy) {
        throw new Error('Please select a PlanPolicy');
      }

      const [selectedPlanNamespace, selectedPlanName] = selectedPlanPolicy.split('/');

      const apiProduct = {
        apiVersion: 'extensions.kuadrant.io/v1alpha1',
        kind: 'APIProduct',
        metadata: {
          name,
          namespace,
        },
        spec: {
          displayName,
          description,
          version,
          approvalMode,
          tags,
          planPolicyRef: {
            name: selectedPlanName,
            namespace: selectedPlanNamespace,
          },
          plans: [], // controller will inject plans from planPolicyRef
          ...(contactEmail || contactTeam ? {
            contact: {
              ...(contactEmail && { email: contactEmail }),
              ...(contactTeam && { team: contactTeam }),
            },
          } : {}),
          ...(docsURL || openAPISpec ? {
            documentation: {
              ...(docsURL && { docsURL }),
              ...(openAPISpec && { openAPISpec }),
            },
          } : {}),
        },
      };

      const response = await fetchApi.fetch(`${backendUrl}/api/kuadrant/apiproducts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(apiProduct),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'failed to create apiproduct');
      }

      onSuccess();
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreating(false);
    }
  };

  const handleClose = () => {
    setName('');
    setNamespace('');
    setDisplayName('');
    setDescription('');
    setVersion('v1');
    setApprovalMode('manual');
    setTags([]);
    setTagInput('');
    setSelectedPlanPolicy('');
    setContactEmail('');
    setContactTeam('');
    setDocsURL('');
    setOpenAPISpec('');
    setError('');
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle>Create API Product</DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity="error" style={{ marginBottom: 16 }}>
            {error}
          </Alert>
        )}

        <Grid container spacing={2}>
          <Grid item xs={6}>
            <TextField
              fullWidth
              label="Name"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="my-api"
              helperText="Kubernetes resource name (lowercase, hyphens)"
              margin="normal"
              required
            />
          </Grid>
          <Grid item xs={6}>
            <TextField
              fullWidth
              label="Namespace"
              value={namespace}
              onChange={e => setNamespace(e.target.value)}
              placeholder="default"
              margin="normal"
              required
            />
          </Grid>
          <Grid item xs={6}>
            <TextField
              fullWidth
              label="Display Name"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              placeholder="My API"
              margin="normal"
              required
            />
          </Grid>
          <Grid item xs={6}>
            <TextField
              fullWidth
              label="Version"
              value={version}
              onChange={e => setVersion(e.target.value)}
              placeholder="v1"
              margin="normal"
            />
          </Grid>
          <Grid item xs={12}>
            <TextField
              fullWidth
              select
              label="Approval Mode"
              value={approvalMode}
              onChange={e => setApprovalMode(e.target.value as 'automatic' | 'manual')}
              margin="normal"
              helperText="Automatic: keys are created immediately. Manual: requires approval."
            >
              <MenuItem value="manual">Manual</MenuItem>
              <MenuItem value="automatic">Automatic</MenuItem>
            </TextField>
          </Grid>
          <Grid item xs={12}>
            <TextField
              fullWidth
              label="Description"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="API description"
              margin="normal"
              multiline
              rows={2}
              required
            />
          </Grid>

          <Grid item xs={12}>
            <Typography variant="subtitle2" gutterBottom style={{ marginTop: 16 }}>
              Tags
            </Typography>
            <Box display="flex" gap={1} flexWrap="wrap" marginBottom={1}>
              {tags.map(tag => (
                <Chip
                  key={tag}
                  label={tag}
                  onDelete={() => handleDeleteTag(tag)}
                  size="small"
                />
              ))}
            </Box>
            <Box display="flex" gap={1}>
              <TextField
                fullWidth
                size="small"
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyPress={e => e.key === 'Enter' && handleAddTag()}
                placeholder="Add tag"
              />
              <Button onClick={handleAddTag} variant="outlined" size="small">
                Add
              </Button>
            </Box>
          </Grid>

          <Grid item xs={12}>
            <TextField
              fullWidth
              select
              label="PlanPolicy"
              value={selectedPlanPolicy}
              onChange={e => setSelectedPlanPolicy(e.target.value)}
              margin="normal"
              required
              helperText="Select an existing PlanPolicy resource"
              disabled={planPoliciesLoading}
            >
              {planPoliciesLoading && (
                <MenuItem value="">Loading...</MenuItem>
              )}
              {!planPoliciesLoading && planPolicies && planPolicies.length === 0 && (
                <MenuItem value="">No PlanPolicies available</MenuItem>
              )}
              {!planPoliciesLoading && planPolicies && planPolicies.map((policy: any) => (
                <MenuItem
                  key={`${policy.metadata.namespace}/${policy.metadata.name}`}
                  value={`${policy.metadata.namespace}/${policy.metadata.name}`}
                >
                  {policy.metadata.name} ({policy.metadata.namespace})
                </MenuItem>
              ))}
            </TextField>
          </Grid>

          <Grid item xs={6}>
            <TextField
              fullWidth
              label="Contact Email"
              value={contactEmail}
              onChange={e => setContactEmail(e.target.value)}
              placeholder="api-team@example.com"
              margin="normal"
            />
          </Grid>
          <Grid item xs={6}>
            <TextField
              fullWidth
              label="Contact Team"
              value={contactTeam}
              onChange={e => setContactTeam(e.target.value)}
              placeholder="platform-team"
              margin="normal"
            />
          </Grid>
          <Grid item xs={6}>
            <TextField
              fullWidth
              label="Docs URL"
              value={docsURL}
              onChange={e => setDocsURL(e.target.value)}
              placeholder="https://api.example.com/docs"
              margin="normal"
            />
          </Grid>
          <Grid item xs={6}>
            <TextField
              fullWidth
              label="OpenAPI Spec URL"
              value={openAPISpec}
              onChange={e => setOpenAPISpec(e.target.value)}
              placeholder="https://api.example.com/openapi.json"
              margin="normal"
            />
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Cancel</Button>
        <Button
          onClick={handleCreate}
          color="primary"
          variant="contained"
          disabled={creating || !name || !namespace || !displayName || !description || !selectedPlanPolicy}
        >
          {creating ? 'Creating...' : 'Create'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
