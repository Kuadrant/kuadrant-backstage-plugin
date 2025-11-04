import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Typography, Box, Card, CardContent, CardHeader, Grid, Chip, Button, Accordion, AccordionSummary, AccordionDetails } from '@material-ui/core';
import {
  Header,
  Page,
  Content,
  Progress,
  ResponseErrorPanel,
  CodeSnippet,
  InfoCard,
} from '@backstage/core-components';
import useAsync from 'react-use/lib/useAsync';
import { useApi, configApiRef, fetchApiRef } from '@backstage/core-plugin-api';
import ArrowBackIcon from '@material-ui/icons/ArrowBack';
import ExpandMoreIcon from '@material-ui/icons/ExpandMore';
import { PlanPolicy } from '../../types/api-management';

export const PlanPolicyDetailPage = () => {
  const { namespace, name } = useParams<{
    namespace: string;
    name: string;
  }>();
  const navigate = useNavigate();
  const config = useApi(configApiRef);
  const fetchApi = useApi(fetchApiRef);
  const backendUrl = config.getString('backend.baseUrl');

  const { value: planPolicy, loading, error } = useAsync(async (): Promise<PlanPolicy> => {
    const response = await fetchApi.fetch(`${backendUrl}/api/kuadrant/planpolicies/${namespace}/${name}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch PlanPolicy: ${response.status}`);
    }
    return await response.json();
  }, [backendUrl, namespace, name, fetchApi]);

  const formatLimits = (limits: any): string[] => {
    if (!limits) return [];
    return Object.entries(limits).map(([period, value]) => `${value} per ${period}`);
  };

  if (loading) {
    return (
      <Page themeId="tool">
        <Header title="Loading..." />
        <Content>
          <Progress />
        </Content>
      </Page>
    );
  }

  if (error) {
    return (
      <Page themeId="tool">
        <Header title="Error" />
        <Content>
          <ResponseErrorPanel error={error} />
        </Content>
      </Page>
    );
  }

  if (!planPolicy) {
    return (
      <Page themeId="tool">
        <Header title="Not Found" />
        <Content>
          <Typography>PlanPolicy not found</Typography>
        </Content>
      </Page>
    );
  }

  return (
    <Page themeId="tool">
      <Header title={planPolicy.metadata.name} subtitle={`PlanPolicy in ${planPolicy.metadata.namespace}`}>
        <Button
          variant="outlined"
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate('/kuadrant')}
        >
          Back to Kuadrant
        </Button>
      </Header>
      <Content>
        <Grid container spacing={3}>
          {/* Target Reference Section */}
          <Grid item xs={12}>
            <InfoCard title="Target Reference">
              <Box p={2}>
                <Grid container spacing={2}>
                  <Grid item xs={12} md={4}>
                    <Typography variant="body2" color="textSecondary">
                      Kind
                    </Typography>
                    <Typography variant="body1">
                      <strong>{planPolicy.spec.targetRef.kind}</strong>
                    </Typography>
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <Typography variant="body2" color="textSecondary">
                      Name
                    </Typography>
                    <Typography variant="body1">
                      <strong>{planPolicy.spec.targetRef.name}</strong>
                    </Typography>
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <Typography variant="body2" color="textSecondary">
                      Namespace
                    </Typography>
                    <Typography variant="body1">
                      <strong>{planPolicy.spec.targetRef.namespace || planPolicy.metadata.namespace}</strong>
                    </Typography>
                  </Grid>
                </Grid>
              </Box>
            </InfoCard>
          </Grid>

          {/* Plan Tiers Section */}
          <Grid item xs={12}>
            <InfoCard title="Plan Tiers">
              <Box p={2}>
                <Grid container spacing={2}>
                  {planPolicy.spec.plans.map((plan, index) => (
                    <Grid item xs={12} md={6} lg={4} key={index}>
                      <Card variant="outlined">
                        <CardHeader
                          title={
                            <Box display="flex" alignItems="center" style={{ gap: 8 }}>
                              <Chip label={plan.tier} color="primary" />
                            </Box>
                          }
                        />
                        <CardContent>
                          {/* Rate Limits */}
                          <Typography variant="body2" color="textSecondary" gutterBottom>
                            Rate Limits
                          </Typography>
                          {plan.limits && formatLimits(plan.limits).map((limit, idx) => (
                            <Typography key={idx} variant="body1" gutterBottom>
                              {limit}
                            </Typography>
                          ))}

                          {/* Predicate */}
                          {plan.predicate && (
                            <Box mt={2}>
                              <Typography variant="body2" color="textSecondary" gutterBottom>
                                Predicate (CEL)
                              </Typography>
                              <Box
                                p={1}
                                style={{
                                  backgroundColor: '#f5f5f5',
                                  borderRadius: 4,
                                  fontFamily: 'monospace',
                                  fontSize: '0.875rem',
                                  overflow: 'auto'
                                }}
                              >
                                <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: '#333' }}>
                                  {plan.predicate}
                                </pre>
                              </Box>
                            </Box>
                          )}
                        </CardContent>
                      </Card>
                    </Grid>
                  ))}
                </Grid>
              </Box>
            </InfoCard>
          </Grid>

          {/* Status Conditions Section */}
          {planPolicy.status?.conditions && planPolicy.status.conditions.length > 0 && (
            <Grid item xs={12}>
              <InfoCard title="Status Conditions">
                <Box p={2}>
                  <Grid container spacing={2}>
                    {planPolicy.status.conditions.map((condition, index) => (
                      <Grid item xs={12} key={index}>
                        <Card
                          variant="outlined"
                          style={{
                            borderColor: condition.status === 'True' ? '#4caf50' :
                                       condition.status === 'False' ? '#f44336' : '#ff9800'
                          }}
                        >
                          <CardContent>
                            <Box display="flex" alignItems="center" justifyContent="space-between">
                              <Typography variant="h6">{condition.type}</Typography>
                              <Chip
                                label={condition.status}
                                color={condition.status === 'True' ? 'primary' : 'default'}
                                size="small"
                              />
                            </Box>
                            {condition.reason && (
                              <Typography variant="body2" color="textSecondary" style={{ marginTop: 8 }}>
                                <strong>Reason:</strong> {condition.reason}
                              </Typography>
                            )}
                            {condition.message && (
                              <Typography variant="body2" style={{ marginTop: 4 }}>
                                {condition.message}
                              </Typography>
                            )}
                            {condition.lastTransitionTime && (
                              <Typography variant="caption" color="textSecondary" style={{ marginTop: 8, display: 'block' }}>
                                Last transition: {new Date(condition.lastTransitionTime).toLocaleString()}
                              </Typography>
                            )}
                          </CardContent>
                        </Card>
                      </Grid>
                    ))}
                  </Grid>
                </Box>
              </InfoCard>
            </Grid>
          )}

          {/* YAML View Section */}
          <Grid item xs={12}>
            <Accordion>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography variant="h6">View Full YAML</Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Box width="100%">
                  <CodeSnippet
                    text={JSON.stringify(planPolicy, null, 2)}
                    language="yaml"
                    showCopyCodeButton
                  />
                </Box>
              </AccordionDetails>
            </Accordion>
          </Grid>
        </Grid>
      </Content>
    </Page>
  );
};
