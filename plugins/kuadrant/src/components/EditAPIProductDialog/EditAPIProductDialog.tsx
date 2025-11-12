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
  makeStyles,
} from '@material-ui/core';
import { useApi, configApiRef, fetchApiRef } from '@backstage/core-plugin-api';
import { Alert } from '@material-ui/lab';
import { Progress } from '@backstage/core-components';
import useAsync from 'react-use/lib/useAsync';

const useStyles = makeStyles({
  asterisk: {
    color: '#f44336',
  },
});

interface EditAPIProductDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  namespace: string;
  name: string;
}

export const EditAPIProductDialog = ({open, onClose, onSuccess, namespace, name}: EditAPIProductDialogProps) => {
  const classes = useStyles();
  const config = useApi(configApiRef);
  const fetchApi = useApi(fetchApiRef);
  const backendUrl = config.getString('backend.baseUrl');
  const [loading, setLoading] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [description, setDescription] = useState('');
  const [version, setVersion] = useState('v1');
  const [publishStatus, setPublishStatus] = useState<'Draft' | 'Published'>('Draft');
  const [approvalMode, setApprovalMode] = useState<'automatic' | 'manual'>('manual');
  const [tags, setTags] = useState<string[]>([]);
  const [targetRef, setTargetRef] = useState<any>(null);
  const [tagInput, setTagInput] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactTeam, setContactTeam] = useState('');
  const [docsURL, setDocsURL] = useState('');
  const [openAPISpec, setOpenAPISpec] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // Load APIProduct data when dialog opens
  useEffect(() => {
    if (open && namespace && name) {
      setLoading(true);
      setError('');

      fetchApi.fetch(`${backendUrl}/api/kuadrant/apiproducts/${namespace}/${name}`)
        .then(res => res.json())
        .then(data => {
          setDisplayName(data.spec.displayName || '');
          setDescription(data.spec.description || '');
          setVersion(data.spec.version || 'v1');
          setPublishStatus(data.spec.publishStatus || 'Draft');
          setApprovalMode(data.spec.approvalMode || 'manual');
          setTags(data.spec.tags || []);
          setTargetRef(data.spec.targetRef || null);
          setContactEmail(data.spec.contact?.email || '');
          setContactTeam(data.spec.contact?.team || '');
          setDocsURL(data.spec.documentation?.docsURL || '');
          setOpenAPISpec(data.spec.documentation?.openAPISpec || '');
          setLoading(false);
        })
        .catch(err => {
          setError(err.message || 'Failed to load API Product');
          setLoading(false);
        });
    }
  }, [open, namespace, name, backendUrl, fetchApi]);

  // load planpolicies with full details to show associated plans
  const { value: planPolicies } = useAsync(async () => {
    if (!open) return null;
    const response = await fetchApi.fetch(`${backendUrl}/api/kuadrant/planpolicies`);
    return await response.json();
  }, [backendUrl, fetchApi, open]);

  // find planpolicy associated with targetRef
  const selectedPolicy = React.useMemo(() => {
    if (!planPolicies?.items || !targetRef) return null;

    return planPolicies.items.find((pp: any) => {
      const ref = pp.targetRef;
      return (
        ref?.kind === 'HTTPRoute' &&
        ref?.name === targetRef.name &&
        (!ref?.namespace || ref?.namespace === (targetRef.namespace || namespace))
      );
    });
  }, [planPolicies, targetRef, namespace]);

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

    try {
      const patch = {
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
              ...(openAPISpec && { openAPISpec }),
            },
          } : {}),
        },
      };

      const response = await fetchApi.fetch(
        `${backendUrl}/api/kuadrant/apiproducts/${namespace}/${name}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(patch),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'failed to update apiproduct');
      }

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
          <Grid container spacing={2}>
            <Grid item xs={6}>
              <TextField
                fullWidth
                label="Name"
                value={name}
                disabled
                helperText="Kubernetes resource name (immutable)"
                margin="normal"
              />
            </Grid>
            <Grid item xs={6}>
              <TextField
                fullWidth
                label="Namespace"
                value={namespace}
                disabled
                helperText="Derived from HTTPRoute (immutable)"
                margin="normal"
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
              />
            </Grid>
            <Grid item xs={6}>
              <TextField
                fullWidth
                select
                label="Publish Status"
                value={publishStatus}
                onChange={e => setPublishStatus(e.target.value as 'Draft' | 'Published')}
                margin="normal"
                helperText="Draft: Hidden from catalog. Published: Visible in catalog."
              >
                <MenuItem value="Draft">Draft (Hidden)</MenuItem>
                <MenuItem value="Published">Published (Visible)</MenuItem>
              </TextField>
            </Grid>
            <Grid item xs={6}>
              <TextField
                fullWidth
                select
                label="Approval Mode"
                value={approvalMode}
                onChange={e => setApprovalMode(e.target.value as 'automatic' | 'manual')}
                margin="normal"
                helperText="Automatic: keys created immediately. Manual: requires approval."
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
            {targetRef && (
              <>
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

                <Grid item xs={12}>
                  <Box
                    p={2}
                    bgcolor="#f5f5f5"
                    borderRadius={1}
                    border="1px solid #e0e0e0"
                  >
                    {selectedPolicy ? (
                      <>
                        <Typography variant="subtitle2" gutterBottom style={{ fontWeight: 600 }}>
                          Associated PlanPolicy: <strong>{selectedPolicy.metadata.name}</strong>
                        </Typography>

                        {selectedPolicy.plans && selectedPolicy.plans.length > 0 ? (
                          <>
                            <Typography
                              variant="caption"
                              display="block"
                              gutterBottom
                              color="textSecondary"
                              style={{ marginTop: 8 }}
                            >
                              Available Plans:
                            </Typography>
                            <Box display="flex" flexWrap="wrap" mt={1} style={{ gap: 8 }}>
                              {selectedPolicy.plans.map((plan: any, idx: number) => {
                                const limitText = plan.limits?.daily
                                  ? `${plan.limits.daily}/day`
                                  : plan.limits?.monthly
                                    ? `${plan.limits.monthly}/month`
                                    : plan.limits?.yearly
                                      ? `${plan.limits.yearly}/year`
                                      : 'No limit';

                                return (
                                  <Chip
                                    key={idx}
                                    label={`${plan.tier}: ${limitText}`}
                                    size="small"
                                    variant="outlined"
                                    color="primary"
                                  />
                                );
                              })}
                            </Box>
                            {selectedPolicy.plans.some((p: any) => p.description) && (
                              <Box mt={1}>
                                {selectedPolicy.plans.filter((p: any) => p.description).map((plan: any, idx: number) => (
                                  <Typography key={idx} variant="caption" display="block" color="textSecondary">
                                    • <strong>{plan.tier}:</strong> {plan.description}
                                  </Typography>
                                ))}
                              </Box>
                            )}
                          </>
                        ) : (
                          <Typography variant="caption" color="textSecondary">
                            No plans defined in this PlanPolicy
                          </Typography>
                        )}
                      </>
                    ) : (
                      <Alert severity="info">
                        No PlanPolicy found for this HTTPRoute.
                      </Alert>
                    )}
                  </Box>
                </Grid>
              </>
            )}

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
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          onClick={handleSave}
          color="primary"
          variant="contained"
          disabled={saving || loading || !displayName || !description}
        >
          {saving ? 'Saving...' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
