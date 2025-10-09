import { useState } from 'react';
import { useAsync } from 'react-use';
import {
  Table,
  TableColumn,
  Progress,
  ResponseErrorPanel,
} from '@backstage/core-components';
import {
  IconButton,
  Typography,
  Box,
  Chip,
} from '@material-ui/core';
import { useApi, configApiRef, identityApiRef } from '@backstage/core-plugin-api';
import { useEntity } from '@backstage/plugin-catalog-react';
import VisibilityIcon from '@material-ui/icons/Visibility';
import VisibilityOffIcon from '@material-ui/icons/VisibilityOff';
import DeleteIcon from '@material-ui/icons/Delete';

interface Secret {
  metadata: {
    name: string;
    namespace: string;
    creationTimestamp: string;
    annotations?: {
      'secret.kuadrant.io/plan-id'?: string;
      'secret.kuadrant.io/user-id'?: string;
    };
    labels?: {
      app?: string;
    };
  };
  data?: {
    api_key?: string;
  };
}

export interface ApiKeyManagementTabProps {
  // deprecated: use entity annotations instead
  namespace?: string;
}

export const ApiKeyManagementTab = ({ namespace: propNamespace }: ApiKeyManagementTabProps) => {
  const { entity } = useEntity();
  const config = useApi(configApiRef);
  const identityApi = useApi(identityApiRef);
  const backendUrl = config.getString('backend.baseUrl');
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());
  const [refresh, setRefresh] = useState(0);
  const [userId, setUserId] = useState<string>('guest');

  // read from entity annotations, fallback to props for backwards compat
  const namespace = entity.metadata.annotations?.['kuadrant.io/namespace'] || propNamespace || 'default';

  // get current user identity
  useAsync(async () => {
    const identity = await identityApi.getBackstageIdentity();
    setUserId(identity.userEntityRef.split('/')[1] || 'guest');
  }, [identityApi]);

  const { value, loading, error } = useAsync(async () => {
    if (!userId) return [];
    const response = await fetch(
      `${backendUrl}/api/kuadrant/apikeys?namespace=${namespace}&userId=${userId}`
    );
    if (!response.ok) {
      throw new Error('failed to fetch api keys');
    }
    const data = await response.json();
    return data.items || [];
  }, [namespace, userId, refresh]);

  const handleDelete = async (name: string) => {
    try {
      const response = await fetch(
        `${backendUrl}/api/kuadrant/apikeys/${namespace}/${name}`,
        { method: 'DELETE' }
      );
      if (!response.ok) {
        throw new Error('failed to delete api key');
      }
      setRefresh(r => r + 1);
    } catch (err) {
      console.error('error deleting api key:', err);
    }
  };

  const toggleVisibility = (keyName: string) => {
    setVisibleKeys(prev => {
      const newSet = new Set(prev);
      if (newSet.has(keyName)) {
        newSet.delete(keyName);
      } else {
        newSet.add(keyName);
      }
      return newSet;
    });
  };

  if (loading) {
    return <Progress />;
  }

  if (error) {
    return <ResponseErrorPanel error={error} />;
  }

  const secrets = value as Secret[];

  const columns: TableColumn<Secret>[] = [
    {
      title: 'Name',
      field: 'metadata.name',
      render: (row: Secret) => (
        <Typography variant="body2">{row.metadata.name}</Typography>
      ),
    },
    {
      title: 'API',
      field: 'metadata.labels.app',
      render: (row: Secret) => (
        <Typography variant="body2">{row.metadata.labels?.app || 'N/A'}</Typography>
      ),
    },
    {
      title: 'Plan Tier',
      field: 'metadata.annotations',
      render: (row: Secret) => (
        <Chip
          label={row.metadata.annotations?.['secret.kuadrant.io/plan-id'] || 'Unknown'}
          color="primary"
          size="small"
        />
      ),
    },
    {
      title: 'Created',
      field: 'metadata.creationTimestamp',
      render: (row: Secret) => (
        <Typography variant="body2">
          {new Date(row.metadata.creationTimestamp).toLocaleDateString()}
        </Typography>
      ),
    },
    {
      title: 'API Key',
      field: 'data.api_key',
      render: (row: Secret) => {
        const isVisible = visibleKeys.has(row.metadata.name);
        const apiKey = row.data?.api_key
          ? atob(row.data.api_key)
          : 'N/A';

        return (
          <Box display="flex" alignItems="center">
            <Typography
              variant="body2"
              style={{
                fontFamily: 'monospace',
                marginRight: 8,
              }}
            >
              {isVisible ? apiKey : '••••••••••••••••'}
            </Typography>
            <IconButton
              size="small"
              onClick={() => toggleVisibility(row.metadata.name)}
            >
              {isVisible ? <VisibilityOffIcon /> : <VisibilityIcon />}
            </IconButton>
          </Box>
        );
      },
    },
    {
      title: 'Actions',
      field: 'actions',
      render: (row: Secret) => (
        <IconButton
          size="small"
          onClick={() => handleDelete(row.metadata.name)}
          color="secondary"
        >
          <DeleteIcon />
        </IconButton>
      ),
    },
  ];

  return (
    <Box p={2}>
      <Table
        title="API Keys"
        options={{
          paging: true,
          search: true,
          pageSize: 10,
        }}
        columns={columns}
        data={secrets}
        emptyContent={
          <Box p={4}>
            <Typography align="center">
              No API keys found. Request access from an API page to create one.
            </Typography>
          </Box>
        }
      />
    </Box>
  );
};
