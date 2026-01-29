import React from 'react';
import {
  Header,
  Page,
  Content,
  SupportButton,
} from '@backstage/core-components';
import { ApprovalQueueTable } from '../ApprovalQueueTable';

export const ApiKeyApprovalPage = () => {
  return (
    <Page themeId="tool">
      <Header title="API Key Approval" subtitle="Review and approve API key requests">
        <SupportButton>Approve or reject API key access requests</SupportButton>
      </Header>
      <Content>
        <ApprovalQueueTable />
      </Content>
    </Page>
  );
};
