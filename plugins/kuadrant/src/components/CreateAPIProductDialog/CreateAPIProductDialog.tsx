import React, { useEffect, useState } from 'react';
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
  FormControl,
  RadioGroup,
  FormControlLabel,
  Radio,
  Tooltip,
  IconButton,
  InputAdornment,
} from '@material-ui/core';
import InfoOutlinedIcon from '@material-ui/icons/InfoOutlined';
import AddIcon from '@material-ui/icons/Add';
import { useApi, configApiRef, fetchApiRef } from '@backstage/core-plugin-api';
import { Alert } from '@material-ui/lab';
import useAsync from 'react-use/lib/useAsync';
import { PlanPolicyDetails } from '../PlanPolicyDetailsCard';
import { validateKubernetesName, validateURL } from '../../utils/validation';
import { handleFetchError } from "../../utils/errors";
import { Lifecycle } from '../../types/api-management';

const useStyles = makeStyles((theme) => ({
  asterisk: {
    color: '#f44336',
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(0.5),
    marginTop: theme.spacing(2),
    marginBottom: theme.spacing(1),
  },
  infoIcon: {
    fontSize: 18,
    color: theme.palette.text.secondary,
  },
  tagChip: {
    marginRight: theme.spacing(0.5),
    marginBottom: theme.spacing(0.5),
  },
}));

