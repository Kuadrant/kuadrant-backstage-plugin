import React from 'react';
import {
  Header,
  Page,
  Content,
  SupportButton,
} from '@backstage/core-components';
import { MyApiKeysTable } from '../MyApiKeysTable';

export const MyApiKeysPage = () => {
  return (
    <Page themeId="tool">
      <Header title="My API Keys" subtitle="View and manage your API keys">
        <SupportButton>Manage your API keys and access requests</SupportButton>
      </Header>
      <Content>
        <MyApiKeysTable />
      </Content>
    </Page>
  );
};
