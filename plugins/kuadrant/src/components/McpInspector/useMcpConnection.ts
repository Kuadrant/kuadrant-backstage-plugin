import { useCallback, useReducer, useRef } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import useAsync from 'react-use/lib/useAsync';
import { kuadrantApiRef } from '../../api';
import { MCPGatewayExtension, MCPServerRegistration } from '../../types/mcp';
import {
  McpClient,
  McpProtocolMode,
  McpTool,
  McpUnauthorizedError,
  ToolsCallResult,
  McpExchange,
} from './client';
import { connectionReducer, initialConnectionState } from './connectionState';

export const useMcpConnection = () => {
  const kuadrantApi = useApi(kuadrantApiRef);
  const [state, dispatch] = useReducer(
    connectionReducer,
    initialConnectionState,
  );
  const clientRef = useRef<McpClient>();
  const generationRef = useRef(0);

  const resources = useAsync(async () => {
    const [extensions, registrations] = await Promise.all([
      kuadrantApi.getMcpGatewayExtensions(),
      kuadrantApi.getMcpServerRegistrations(),
    ]);
    return { extensions: extensions.items, registrations: registrations.items };
  }, [kuadrantApi]);

  const createClient = useCallback(
    (
      gatewayKey: string,
      protocol: McpProtocolMode,
      generation: number,
    ): McpClient => {
      const [namespace, name] = gatewayKey.split('/');
      return new McpClient(
        async (body, headers) => {
          if (generation === generationRef.current)
            dispatch({ type: 'REQUEST' });
          return kuadrantApi.requestMcp(namespace, name, body, headers);
        },
        { protocolMode: protocol },
      );
    },
    [kuadrantApi],
  );

  const connectAtGeneration = useCallback(
    async (
      gatewayKey: string,
      token: string | undefined,
      protocol: McpProtocolMode,
      generation: number,
    ): Promise<McpTool[] | undefined> => {
      const isCurrent = () => generation === generationRef.current;
      if (!isCurrent()) return undefined;
      dispatch({ type: 'START', gateway: gatewayKey, protocol });
      const client = createClient(gatewayKey, protocol, generation);
      client.setAuthorization(token);
      clientRef.current = client;
      try {
        const connection = await client.connect();
        const tools = await client.listTools();
        if (!isCurrent()) return undefined;
        dispatch({ type: 'SUCCEED', protocols: connection.supportedVersions });
        return tools;
      } catch (error) {
        if (isCurrent()) {
          dispatch({
            type: 'FAIL',
            unauthorized: error instanceof McpUnauthorizedError,
            error: error as Error,
          });
        }
        return undefined;
      }
    },
    [createClient],
  );

  const startConnection = useCallback(
    (
      gatewayKey: string,
      token: string | undefined,
      protocol: McpProtocolMode,
    ) => {
      const generation = ++generationRef.current;
      return connectAtGeneration(gatewayKey, token, protocol, generation);
    },
    [connectAtGeneration],
  );

  const changeGateway = useCallback(
    (gatewayKey: string) => {
      dispatch({ type: 'SELECT_GATEWAY', gateway: gatewayKey });
      clientRef.current = undefined;
      if (!gatewayKey) {
        ++generationRef.current;
        return Promise.resolve(undefined);
      }
      return startConnection(gatewayKey, undefined, state.protocolMode);
    },
    [startConnection, state.protocolMode],
  );

  const changeProtocol = useCallback(
    (protocol: McpProtocolMode) => {
      if (
        protocol !== 'auto' &&
        state.supportedProtocols &&
        !state.supportedProtocols.includes(protocol)
      ) {
        return Promise.resolve(undefined);
      }
      dispatch({ type: 'SET_PROTOCOL_MODE', mode: protocol });
      if (!state.selectedGateway) return Promise.resolve(undefined);
      return startConnection(
        state.selectedGateway,
        state.authToken.trim() || undefined,
        protocol,
      );
    },
    [
      startConnection,
      state.authToken,
      state.selectedGateway,
      state.supportedProtocols,
    ],
  );

  const reconnect = useCallback(() => {
    if (!state.selectedGateway) return Promise.resolve(undefined);
    return startConnection(
      state.selectedGateway,
      state.authToken.trim() || undefined,
      state.protocolMode,
    );
  }, [
    startConnection,
    state.authToken,
    state.protocolMode,
    state.selectedGateway,
  ]);

  const reconnectWithToken = useCallback(
    (token: string) => {
      if (!state.selectedGateway) return Promise.resolve(undefined);
      return startConnection(state.selectedGateway, token, state.protocolMode);
    },
    [startConnection, state.protocolMode, state.selectedGateway],
  );

  const execute = useCallback(
    async <T>(
      operation: (client: McpClient) => Promise<T>,
    ): Promise<T | undefined> => {
      const client = clientRef.current;
      const generation = generationRef.current;
      if (!client) return undefined;
      try {
        const result = await operation(client);
        return generation === generationRef.current ? result : undefined;
      } catch (error) {
        if (generation === generationRef.current) {
          dispatch({ type: 'ERROR' });
          dispatch({ type: 'SET_ERROR', error: error as Error });
        }
        return undefined;
      }
    },
    [],
  );

  const refreshTools = useCallback(
    () => execute((client) => client.listTools()),
    [execute],
  );
  const callTool = useCallback(
    (
      name: string,
      args: Record<string, unknown>,
      metadata: Record<string, string>,
    ) =>
      execute<McpExchange<ToolsCallResult>>((client) =>
        client.callTool(name, args, metadata),
      ),
    [execute],
  );

  const setAuthToken = useCallback(
    (token: string) => dispatch({ type: 'SET_AUTH_TOKEN', token }),
    [],
  );
  const setShowAuthToken = useCallback(
    (show: boolean) => dispatch({ type: 'SET_SHOW_AUTH_TOKEN', show }),
    [],
  );
  const setAuthOpen = useCallback(
    (open: boolean) => dispatch({ type: 'SET_AUTH_OPEN', open }),
    [],
  );
  const resetCounters = useCallback(
    () => dispatch({ type: 'RESET_COUNTERS' }),
    [],
  );
  const incrementWarning = useCallback(() => dispatch({ type: 'WARNING' }), []);
  const incrementError = useCallback(() => dispatch({ type: 'ERROR' }), []);
  const clearError = useCallback(() => dispatch({ type: 'CLEAR_ERROR' }), []);

  return {
    state,
    resources,
    extensions: (resources.value?.extensions || []) as MCPGatewayExtension[],
    registrations: (resources.value?.registrations ||
      []) as MCPServerRegistration[],
    changeGateway,
    changeProtocol,
    reconnect,
    reconnectWithToken,
    refreshTools,
    callTool,
    setAuthToken,
    setShowAuthToken,
    setAuthOpen,
    resetCounters,
    incrementWarning,
    incrementError,
    clearError,
  };
};
