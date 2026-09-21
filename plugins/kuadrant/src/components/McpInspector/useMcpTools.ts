import { useCallback, useReducer, useRef } from 'react';
import { McpExchange, McpTool, ToolsCallResult } from './client';
import { initialToolState, toolReducer } from './toolState';
import { validateToolInput } from './utils';

export const useMcpTools = () => {
  const [state, dispatch] = useReducer(toolReducer, initialToolState);
  const metadataId = useRef(1);
  const selectedTool = state.tools.find(
    (tool) => tool.name === state.selectedToolName,
  );

  const reset = useCallback(() => dispatch({ type: 'RESET' }), []);
  const setTools = useCallback(
    (tools: McpTool[]) => dispatch({ type: 'SET_TOOLS', tools }),
    [],
  );
  const selectTool = useCallback((tool: McpTool) => {
    const rawValues = Object.fromEntries(
      Object.entries(tool.inputSchema?.properties || {})
        .filter(([, schema]) => schema.default !== undefined)
        .map(([name, schema]) => [
          name,
          typeof schema.default === 'object'
            ? JSON.stringify(schema.default)
            : String(schema.default),
        ]),
    );
    dispatch({ type: 'SELECT', name: tool.name, rawValues });
  }, []);
  const setSearch = useCallback(
    (search: string) => dispatch({ type: 'SET_SEARCH', search }),
    [],
  );
  const setRawValue = useCallback(
    (name: string, value: string) =>
      dispatch({ type: 'SET_VALUE', name, value }),
    [],
  );
  const addMetadata = useCallback(() => {
    dispatch({
      type: 'ADD_METADATA',
      row: { id: metadataId.current++, key: '', value: '' },
    });
  }, []);
  const updateMetadata = useCallback(
    (id: number, field: 'key' | 'value', value: string) =>
      dispatch({ type: 'UPDATE_METADATA', id, field, value }),
    [],
  );
  const removeMetadata = useCallback(
    (id: number) => dispatch({ type: 'REMOVE_METADATA', id }),
    [],
  );
  const setOutputTab = useCallback(
    (tab: number) => dispatch({ type: 'SET_OUTPUT_TAB', tab }),
    [],
  );
  const setBusy = useCallback(
    (busy: boolean) => dispatch({ type: 'SET_BUSY', busy }),
    [],
  );
  const setExchange = useCallback(
    (exchange?: McpExchange<ToolsCallResult>) =>
      dispatch({ type: 'SET_EXCHANGE', exchange }),
    [],
  );
  const validate = useCallback(() => {
    const result = validateToolInput(
      selectedTool?.inputSchema,
      state.rawValues,
    );
    dispatch({ type: 'SET_FIELD_ERRORS', errors: result.errors });
    dispatch({
      type: 'SET_VALIDATION_MESSAGE',
      message: Object.keys(result.errors).length > 0 ? '' : 'Input is valid',
    });
    return result;
  }, [selectedTool, state.rawValues]);

  return {
    state,
    selectedTool,
    reset,
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
    validate,
  };
};
