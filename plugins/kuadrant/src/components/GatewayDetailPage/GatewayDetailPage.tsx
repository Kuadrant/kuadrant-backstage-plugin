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
  Table,
  TableColumn,
} from '@backstage/core-components';
import {
  Box,
  Typography,
  Chip,
  Button,
  Tabs,
  Tab,
  makeStyles,
} from '@material-ui/core';
import { Skeleton } from '@material-ui/lab';
import ArrowBackIcon from '@material-ui/icons/ArrowBack';
import { kuadrantApiRef } from '../../api';
import { GatewayManifest, GatewayCondition } from '../../types/mcp';
import { ResourceYamlCard } from '../ResourceYamlCard';
import { hasCondition } from '../McpOverviewPage/utils';
import { getGatewayOwner } from './utils';

const useStyles = makeStyles((theme) => ({
  tabs: {
    marginLeft: theme.spacing(-3),
  },
  label: {
    fontWeight: 600,
    color: theme.palette.text.secondary,
    marginBottom: theme.spacing(0.5),
    fontSize: '0.75rem',
    textTransform: 'uppercase',
  },
  infoGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
    gap: theme.spacing(3),
    marginBottom: theme.spacing(3),
  },
  infoItem: {
    minWidth: 0,
  },
  statusChipReady: {
    backgroundColor: theme.palette.success.main,
    color: theme.palette.common.white,
  },
  statusChipNotReady: {
    backgroundColor: theme.palette.error.main,
    color: theme.palette.common.white,
  },
  annotationText: {
    fontFamily: 'monospace',
    fontSize: '0.75rem',
  },
}));

const GATEWAYS_LIST_PATH = '/kuadrant/mcp-management';

const conditionColumns: TableColumn<GatewayCondition>[] = [
  {
    title: 'Type',
    field: 'type',
    render: (row) => <strong>{row.type || '-'}</strong>,
  },
  {
    title: 'Status',
    field: 'status',
    render: (row) => (
      <Chip
        label={row.status || 'Unknown'}
        size='small'
        style={
          row.status === 'True'
            ? {
                backgroundColor: 'var(--rh-green, #3e8635)',
                color: 'white',
              }
            : undefined
        }
      />
    ),
  },
  {
    title: 'Updated',
    field: 'lastTransitionTime',
    render: (row) =>
      row.lastTransitionTime
        ? new Date(row.lastTransitionTime).toLocaleString()
        : '-',
  },
  { title: 'Reason', field: 'reason', render: (row) => row.reason || '-' },
  { title: 'Message', field: 'message', render: (row) => row.message || '-' },
];

