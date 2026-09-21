import { useCallback } from 'react';
import { McpProtocolMode, McpTool } from './client';
import { useMcpConnection } from './useMcpConnection';
import { useMcpTools } from './useMcpTools';

export const useMcpInspectorController = () => {
  const connection = useMcpConnection();
  const tools = useMcpTools();
  const {
    state: connectionState,
    changeGateway,
    changeProtocol,
    reconnect: reconnectConnection,
    reconnectWithToken,
    refreshTools: refreshConnectionTools,
    callTool,
    setAuthToken,
    setShowAuthToken,
    setAuthOpen,
    resetCounters,
    incrementWarning,
    incrementError,
    clearError,
  } = connection;
  const {
    state: toolState,
    selectedTool,
    reset: resetTools,
    setTools,
    selectTool,
    setSearch,
    setRawValue,
    addMetadata,
    updateMetadata,
    removeMetadata,
    setOutputTab,
    setBusy,
    setExchange,
    validate: validateTool,
  } = tools;

  const loadConnectedTools = useCallback(
    async (load: () => Promise<McpTool[] | undefined>) => {
      const loadedTools = await load();
      if (loadedTools) setTools(loadedTools);
    },
    [setTools],
  );

  const onGatewayChange = useCallback(
    (gateway: string) => {
      resetTools();
      void loadConnectedTools(() => changeGateway(gateway));
    },
    [changeGateway, loadConnectedTools, resetTools],
  );

  const onProtocolChange = useCallback(
    (protocol: McpProtocolMode) => {
      if (
        protocol !== 'auto' &&
        connectionState.supportedProtocols &&
        !connectionState.supportedProtocols.includes(protocol)
      ) {
        return;
      }
      resetTools();
      resetCounters();
      void loadConnectedTools(() => changeProtocol(protocol));
    },
    [
      changeProtocol,
      connectionState.supportedProtocols,
      loadConnectedTools,
      resetCounters,
      resetTools,
    ],
  );

  const reconnect = useCallback(() => {
    if (!connectionState.selectedGateway) return;
    resetTools();
    void loadConnectedTools(reconnectConnection);
  }, [
    connectionState.selectedGateway,
    loadConnectedTools,
    reconnectConnection,
    resetTools,
  ]);

  const refreshTools = useCallback(async () => {
    setBusy(true);
    clearError();
    try {
      const refreshedTools = await refreshConnectionTools();
      if (refreshedTools) setTools(refreshedTools);
    } finally {
      setBusy(false);
    }
  }, [clearError, refreshConnectionTools, setBusy, setTools]);

  const validate = useCallback(() => {
    const result = validateTool();
    if (Object.keys(result.errors).length > 0) incrementWarning();
    return result;
  }, [incrementWarning, validateTool]);

  const runTool = useCallback(async () => {
    if (!selectedTool) return;
    const validation = validateTool();
    if (Object.keys(validation.errors).length > 0) {
      incrementWarning();
      return;
    }
    const metadata = Object.fromEntries(
      toolState.metadata
        .filter((row) => row.key.trim())
        .map((row) => [row.key.trim(), row.value]),
    );
    setBusy(true);
    clearError();
    try {
      const exchange = await callTool(
        selectedTool.name,
        validation.values,
        metadata,
      );
      if (exchange) {
        setExchange(exchange);
        if (exchange.result.isError) incrementError();
      }
    } finally {
      setBusy(false);
    }
  }, [
    callTool,
    clearError,
    incrementError,
    incrementWarning,
    selectedTool,
    setBusy,
    setExchange,
    toolState.metadata,
    validateTool,
  ]);

  const onConnectWithToken = useCallback(() => {
    if (connectionState.selectedGateway && connectionState.authToken.trim()) {
      resetTools();
      void loadConnectedTools(() =>
        reconnectWithToken(connectionState.authToken.trim()),
      );
    }
  }, [
    connectionState.authToken,
    connectionState.selectedGateway,
    loadConnectedTools,
    reconnectWithToken,
    resetTools,
  ]);

  return {
    state: { ...connectionState, ...toolState },
    resources: connection.resources,
    extensions: connection.extensions,
    registrations: connection.registrations,
    refreshTools,
    selectTool,
    validate,
    runTool,
    addMetadata,
    updateMetadata,
    removeMetadata,
    onRawValueChange: setRawValue,
    onGatewayChange,
    onProtocolChange,
    reconnect,
    onConnectWithToken,
    setAuthToken,
    setShowAuthToken,
    setAuthOpen,
    setSearch,
    setOutputTab,
  };
};
