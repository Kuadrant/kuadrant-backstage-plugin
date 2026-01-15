import React, { useState } from 'react';
import { Box, Tabs, Tab } from '@material-ui/core';
import {
  Header,
  Page,
  Content,
  SupportButton,
} from '@backstage/core-components';
import { PermissionGate } from '../PermissionGate';
import { MyApiKeysTable } from '../MyApiKeysTable';
import { ApprovalQueueTable } from '../ApprovalQueueTable';
import {
  kuadrantApiKeyReadOwnPermission,
  kuadrantApiKeyApprovePermission,
} from '../../permissions';
import { useKuadrantPermission } from '../../utils/permissions';

const ApiKeysContent = () => {
  const [selectedTab, setSelectedTab] = useState(0);

  const {
    allowed: canViewApprovalQueue,
    loading: approvalQueuePermissionLoading,
  } = useKuadrantPermission(kuadrantApiKeyApprovePermission);

  const handleTabChange = (_event: React.ChangeEvent<{}>, newValue: number) => {
    setSelectedTab(newValue);
  };

  return (
    <Page themeId="tool">
      <Header title="API Keys" subtitle="API keys management for Kubernetes">
        <SupportButton>Manage your API keys and access requests</SupportButton>
      </Header>
      <Content>
        <Box mb={2}>
          <Tabs
            value={selectedTab}
            onChange={handleTabChange}
            indicatorColor="primary"
            textColor="primary"
          >
            <Tab label="My API keys" data-testid="my-api-keys-tab" />
            {!approvalQueuePermissionLoading && canViewApprovalQueue && (
              <Tab label="API keys approval" data-testid="api-keys-approval-tab" />
            )}
          </Tabs>
        </Box>

        {selectedTab === 0 && <MyApiKeysTable />}
        {selectedTab === 1 && canViewApprovalQueue && <ApprovalQueueTable />}
      </Content>
    </Page>
  );
};

export const ApiKeysPage = () => {
  return (
    <PermissionGate
      permission={kuadrantApiKeyReadOwnPermission}
      errorMessage="you don't have permission to view the API Keys page"
    >
      <ApiKeysContent />
    </PermissionGate>
  );
};
