import { McpTool } from './client';
import { initialToolState, toolReducer } from './toolState';

describe('toolReducer', () => {
  const tool: McpTool = {
    name: 'echo',
    inputSchema: { properties: { message: { type: 'string' } } },
  };

  it('resets the selected tool state while preserving the search', () => {
    const selected = toolReducer(
      { ...initialToolState, search: 'echo' },
      { type: 'SELECT', name: tool.name, rawValues: {} },
    );
    const reset = toolReducer(selected, { type: 'RESET' });

    expect(reset.search).toBe('echo');
    expect(reset.selectedToolName).toBe('');
    expect(reset.metadata).toEqual([]);
    expect(reset.exchange).toBeUndefined();
  });

  it('updates only the changed input value', () => {
    const state = toolReducer(
      { ...initialToolState, rawValues: { first: 'one' } },
      { type: 'SET_VALUE', name: 'second', value: 'two' },
    );

    expect(state.rawValues).toEqual({ first: 'one', second: 'two' });
  });
});
