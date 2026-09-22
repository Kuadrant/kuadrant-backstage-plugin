import * as React from 'react';
import { useCallback } from 'react';
import {
  Button,
  Chip,
  CircularProgress,
  MenuItem,
  TextField,
  Tooltip,
  Typography,
} from '@material-ui/core';
import ErrorOutlineIcon from '@material-ui/icons/ErrorOutline';
import RefreshIcon from '@material-ui/icons/Refresh';
import SecurityIcon from '@material-ui/icons/Security';
import SwapHorizIcon from '@material-ui/icons/SwapHoriz';
import WarningIcon from '@material-ui/icons/Warning';
import { MCPGatewayExtension } from '../../types/mcp';
import {
  MCP_LEGACY_PROTOCOL_VERSION,
  MCP_PROTOCOL_VERSION,
  McpProtocolMode,
} from './client';
import { AuthDialog } from './AuthDialog';
import { useMcpInspectorStyles } from './styles';

interface ConnectionPanelProps {
  extensions: MCPGatewayExtension[];
  loading: boolean;
  selectedGateway: string;
  protocolMode: McpProtocolMode;
  supportedProtocols?: string[];
  protocolSupportLoading: boolean;
  connection: 'disconnected' | 'connecting' | 'connected';
  authOpen: boolean;
  authToken: string;
  showAuthToken: boolean;
  requests: number;
  warnings: number;
  errors: number;
  onGatewayChange: (gateway: string) => void;
  onProtocolChange: (protocol: McpProtocolMode) => void;
  onReconnect: () => void;
  onAuthTokenChange: (token: string) => void;
  onShowAuthTokenChange: (show: boolean) => void;
  onAuthOpenChange: (open: boolean) => void;
  onConnectWithToken: () => void;
}

export const ConnectionPanel = ({
  extensions,
  loading,
  selectedGateway,
  protocolMode,
  supportedProtocols,
  protocolSupportLoading,
  connection,
  authOpen,
  authToken,
  showAuthToken,
  requests,
  warnings,
  errors,
  onGatewayChange,
  onProtocolChange,
  onReconnect,
  onAuthTokenChange,
  onShowAuthTokenChange,
  onAuthOpenChange,
  onConnectWithToken,
}: ConnectionPanelProps) => {
  const classes = useMcpInspectorStyles();
  const handleGatewayChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      onGatewayChange(event.target.value),
    [onGatewayChange],
  );
  const handleProtocolChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      onProtocolChange(event.target.value as McpProtocolMode),
    [onProtocolChange],
  );
  let connectionColor = '#6a6e73';
  let connectionLabel = 'No connection';
  if (connection === 'connected') {
    connectionColor = '#3e8635';
    connectionLabel = 'Connected';
  } else if (connection === 'connecting') {
    connectionColor = '#f0ab00';
    connectionLabel = 'Connecting';
  }

  return (
    <>
      <div className={classes.connectionBar}>
        <TextField
          select
          label='MCP gateway extension'
          aria-label='Select an MCP gateway extension'
          value={selectedGateway}
          onChange={handleGatewayChange}
          disabled={loading}
          className={classes.gatewaySelect}
          variant='outlined'
          size='small'
        >
          <MenuItem value=''>Select a gateway</MenuItem>
          {extensions.map((extension) => {
            const namespace = extension.metadata.namespace || 'default';
            const key = `${namespace}/${extension.metadata.name}`;
            return (
              <MenuItem key={key} value={key}>
                {extension.metadata.name} ({namespace})
              </MenuItem>
            );
          })}
        </TextField>
        <TextField
          select
          label='Protocol'
          aria-label='Select MCP protocol version'
          value={protocolMode}
          onChange={handleProtocolChange}
          className={classes.protocolSelect}
          variant='outlined'
          size='small'
        >
          <MenuItem value='auto'>Auto (prefer 2026)</MenuItem>
          <MenuItem
            value={MCP_PROTOCOL_VERSION}
            disabled={
              !!supportedProtocols &&
              !supportedProtocols.includes(MCP_PROTOCOL_VERSION)
            }
          >
            2026-07-28 (stateless)
          </MenuItem>
          <MenuItem
            value={MCP_LEGACY_PROTOCOL_VERSION}
            disabled={
              !!supportedProtocols &&
              !supportedProtocols.includes(MCP_LEGACY_PROTOCOL_VERSION)
            }
          >
            2025-11-25 (legacy)
          </MenuItem>
        </TextField>
        <Button
          startIcon={<RefreshIcon />}
          onClick={onReconnect}
          disabled={
            !selectedGateway ||
            connection === 'connecting' ||
            protocolSupportLoading
          }
        >
          Reconnect
        </Button>
        {protocolSupportLoading && (
          <Tooltip title='Querying the MCP gateway with server/discover to check supported protocol versions.'>
            <Typography variant='caption' color='textSecondary'>
              Checking supported protocol versions…
            </Typography>
          </Tooltip>
        )}
        <div className={classes.status}>
          <span
            className={classes.statusDot}
            style={{ backgroundColor: connectionColor }}
          />
          <Typography>{connectionLabel}</Typography>
          {connection === 'connecting' && <CircularProgress size={18} />}
        </div>
        {connection === 'connected' && authToken && (
          <Chip
            size='small'
            className={classes.authChip}
            icon={
              <SecurityIcon fontSize='small' className={classes.authIcon} />
            }
            label='Gateway authenticated'
            variant='outlined'
          />
        )}
        <div className={classes.stats}>
          <Typography variant='body2' className={classes.stat}>
            <SwapHorizIcon fontSize='small' className={classes.requestsIcon} />
            Requests: {requests}
          </Typography>
          <Typography variant='body2' className={classes.stat}>
            <WarningIcon fontSize='small' className={classes.warningIcon} />
            Warnings: {warnings}
          </Typography>
          <Typography variant='body2' className={classes.stat}>
            <ErrorOutlineIcon fontSize='small' className={classes.errorIcon} />
            Errors: {errors}
          </Typography>
        </div>
      </div>

      <AuthDialog
        open={authOpen}
        token={authToken}
        showToken={showAuthToken}
        onClose={() => onAuthOpenChange(false)}
        onTokenChange={onAuthTokenChange}
        onShowTokenChange={onShowAuthTokenChange}
        onConnect={onConnectWithToken}
      />
    </>
  );
};
