import * as React from 'react';
import { Box, Grid, Tab, Tabs, Typography } from '@material-ui/core';
import {
  Content,
  Header,
  InfoCard,
  Page,
  ResponseErrorPanel,
} from '@backstage/core-components';
import { useKuadrantPermission } from '../../utils/permissions';
import { kuadrantMcpInspectorUsePermission } from '../../permissions';
import { ConnectionPanel } from './ConnectionPanel';
import { OutputPanel } from './OutputPanel';
import { useMcpInspectorController } from './useMcpInspectorController';
import { useMcpInspectorStyles } from './styles';
import { ToolPanel } from './ToolPanel';

export const McpInspector = () => {
  const classes = useMcpInspectorStyles();
  const inspectorPermission = useKuadrantPermission(
    kuadrantMcpInspectorUsePermission,
  );
  const controller = useMcpInspectorController();
  const { state, resources, extensions, registrations } = controller;

  if (inspectorPermission.error)
    return <ResponseErrorPanel error={inspectorPermission.error} />;
  if (!inspectorPermission.loading && !inspectorPermission.allowed) {
    return (
      <Page themeId='tool'>
        <Header title='MCP Inspector' />
        <Content>
          <InfoCard title='Permission required'>
            You do not have permission to use the MCP Inspector.
          </InfoCard>
        </Content>
      </Page>
    );
  }
  if (resources.error) return <ResponseErrorPanel error={resources.error} />;

  return (
    <Page themeId='tool'>
      <Header
        title='MCP Inspector'
        subtitle='Connect to a gateway and test its tools'
      />
      <Content>
        <Box mb={3}>
          <InfoCard className={classes.connectionCard}>
            <ConnectionPanel
              extensions={extensions}
              loading={resources.loading}
              selectedGateway={state.selectedGateway}
              protocolMode={state.protocolMode}
              supportedProtocols={state.supportedProtocols}
              protocolSupportLoading={state.protocolSupportLoading}
              connection={state.connection}
              authOpen={state.authOpen}
              authToken={state.authToken}
              showAuthToken={state.showAuthToken}
              requests={state.requests}
              warnings={state.warnings}
              errors={state.errors}
              onGatewayChange={controller.onGatewayChange}
              onProtocolChange={controller.onProtocolChange}
              onReconnect={controller.reconnect}
              onAuthTokenChange={controller.setAuthToken}
              onShowAuthTokenChange={controller.setShowAuthToken}
              onAuthOpenChange={controller.setAuthOpen}
              onConnectWithToken={controller.onConnectWithToken}
            />
          </InfoCard>
        </Box>

        {state.error && (
          <Box mb={3}>
            <ResponseErrorPanel error={state.error} />
          </Box>
        )}
        {state.connection !== 'connected' ? (
          <InfoCard>
            <div className={classes.emptyState}>
              <Typography variant='h5'>No connection</Typography>
              <Typography color='textSecondary'>
                Connect to a Gateway to view the MCP server tools available
              </Typography>
            </div>
          </InfoCard>
        ) : (
          <>
            <Tabs value={0} indicatorColor='primary' textColor='primary'>
              <Tab label='Tools' />
              <Tab label='Prompts' disabled />
              <Tab label='Logs' disabled />
            </Tabs>
            <Box mt={2}>
              <Grid container spacing={3} alignItems='stretch'>
                <Grid item xs={12} md={6}>
                  <ToolPanel
                    tools={state.tools}
                    registrations={registrations}
                    selectedToolName={state.selectedToolName}
                    search={state.search}
                    rawValues={state.rawValues}
                    fieldErrors={state.fieldErrors}
                    metadata={state.metadata}
                    busy={state.busy}
                    onSearchChange={controller.setSearch}
                    onRefresh={() => void controller.refreshTools()}
                    onSelectTool={controller.selectTool}
                    onRawValueChange={controller.onRawValueChange}
                    onAddMetadata={controller.addMetadata}
                    onUpdateMetadata={controller.updateMetadata}
                    onRemoveMetadata={controller.removeMetadata}
                    onValidate={controller.validate}
                    onRun={() => void controller.runTool()}
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <OutputPanel
                    exchange={state.exchange}
                    validationMessage={state.validationMessage}
                    outputTab={state.outputTab}
                    onOutputTabChange={controller.setOutputTab}
                  />
                </Grid>
              </Grid>
            </Box>
          </>
        )}
      </Content>
    </Page>
  );
};
