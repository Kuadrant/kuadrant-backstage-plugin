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
  CircularProgress,
  makeStyles,
} from '@material-ui/core';
import { useApi, configApiRef, fetchApiRef } from '@backstage/core-plugin-api';
import { Alert } from '@material-ui/lab';
import useAsync from 'react-use/lib/useAsync';
import { PlanPolicyDetails } from '../PlanPolicyDetailsCard';

const useStyles = makeStyles({
  asterisk: {
    color: '#f44336',
  },
});

interface CreateAPIProductDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const CreateAPIProductDialog = ({ open, onClose, onSuccess }: CreateAPIProductDialogProps) => {
  const classes = useStyles();
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

  const {
    value: httpRoutes,
    loading: httpRoutesLoading,
    error: httpRoutesError
  } = useAsync(async () => {
    const response = await fetchApi.fetch(`${backendUrl}/api/kuadrant/httproutes`);
    const data = await response.json();
    // filter to only show httproutes annotated for backstage exposure
    return (data.items || []).filter((route: any) =>
      route.metadata.annotations?.['backstage.io/expose'] === 'true'
    );
  }, [backendUrl, fetchApi, open]);

  // load planpolicies with full details to show associated plans
  const {
    value: planPolicies,
    error: planPoliciesError
  } = useAsync(async () => {
    const response = await fetchApi.fetch(`${backendUrl}/api/kuadrant/planpolicies`);
    return await response.json();
  }, [backendUrl, fetchApi, open]);

  // find planpolicy associated with selected httproute
  const getPlanPolicyForRoute = (routeNamespace: string, routeName: string) => {
    if (!planPolicies?.items) return null;

    return planPolicies.items.find((pp: any) => {
      const ref = pp.targetRef;
      return (
        ref?.kind === 'HTTPRoute' &&
        ref?.name === routeName &&
        (!ref?.namespace || ref?.namespace === routeNamespace)
      );
    });
  };

  const selectedRouteInfo = selectedHTTPRoute ? selectedHTTPRoute.split('/') : null;
  const selectedPolicy = selectedRouteInfo
    ? getPlanPolicyForRoute(selectedRouteInfo[0], selectedRouteInfo[1])
    : null;

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
        apiVersion: 'devportal.kuadrant.io/v1alpha1',
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
        {httpRoutesError && (
          <Alert severity="error" style={{ marginBottom: 16 }}>
            <strong>Failed to load HTTPRoutes:</strong> {httpRoutesError.message}
            <Box mt={1}>
              <Button
                size="small"
                variant="outlined"
                onClick={() => window.location.reload()}
              >
                Retry
              </Button>
            </Box>
          </Alert>
        )}

        {planPoliciesError && (
          <Alert severity="warning" style={{ marginBottom: 16 }}>
            <strong>Failed to load PlanPolicies:</strong> {planPoliciesError.message}
            <Typography variant="body2" style={{ marginTop: 8 }}>
              You can still create the API Product, but plan information may be incomplete.
            </Typography>
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
              disabled={creating}
              InputLabelProps={{
                classes: {
                  asterisk: classes.asterisk,
                },
              }}
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
              disabled={creating}
              InputLabelProps={{
                classes: {
                  asterisk: classes.asterisk,
                },
              }}
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
              disabled={creating}
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
              disabled={creating}
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
              disabled={creating}
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
              disabled={creating}
              InputLabelProps={{
                classes: {
                  asterisk: classes.asterisk,
                },
              }}
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
                  onDelete={creating ? undefined : () => handleDeleteTag(tag)}
                  size="small"
                  disabled={creating}
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
                disabled={creating}
              />
              <Button onClick={handleAddTag} variant="outlined" size="small" disabled={creating}>
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
              helperText={
                httpRoutesError
                  ? "Unable to load HTTPRoutes. Please retry."
                  : "Select an HTTPRoute (backstage.io/expose: true). APIProduct will be created in the same namespace."
              }
              error={!!httpRoutesError}
              disabled={httpRoutesLoading || creating || !!httpRoutesError}
              InputLabelProps={{
                classes: {
                  asterisk: classes.asterisk,
                },
              }}
            >
              {httpRoutesLoading && (
                <MenuItem value="">Loading...</MenuItem>
              )}
              {httpRoutesError && (
                <MenuItem value="">Error loading routes</MenuItem>
              )}
              {!httpRoutesLoading && !httpRoutesError && httpRoutes && httpRoutes.length === 0 && (
                <MenuItem value="">No HTTPRoutes available</MenuItem>
              )}
              {!httpRoutesLoading && !httpRoutesError && httpRoutes && httpRoutes.map((route: any) => (
                <MenuItem
                  key={`${route.metadata.namespace}/${route.metadata.name}`}
                  value={`${route.metadata.namespace}/${route.metadata.name}`}
                >
                  {route.metadata.name} ({route.metadata.namespace})
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          {selectedHTTPRoute && (
            <Grid item xs={12}>
              <PlanPolicyDetails
                selectedPolicy={selectedPolicy}
                alertSeverity="warning"
                alertMessage="No PlanPolicy found for this HTTPRoute. API keys and rate limiting may not be available."
                includeTopMargin={true}
              />
            </Grid>
          )}

          <Grid item xs={6}>
            <TextField
              fullWidth
              label="Contact Email"
              value={contactEmail}
              onChange={e => setContactEmail(e.target.value)}
              placeholder="api-team@example.com"
              margin="normal"
              disabled={creating}
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
              disabled={creating}
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
              disabled={creating}
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
              disabled={creating}
            />
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={creating}>Cancel</Button>
        <Button
          onClick={handleCreate}
          color="primary"
          variant="contained"
          disabled={creating || !name || !displayName || !description || !selectedHTTPRoute}
          startIcon={creating ? <CircularProgress size={16} color="inherit" /> : undefined}
        >
          {creating ? 'Creating...' : 'Create'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
