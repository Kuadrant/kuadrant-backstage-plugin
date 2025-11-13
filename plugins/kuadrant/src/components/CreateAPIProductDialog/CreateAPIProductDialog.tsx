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
  const [displayName, setDisplayName] = useState('');
  const [description, setDescription] = useState('');
  const [version, setVersion] = useState('v1');
  const [approvalMode, setApprovalMode] = useState<'automatic' | 'manual'>('manual');
  const [publishStatus, setPublishStatus] = useState<'Draft' | 'Published'>('Published');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [selectedHTTPRoute, setSelectedHTTPRoute] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactTeam, setContactTeam] = useState('');
  const [docsURL, setDocsURL] = useState('');
  const [openAPISpec, setOpenAPISpec] = useState('');
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);

  const { value: httpRoutes, loading: httpRoutesLoading } = useAsync(async () => {
    const response = await fetchApi.fetch(`${backendUrl}/api/kuadrant/httproutes`);
    const data = await response.json();
    // filter to only show httproutes annotated for backstage exposure
    return (data.items || []).filter((route: any) =>
      route.metadata.annotations?.['backstage.io/expose'] === 'true'
    );
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
      if (!selectedHTTPRoute) {
        throw new Error('Please select an HTTPRoute');
      }

      const [selectedRouteNamespace, selectedRouteName] = selectedHTTPRoute.split('/');

      // derive namespace from selected httproute
      const namespace = selectedRouteNamespace;

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
          publishStatus,
          tags,
          targetRef: {
            group: 'gateway.networking.k8s.io',
            kind: 'HTTPRoute',
            name: selectedRouteName,
            namespace: selectedRouteNamespace,
          },
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
    setDisplayName('');
    setDescription('');
    setVersion('v1');
    setApprovalMode('manual');
    setPublishStatus('Published');
    setTags([]);
    setTagInput('');
    setSelectedHTTPRoute('');
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
              select
              label="Publish Status"
              value={publishStatus}
              onChange={e => setPublishStatus(e.target.value as 'Draft' | 'Published')}
              margin="normal"
              helperText="Draft: hidden from catalog. Published: visible to consumers."
            >
              <MenuItem value="Draft">Draft</MenuItem>
              <MenuItem value="Published">Published</MenuItem>
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
            <Box display="flex" flexWrap="wrap" marginBottom={1} style={{ gap: 8 }}>
              {tags.map(tag => (
                <Chip
                  key={tag}
                  label={tag}
                  onDelete={() => handleDeleteTag(tag)}
                  size="small"
                />
              ))}
            </Box>
            <Box display="flex" style={{ gap: 8 }}>
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
              label="HTTPRoute"
              value={selectedHTTPRoute}
              onChange={e => setSelectedHTTPRoute(e.target.value)}
              margin="normal"
              required
              helperText="Select an HTTPRoute (backstage.io/expose: true). APIProduct will be created in the same namespace."
              disabled={httpRoutesLoading}
            >
              {httpRoutesLoading && (
                <MenuItem value="">Loading...</MenuItem>
              )}
              {!httpRoutesLoading && httpRoutes && httpRoutes.length === 0 && (
                <MenuItem value="">No HTTPRoutes available</MenuItem>
              )}
              {!httpRoutesLoading && httpRoutes && httpRoutes.map((route: any) => (
                <MenuItem
                  key={`${route.metadata.namespace}/${route.metadata.name}`}
                  value={`${route.metadata.namespace}/${route.metadata.name}`}
                >
                  {route.metadata.name} ({route.metadata.namespace})
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
          disabled={creating || !name || !displayName || !description || !selectedHTTPRoute}
        >
          {creating ? 'Creating...' : 'Create'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
