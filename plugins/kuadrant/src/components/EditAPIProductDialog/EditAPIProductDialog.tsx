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
import { useApi } from '@backstage/core-plugin-api';
import { kuadrantApiRef } from '../../api';
import { Alert } from '@material-ui/lab';
import { Progress } from '@backstage/core-components';
import { PlanPolicyDetails } from '../PlanPolicyDetailsCard';
import { validateURL } from '../../utils/validation';
import {APIProduct, Plan} from "../../types/api-management.ts";
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

interface EditAPIProductDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  namespace: string;
  name: string;
}

export const EditAPIProductDialog = ({ open, onClose, onSuccess, namespace, name }: EditAPIProductDialogProps) => {
  const classes = useStyles();
  const kuadrantApi = useApi(kuadrantApiRef);
  const [loading, setLoading] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [description, setDescription] = useState('');
  const [version, setVersion] = useState('v1');
  const [publishStatus, setPublishStatus] = useState<'Draft' | 'Published'>('Draft');
  const [lifecycle, setLifecycle] = useState<Lifecycle>('production');
  const [approvalMode, setApprovalMode] = useState<'automatic' | 'manual'>('manual');
  const [tags, setTags] = useState<string[]>([]);
  const [targetRef, setTargetRef] = useState<any>(null);
  const [tagInput, setTagInput] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactTeam, setContactTeam] = useState('');
  const [docsURL, setDocsURL] = useState('');
  const [openAPISpec, setOpenAPISpec] = useState('');
  const [discoveredPlans, setdiscoveredPlans] = useState<Plan[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [openAPISpecError, setOpenAPISpecError] = useState<string | null>(null);

  // Load APIProduct data when dialog opens
  useEffect(() => {
    if (open && namespace && name) {
      setLoading(true);
      setError('');
      kuadrantApi.getApiProduct(namespace, name)
        .then(data => {
          setDisplayName(data.spec.displayName || '');
          setDescription(data.spec.description || '');
          setVersion(data.spec.version || 'v1');
          setPublishStatus(data.spec.publishStatus || 'Draft');
          setLifecycle(data.metadata.labels?.lifecycle as Lifecycle || 'production' as Lifecycle);
          setApprovalMode(data.spec.approvalMode || 'manual');
          setTags(data.spec.tags || []);
          setTargetRef(data.spec.targetRef || null);
          setContactEmail(data.spec.contact?.email || '');
          setContactTeam(data.spec.contact?.team || '');
          setDocsURL(data.spec.documentation?.docsURL || '');
          setOpenAPISpec(data.spec.documentation?.openAPISpecURL || '');
          setdiscoveredPlans(data.status?.discoveredPlans || []);
          setOpenAPISpecError(null);
          setLoading(false);
        })
        .catch(err => {
          setError(err.message || 'Failed to load API product');
          setLoading(false);
        });
    }
  }, [open, namespace, name, kuadrantApi]);

  useEffect(() => {
    if (open) {
      setOpenAPISpecError(null);
    }
  }, [open]);

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

  const handleSave = async () => {
    setError('');
    setSaving(true);

    // validate retired APIs cannot be published
    if (lifecycle === 'retired' && publishStatus === 'Published') {
      setError('Cannot publish a retired API product. Please set publish status to Draft.');
      setSaving(false);
      return;
    }

    try {
      const patch: Partial<APIProduct> = {
        // @ts-ignore We are applying a partial obj, not full
        metadata: {
          labels: {
            lifecycle,
          },
        },
        spec: {
          displayName,
          description,
          version,
          publishStatus,
          approvalMode,
          tags,
          targetRef,
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

      await kuadrantApi.updateApiProduct(namespace, name, patch);
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Edit API Product</DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity="error" style={{ marginBottom: 16 }}>
            {error}
          </Alert>
        )}
        {loading ? (
          <Progress />
        ) : (
          <>
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
                  disabled={saving}
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
                  disabled
                  helperText="Kubernetes resource name (immutable)"
                  margin="normal"
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
                  disabled={saving}
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
                  disabled={saving}
                  InputProps={{
                    endAdornment: tagInput ? (
                      <InputAdornment position="end">
                        <IconButton size="small" onClick={handleAddTag} disabled={saving}>
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
                        onDelete={saving ? undefined : () => handleDeleteTag(tag)}
                        size="small"
                        className={classes.tagChip}
                        disabled={saving}
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
                  disabled={saving}
                  InputLabelProps={{
                    classes: {
                      asterisk: classes.asterisk,
                    },
                  }}
                />
              </Grid>
            </Grid>

            {/* Associated route section */}
            <Box className={classes.sectionHeader}>
              <Typography variant="subtitle1"><strong>Associated route</strong></Typography>
              <Tooltip title="The HTTPRoute this API product is associated with">
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
                  disabled={saving}
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
                  disabled={saving}
                />
              </Grid>
              {targetRef && (
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label="HTTPRoute"
                    value={`${targetRef.namespace || namespace}/${targetRef.name}`}
                    disabled
                    helperText="Target HTTPRoute (immutable)"
                    margin="normal"
                  />
                </Grid>
              )}
            </Grid>

            {/* HTTPRoute policies section */}
            {targetRef && (
              <>
                <Box className={classes.sectionHeader}>
                  <Typography variant="subtitle1"><strong>HTTPRoute policies</strong></Typography>
                  <Tooltip title="Shows the associated policies and rate limit tiers for the HTTPRoute">
                    <InfoOutlinedIcon className={classes.infoIcon} />
                  </Tooltip>
                </Box>
                <PlanPolicyDetails
                  discoveredPlans={discoveredPlans}
                  alertSeverity="info"
                  alertMessage="No PlanPolicy found for this HTTPRoute."
                  includeTopMargin={false}
                />
              </>
            )}

            {/* Lifecycle and Visibility section */}
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
                  disabled={saving}
                >
                  <MenuItem value="experimental">Experimental</MenuItem>
                  <MenuItem value="production">Production</MenuItem>
                  <MenuItem value="deprecated">Deprecated</MenuItem>
                  <MenuItem value="retired">Retired</MenuItem>
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
                  helperText="Controls catalog visibility"
                  disabled={saving}
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
            <FormControl component="fieldset" disabled={saving}>
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
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>Cancel</Button>
        <Button
          onClick={handleSave}
          color="primary"
          variant="contained"
          disabled={saving || loading || !displayName || !description || !!openAPISpecError}
          startIcon={saving ? <CircularProgress size={16} color="inherit" /> : undefined}
        >
          {saving ? 'Saving...' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
