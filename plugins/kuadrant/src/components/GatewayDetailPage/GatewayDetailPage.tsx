import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAsync } from 'react-use';
import { useApi } from '@backstage/core-plugin-api';
import {
  Header,
  Page,
  Content,
  ResponseErrorPanel,
  InfoCard,
  Link,
  Breadcrumbs,
  CodeSnippet,
  Table,
  TableColumn,
  StatusOK,
  StatusError,
} from '@backstage/core-components';
import {
  Box,
  Grid,
  Typography,
  Chip,
  Button,
  Tabs,
  Tab,
  makeStyles,
} from '@material-ui/core';
import { Skeleton } from '@material-ui/lab';
import ArrowBackIcon from '@material-ui/icons/ArrowBack';
import { stringify as yamlStringify } from 'yaml';
import { kuadrantApiRef } from '../../api';
import {
  formatAge,
  getGatewayOwner,
  isGatewayReady,
  GatewayCondition,
} from './utils';

const useStyles = makeStyles(theme => ({
  label: {
    fontWeight: 600,
    color: theme.palette.text.secondary,
    marginBottom: theme.spacing(0.5),
  },
  value: {
    marginBottom: theme.spacing(2),
  },
  keyValueRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: theme.spacing(0.5),
  },
  tabPanel: {
    marginTop: theme.spacing(2),
  },
}));

const GATEWAYS_LIST_PATH = '/kuadrant/mcp-management';

const KeyValueList = ({ data }: { data?: Record<string, string> }) => {
  const classes = useStyles();
  const entries = Object.entries(data ?? {});
  if (entries.length === 0) {
    return <Typography variant="body2">-</Typography>;
  }
  return (
    <Box className={classes.keyValueRow}>
      {entries.map(([key, val]) => (
        <Chip key={key} size="small" variant="outlined" label={`${key}: ${val}`} />
      ))}
    </Box>
  );
};

const conditionColumns: TableColumn<GatewayCondition>[] = [
  { title: 'Type', field: 'type', render: row => row.type || '-' },
  {
    title: 'Status',
    field: 'status',
    render: row =>
      row.status === 'True' ? (
        <StatusOK>{row.status}</StatusOK>
      ) : (
        <StatusError>{row.status || 'Unknown'}</StatusError>
      ),
  },
  {
    title: 'Updated',
    field: 'lastTransitionTime',
    render: row =>
      row.lastTransitionTime
        ? new Date(row.lastTransitionTime).toLocaleString()
        : '-',
  },
  { title: 'Reason', field: 'reason', render: row => row.reason || '-' },
  { title: 'Message', field: 'message', render: row => row.message || '-' },
];

export const GatewayDetailPage = () => {
  const classes = useStyles();
  const { namespace, name } = useParams<{ namespace: string; name: string }>();
  const kuadrantApi = useApi(kuadrantApiRef);

  const [selectedTab, setSelectedTab] = useState(0);

  const {
    value: gateway,
    loading,
    error,
  } = useAsync(async () => {
    if (!namespace || !name) {
      throw new Error('Gateway namespace and name are required');
    }
    return kuadrantApi.getGateway(namespace, name);
  }, [namespace, name, kuadrantApi]);

  if (loading) {
    return (
      <Page themeId="tool">
        <Header title="Loading..." />
        <Content>
          <Box p={2}>
            {[...Array(5)].map((_, i) => (
              <Box key={i} p={2}>
                <Skeleton variant="text" width="100%" />
              </Box>
            ))}
          </Box>
        </Content>
      </Page>
    );
  }

  if (error || !gateway) {
    return (
      <ResponseErrorPanel error={error || new Error('Gateway not found')} />
    );
  }

  const ready = isGatewayReady(gateway);
  const conditions = gateway.status?.conditions ?? [];

  return (
    <Page themeId="tool">
      <Header
        title={gateway.metadata?.name || name || 'Gateway'}
        subtitle={`Gateway in ${gateway.metadata?.namespace || namespace}`}
      >
        <Link to={GATEWAYS_LIST_PATH}>
          <Button startIcon={<ArrowBackIcon />}>Back to Gateways</Button>
        </Link>
      </Header>
      <Content>
        <Box mb={2}>
          <Breadcrumbs aria-label="breadcrumb">
            <Link to={GATEWAYS_LIST_PATH}>Gateways</Link>
            <Typography>{gateway.metadata?.name || name}</Typography>
          </Breadcrumbs>
        </Box>

        <Box mb={2}>
          <Tabs
            value={selectedTab}
            onChange={(_, newValue) => setSelectedTab(newValue)}
            indicatorColor="primary"
            textColor="primary"
          >
            <Tab label="Details" />
            <Tab label="YAML" />
          </Tabs>
        </Box>

        {selectedTab === 0 && (
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <InfoCard title="Gateway">
                <Typography variant="caption" className={classes.label}>
                  Name
                </Typography>
                <Typography variant="body1" className={classes.value}>
                  {gateway.metadata?.name || '-'}
                </Typography>

                <Typography variant="caption" className={classes.label}>
                  Namespace
                </Typography>
                <Typography variant="body1" className={classes.value}>
                  {gateway.metadata?.namespace || '-'}
                </Typography>

                <Typography variant="caption" className={classes.label}>
                  Status
                </Typography>
                <Box className={classes.value} data-testid="gateway-status">
                  {ready ? (
                    <StatusOK>Ready</StatusOK>
                  ) : (
                    <StatusError>Not Ready</StatusError>
                  )}
                </Box>

                <Typography variant="caption" className={classes.label}>
                  Age
                </Typography>
                <Typography variant="body1" className={classes.value}>
                  {formatAge(gateway.metadata?.creationTimestamp)}
                </Typography>

                <Typography variant="caption" className={classes.label}>
                  Created at
                </Typography>
                <Typography variant="body1" className={classes.value}>
                  {gateway.metadata?.creationTimestamp
                    ? new Date(
                        gateway.metadata.creationTimestamp,
                      ).toLocaleString()
                    : '-'}
                </Typography>

                <Typography variant="caption" className={classes.label}>
                  Owner
                </Typography>
                <Typography variant="body1" className={classes.value}>
                  {getGatewayOwner(gateway)}
                </Typography>
              </InfoCard>
            </Grid>

            <Grid item xs={12} md={6}>
              <InfoCard title="Metadata">
                <Typography variant="caption" className={classes.label}>
                  Labels
                </Typography>
                <Box className={classes.value}>
                  <KeyValueList data={gateway.metadata?.labels} />
                </Box>

                <Typography variant="caption" className={classes.label}>
                  Annotations
                </Typography>
                <Box className={classes.value}>
                  <KeyValueList data={gateway.metadata?.annotations} />
                </Box>
              </InfoCard>
            </Grid>

            <Grid item xs={12}>
              <Table<GatewayCondition>
                title="Conditions"
                options={{ paging: false, search: false, padding: 'dense' }}
                columns={conditionColumns}
                data={conditions}
                emptyContent={
                  <Box p={2}>
                    <Typography variant="body2">No conditions reported.</Typography>
                  </Box>
                }
              />
            </Grid>
          </Grid>
        )}

        {selectedTab === 1 && (
          <InfoCard title="YAML">
            <Box className={classes.tabPanel}>
              <CodeSnippet
                text={yamlStringify(gateway)}
                language="yaml"
                showLineNumbers
                showCopyCodeButton
              />
            </Box>
          </InfoCard>
        )}
      </Content>
    </Page>
  );
};