export const GatewayDetailPage = () => {
  const classes = useStyles();
  const { namespace, name } = useParams<'namespace' | 'name'>();
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
    return (await kuadrantApi.getGateway(namespace!, name!)) as GatewayManifest;
  }, [namespace, name, kuadrantApi]);

  if (loading) {
    return (
      <Page themeId='tool'>
        <Header title='Loading...' />
        <Content>
          <Box p={2}>
            {[...Array(5)].map((_, i) => (
              <Box key={i} p={2}>
                <Skeleton variant='text' width='100%' />
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

  const ready =
    hasCondition(gateway.status?.conditions, 'Accepted') &&
    hasCondition(gateway.status?.conditions, 'Programmed');
  const conditions = gateway.status?.conditions || [];
  const labels = gateway.metadata?.labels || {};
  const annotations = gateway.metadata?.annotations || {};
  const createdAt = gateway.metadata?.creationTimestamp;
  const owner = getGatewayOwner(gateway);

  return (
    <Page themeId='tool'>
      <Header
        title={gateway.metadata?.name || 'Gateway'}
        subtitle={`Namespace: ${gateway.metadata?.namespace || '-'}`}
      >
        <Link to={GATEWAYS_LIST_PATH}>
          <Button startIcon={<ArrowBackIcon />}>Back to MCP Overview</Button>
        </Link>
      </Header>
      <Content>
        <Box mb={2}>
          <Breadcrumbs aria-label='breadcrumb'>
            <Link to={GATEWAYS_LIST_PATH}>MCP Overview</Link>
            <Typography>{gateway.metadata?.name || 'Gateway'}</Typography>
          </Breadcrumbs>
        </Box>

        <Box mb={2}>
          <Tabs
            className={classes.tabs}
            value={selectedTab}
            onChange={(_, newValue) => setSelectedTab(newValue)}
            indicatorColor='primary'
            textColor='primary'
          >
            <Tab label='Details' />
            <Tab label='YAML' />
          </Tabs>
        </Box>

        {selectedTab === 0 && (
          <>
            <InfoCard title='Resource Details'>
              <Box className={classes.infoGrid}>
                <Box className={classes.infoItem}>
                  <Typography variant='caption' className={classes.label}>
                    Name
                  </Typography>
                  <Typography variant='body2'>
                    {gateway.metadata?.name || '-'}
                  </Typography>
                </Box>
                <Box className={classes.infoItem}>
                  <Typography variant='caption' className={classes.label}>
                    Namespace
                  </Typography>
                  <Typography variant='body2'>
                    {gateway.metadata?.namespace || '-'}
                  </Typography>
                </Box>
                <Box className={classes.infoItem} data-testid='gateway-status'>
                  <Typography variant='caption' className={classes.label}>
                    Status
                  </Typography>
                  <Box>
                    <Chip
                      label={ready ? 'Ready' : 'Not Ready'}
                      size='small'
                      className={
                        ready
                          ? classes.statusChipReady
                          : classes.statusChipNotReady
                      }
                    />
                  </Box>
                </Box>
                <Box className={classes.infoItem}>
                  <Typography variant='caption' className={classes.label}>
                    Created At
                  </Typography>
                  <Typography variant='body2'>
                    {createdAt ? new Date(createdAt).toLocaleString() : '-'}
                  </Typography>
                </Box>
                {gateway.metadata?.ownerReferences &&
                  gateway.metadata.ownerReferences.length > 0 && (
                    <Box className={classes.infoItem}>
                      <Typography variant='caption' className={classes.label}>
                        Owner
                      </Typography>
                      <Typography variant='body2'>{owner}</Typography>
                    </Box>
                  )}
                <Box className={classes.infoItem}>
                  <Typography variant='caption' className={classes.label}>
                    Gateway Class
                  </Typography>
                  <Typography variant='body2'>
                    {String(gateway.spec?.gatewayClassName || '-')}
                  </Typography>
                </Box>
              </Box>

              <Box mb={3}>
                <Typography variant='caption' className={classes.label}>
                  Labels
                </Typography>
                {Object.keys(labels).length > 0 ? (
                  <Box display='flex' flexWrap='wrap' gridGap={8}>
                    {Object.entries(labels).map(([key, value]) => (
                      <Chip
                        key={key}
                        label={`${key}: ${value}`}
                        size='small'
                        variant='outlined'
                      />
                    ))}
                  </Box>
                ) : (
                  <Typography variant='body2'>-</Typography>
                )}
              </Box>

              <Box mb={3}>
                <Typography variant='caption' className={classes.label}>
                  Annotations
                </Typography>
                {Object.keys(annotations).length > 0 ? (
                  <Box>
                    {Object.entries(annotations).map(([key, value]) => (
                      <Typography
                        key={key}
                        variant='body2'
                        className={classes.annotationText}
                      >
                        <strong>{key}:</strong> {String(value)}
                      </Typography>
                    ))}
                  </Box>
                ) : (
                  <Typography variant='body2'>-</Typography>
                )}
              </Box>
            </InfoCard>

            <Box mt={3}>
              <InfoCard title='Conditions'>
                <Table<GatewayCondition>
                  options={{ paging: false, search: false, toolbar: false }}
                  columns={conditionColumns}
                  data={conditions}
                />
              </InfoCard>
            </Box>
          </>
        )}

        {selectedTab === 1 && <ResourceYamlCard resource={gateway} />}
      </Content>
    </Page>
  );
};