interface CreateAPIProductDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (productInfo: { namespace: string; name: string; displayName: string }) => void;
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
  const [lifecycle, setLifecycle] = useState<Lifecycle>('production');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [selectedHTTPRoute, setSelectedHTTPRoute] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactTeam, setContactTeam] = useState('');
  const [docsURL, setDocsURL] = useState('');
  const [openAPISpec, setOpenAPISpec] = useState('');
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [httpRoutesRetry, setHttpRoutesRetry] = useState(0);
  const [nameError, setNameError] = useState<string | null>(null);
  const [openAPISpecError, setOpenAPISpecError] = useState<string | null>(null);
  const {
    value: httpRoutes,
    loading: httpRoutesLoading,
    error: httpRoutesError
  } = useAsync(async () => {
    const response = await fetchApi.fetch(`${backendUrl}/api/kuadrant/httproutes`);

    if (!response.ok) {
      const error = await handleFetchError(response);
      throw new Error(`failed to fetch routes. ${error}`);
    }

    const data = await response.json();
    return data.items || [];
  }, [backendUrl, fetchApi, open, httpRoutesRetry]);

  // load planpolicies with full details to show associated plans
  const {
    value: planPolicies,
    error: planPoliciesError
  } = useAsync(async () => {
    const response = await fetchApi.fetch(`${backendUrl}/api/kuadrant/planpolicies`);

    if (!response.ok) {
      const error = await handleFetchError(response);
      throw new Error(`failed to fetch PlanPolicies. ${error}`);
    }

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

  // format tier info for dropdown display
  const formatTierInfo = (policy: any): string => {
    if (!policy?.spec?.plans) return '';
    const tiers = Object.entries(policy.spec.plans)
      .map(([name, plan]: [string, any]) => {
        const limit = plan?.limits?.requests;
        if (!limit) return name;
        return `${name}: ${limit.count}/${limit.period}`;
      })
      .join('; ');
    return tiers ? ` (${tiers})` : '';
  };

  // get policy info for a route (for dropdown display)
  const getPolicyInfoForRoute = (routeNamespace: string, routeName: string): string => {
    const policy = getPlanPolicyForRoute(routeNamespace, routeName);
    if (!policy) return 'N/A';
    return `${policy.metadata.name}${formatTierInfo(policy)}`;
  };

  useEffect(() => {
    if (open) {
      setNameError(null);
      setOpenAPISpecError(null);
    }
  }, [open]);

  // validate handlers
  const handleNameChange = (value: string) => {
    setName(value);
    setNameError(validateKubernetesName(value));
  };

  const handleOpenAPISpecChange = (value: string) => {
    setOpenAPISpec(value);
    setOpenAPISpecError(validateURL(value));
  };

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
          labels: {
            lifecycle,
          },
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
              ...(openAPISpec && { openAPISpecURL: openAPISpec }),
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
        const error = await handleFetchError(response);
        throw new Error(`failed to create APIProduct. ${error}`);
      }

      onSuccess({ namespace, name, displayName });
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
    setLifecycle('production');
    setTags([]);
    setTagInput('');
    setSelectedHTTPRoute('');
    setContactEmail('');
    setContactTeam('');
    setDocsURL('');
    setOpenAPISpec('');
    setError('');
    setNameError(null);
    setOpenAPISpecError(null);
    onClose();
  };

  const hasValidationErrors = !!nameError || !!openAPISpecError;

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
                onClick={() => setHttpRoutesRetry(prev => prev + 1)}
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
        {/* API product info section */}
        <Box className={classes.sectionHeader}>
          <Typography variant="subtitle1"><strong>API product info</strong></Typography>
        </Box>
        <Grid container spacing={2}>
          <Grid item xs={6}>
            <TextField
              fullWidth
              label="API product name"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              placeholder="My API"
              helperText="Give a unique name for your API product"
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
              label="Resource name"
              value={name}
              onChange={e => handleNameChange(e.target.value)}
              placeholder="my-api"
              helperText={nameError || "Kubernetes resource name with lowercase, hyphens. Eg.flight_API"}
              error={!!nameError}
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
              helperText="Give a version to your API product"
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
              label="Tag"
              value={tagInput}
              onChange={e => setTagInput(e.target.value)}
              onKeyPress={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddTag();
                }
              }}
              placeholder="Add tag"
              helperText="Add a tag to your API product"
              margin="normal"
              disabled={creating}
              InputProps={{
                endAdornment: tagInput ? (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={handleAddTag} disabled={creating}>
                      <AddIcon fontSize="small" />
                    </IconButton>
                  </InputAdornment>
                ) : undefined,
              }}
            />
          </Grid>
          {tags.length > 0 && (
            <Grid item xs={12}>
              <Box display="flex" flexWrap="wrap">
                {tags.map(tag => (
                  <Chip
                    key={tag}
                    label={tag}
                    onDelete={creating ? undefined : () => handleDeleteTag(tag)}
                    size="small"
                    className={classes.tagChip}
                    disabled={creating}
                  />
                ))}
              </Box>
            </Grid>
          )}
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
        </Grid>

        {/* Add API and Associate route section */}
        <Box className={classes.sectionHeader}>
          <Typography variant="subtitle1"><strong>Add API and Associate route</strong></Typography>
          <Tooltip title="Register an existing API and associate HTTPRoute for your API product">
            <InfoOutlinedIcon className={classes.infoIcon} />
          </Tooltip>
        </Box>
        <Grid container spacing={2}>
          <Grid item xs={12}>
            <TextField
              fullWidth
              label="OpenAPI Spec URL"
              value={openAPISpec}
              onChange={e => handleOpenAPISpecChange(e.target.value)}
              placeholder="https://api.example.com/openapi.json"
              helperText={openAPISpecError || "Enter the full path to your API spec file"}
              error={!!openAPISpecError}
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
          <Grid item xs={12}>
            <TextField
              fullWidth
              label="Documentation URL"
              value={docsURL}
              onChange={e => setDocsURL(e.target.value)}
              placeholder="https://docs.example.com/api"
              helperText="Link to external documentation for this API"
              margin="normal"
              disabled={creating}
            />
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
                  : "Select an HTTPRoute. APIProduct will be created in the same namespace."
              }
              error={!!httpRoutesError}
              disabled={httpRoutesLoading || creating || !!httpRoutesError}
              InputLabelProps={{
                classes: {
                  asterisk: classes.asterisk,
                },
              }}
              SelectProps={{
                'data-testid': 'httproute-select',
              } as any}
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
              {!httpRoutesLoading && !httpRoutesError && httpRoutes && httpRoutes.map((route: any) => {
                const routeNs = route.metadata.namespace;
                const routeName = route.metadata.name;
                const policyInfo = getPolicyInfoForRoute(routeNs, routeName);
                return (
                  <MenuItem
                    key={`${routeNs}/${routeName}`}
                    value={`${routeNs}/${routeName}`}
                  >
                    <Box>
                      <Typography variant="body1">{routeName}</Typography>
                      <Typography variant="caption" color="textSecondary">
                        Associated PlanPolicy: {policyInfo}
                      </Typography>
                    </Box>
                  </MenuItem>
                );
              })}
            </TextField>
          </Grid>
        </Grid>

        {/* HTTPRoute policies section */}
        {selectedHTTPRoute && selectedPolicy && (
          <>
            <Box className={classes.sectionHeader}>
              <Typography variant="subtitle1"><strong>HTTPRoute policies</strong></Typography>
              <Tooltip title="Shows the associated policies and rate limit tiers for the selected HTTPRoute">
                <InfoOutlinedIcon className={classes.infoIcon} />
              </Tooltip>
            </Box>
            <PlanPolicyDetails
              discoveredPlans={selectedPolicy.plans}
              alertSeverity="warning"
              alertMessage="No PlanPolicy found for this HTTPRoute. API keys and rate limiting may not be available."
              includeTopMargin={false}
            />
          </>
        )}

        <Box className={classes.sectionHeader}>
          <Typography variant="subtitle1"><strong>Lifecycle and Visibility</strong></Typography>
          <Tooltip title="Control the lifecycle state and catalog visibility of this API product">
            <InfoOutlinedIcon className={classes.infoIcon} />
          </Tooltip>
        </Box>
        <Grid container spacing={2}>
          <Grid item xs={6}>
            <TextField
              fullWidth
              select
              label="Lifecycle"
              value={lifecycle}
              onChange={e => setLifecycle(e.target.value as Lifecycle)}
              margin="normal"
              helperText="API lifecycle state"
              disabled={creating}
            >
              <MenuItem value="experimental">Experimental</MenuItem>
              <MenuItem value="production">Production</MenuItem>
              <MenuItem value="deprecated">Deprecated</MenuItem>
            </TextField>
          </Grid>
          <Grid item xs={6}>
            <TextField
              fullWidth
              select
              label="Publish Status"
              value={publishStatus}
              onChange={e => setPublishStatus(e.target.value as 'Draft' | 'Published')}
              margin="normal"
              helperText="Controls catalog visibility (Draft = hidden from consumers)"
              disabled={creating}
            >
              <MenuItem value="Draft">Draft</MenuItem>
              <MenuItem value="Published">Published</MenuItem>
            </TextField>
          </Grid>
        </Grid>

        {/* API Key approval section */}
        <Box className={classes.sectionHeader}>
          <Typography variant="subtitle1"><strong>API Key approval</strong></Typography>
          <Tooltip title="Choose how API key requests are handled for this product">
            <InfoOutlinedIcon className={classes.infoIcon} />
          </Tooltip>
        </Box>
        <FormControl component="fieldset" disabled={creating}>
          <RadioGroup
            row
            value={approvalMode}
            onChange={e => setApprovalMode(e.target.value as 'automatic' | 'manual')}
          >
            <FormControlLabel
              value="manual"
              control={<Radio color="primary" />}
              label={
                <Box>
                  <Typography variant="body2">Need manual approval</Typography>
                  <Typography variant="caption" color="textSecondary">
                    Requires approval for requesting this API
                  </Typography>
                </Box>
              }
            />
            <FormControlLabel
              value="automatic"
              control={<Radio color="primary" />}
              label={
                <Box>
                  <Typography variant="body2">Automatic</Typography>
                  <Typography variant="caption" color="textSecondary">
                    Keys are created without need to be approved
                  </Typography>
                </Box>
              }
            />
          </RadioGroup>
        </FormControl>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={creating}>Cancel</Button>
        <Button
          onClick={handleCreate}
          color="primary"
          variant="contained"
          disabled={creating || !name || !displayName || !description || !selectedHTTPRoute || hasValidationErrors}
          startIcon={creating ? <CircularProgress size={16} color="inherit" /> : undefined}
        >
          {creating ? 'Creating...' : 'Create'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
